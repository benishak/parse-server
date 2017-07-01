"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) if (e.indexOf(p[i]) < 0)
            t[p[i]] = s[p[i]];
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
const aws_sdk_1 = require("aws-sdk");
const Promise = require("bluebird");
const Transform = require("parse-server/lib/Adapters/Storage/Mongo/MongoTransform");
const Partition_1 = require("./Partition");
const Cache_1 = require("./Cache");
const SchemaPartition_1 = require("./SchemaPartition");
const node_1 = require("parse/node");
const lodash_1 = require("lodash");
const schemaPartition = '_SCHEMA';
// not used at the moment but can be helpful in the future!
const DynamoType = type => {
    switch (type.type) {
        case 'String': return 'S'; // string
        case 'Date': return 'S'; // string
        case 'Object': return 'M'; // object
        case 'File': return 'M'; // object
        case 'Boolean': return 'BOOL'; // boolean
        case 'Pointer': return 'S'; // string
        case 'Relation': return 'M'; // string
        case 'Number': return 'N'; // number
        case 'GeoPoint': return 'M'; // object
        case 'Array':
            if (type.contents && type.contents.type === 'String') {
                return 'SS'; // string[]
            }
            else if (type.contents && type.contents.type === 'Number') {
                return 'NS'; // number[]
            }
            else {
                return 'L'; // array
            }
        default: throw `no type for ${JSON.stringify(type)} yet`;
    }
};
Transform.convertParseSchemaToMongoSchema = (_a) => {
    var schema = __rest(_a, []);
    delete schema.fields._rperm;
    delete schema.fields._wperm;
    if (schema.className === '_User') {
        delete schema.fields._hashed_password;
    }
    return schema;
};
Transform.mongoSchemaFromFieldsAndClassNameAndCLP = (fields, className, classLevelPermissions) => {
    const mongoObject = {
        _id: className,
        objectId: 'string',
        updatedAt: 'string',
        createdAt: 'string'
    };
    for (const fieldName in fields) {
        mongoObject[fieldName] = SchemaPartition_1.parseFieldTypeToMongoFieldType(fields[fieldName]);
    }
    if (typeof classLevelPermissions !== 'undefined') {
        mongoObject['_metadata'] = mongoObject['_metadata'] || {};
        if (!classLevelPermissions) {
            delete mongoObject['_metadata'].class_permissions;
        }
        else {
            mongoObject['_metadata'].class_permissions = classLevelPermissions;
        }
    }
    return mongoObject;
};
Transform.transformToParseObject = (className, mongoObject, schema) => {
    const object = Transform.mongoObjectToParseObject(className, mongoObject, schema);
    if (object instanceof Object) {
        Object.keys(schema.fields || {}).forEach(k => {
            if ((schema.fields[k].type || '').toLowerCase() == 'date' && typeof object[k] == 'string' && ['createdAt', 'updatedAt'].indexOf(k) == -1) {
                object[k] = node_1.Parse._encode(new Date(object[k]));
            }
        });
        if (className == '_User') {
            if (object['_password_changed_at']) {
                object['_password_changed_at'] = node_1.Parse._encode(new Date(object['_password_changed_at']));
            }
            if (object['_email_verify_token_expires_at']) {
                object['_email_verify_token_expires_at'] = node_1.Parse._encode(new Date(object['_email_verify_token_expires_at']));
            }
        }
    }
    return object;
};
class Adapter {
    constructor(database, settings) {
        this.database = database,
            this.settings = settings;
        this.service = new aws_sdk_1.DynamoDB(this.settings);
    }
    connect() {
        return Promise.resolve();
    }
    _adaptiveCollection(name) {
        return new Partition_1.Partition(this.database, name, this.service);
    }
    _schemaCollection() {
        return new SchemaPartition_1.SchemaPartition(this.database, schemaPartition, this.service);
    }
    classExists(name) {
        return this._schemaCollection().find({ _id: name }).then(partition => partition.length > 0);
    }
    setClassLevelPermissions(className, CLPs) {
        return this._schemaCollection().updateSchema(className, {
            $set: { _metadata: { class_permissions: CLPs } }
        });
    }
    createClass(className, schema) {
        return this.classExists(className).then(partition => {
            if (!partition) {
                schema = Transform.convertParseSchemaToMongoSchema(schema);
                const mongoObject = Transform.mongoSchemaFromFieldsAndClassNameAndCLP(schema.fields, className, schema.classLevelPermissions);
                mongoObject._id = className;
                return this._schemaCollection().insertOne(mongoObject)
                    .then(result => {
                    return SchemaPartition_1.mongoSchemaToParseSchema(result.ops[0]);
                })
                    .catch(error => { throw new error; });
            }
            else {
                throw new node_1.Parse.Error(node_1.Parse.Error.DUPLICATE_VALUE, 'Class already exists.');
            }
        }).catch(error => { throw error; });
    }
    addFieldIfNotExists(className, fieldName, type) {
        return this._schemaCollection().addFieldIfNotExists(className, fieldName, type);
    }
    deleteClass(className) {
        // only drop Schema!
        return this._schemaCollection().findAndDeleteSchema(className);
    }
    deleteAllClasses() {
        // only for test
        const params = {
            AttributeDefinitions: [
                {
                    AttributeName: "_pk_className",
                    AttributeType: "S"
                },
                {
                    AttributeName: "_sk_id",
                    AttributeType: "S"
                }
            ],
            KeySchema: [
                {
                    AttributeName: "_pk_className",
                    KeyType: "HASH"
                },
                {
                    AttributeName: "_sk_id",
                    KeyType: "RANGE"
                }
            ],
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            },
            TableName: this.database
        };
        return Cache_1._Cache.flush().then(() => {
            return this.service.describeTable({ TableName: this.database }).promise();
        }).then(() => {
            return this.service.scan({ TableName: this.database, AttributesToGet: ['_pk_className', '_sk_id'] }).promise();
        }).then((data) => {
            if (data.Items.length > 0) {
                return Promise.reduce(data.Items, (acc, item) => {
                    return this.service.deleteItem({ TableName: this.database, Key: item }).promise();
                });
            }
            else {
                return Promise.resolve();
            }
        }).then(() => {
            return Promise.resolve();
        }).catch((err) => {
            Promise.reject(err);
        });
    }
    deleteFields(className, schema, fieldNames) {
        // remove fields only from Schema
        let update = {};
        fieldNames.forEach(field => {
            update[field] = undefined;
        });
        return this._schemaCollection().updateSchema(className, update);
    }
    getAllClasses() {
        return this._schemaCollection()._fetchAllSchemasFrom_SCHEMA();
    }
    getClass(className) {
        return this._schemaCollection()._fetchOneSchemaFrom_SCHEMA(className);
    }
    transformDateObject(object = {}) {
        Object.keys(object).forEach(key => {
            if (object[key] instanceof Date) {
                object[key] = object[key].toISOString();
            }
            if (object[key] instanceof Object) {
                if (object[key].hasOwnProperty('__type')) {
                    if ((object[key].__type || "").toLowerCase() == 'date') {
                        object[key] = new Date(object[key].iso || new Date());
                        try {
                            object[key] = object[key].toISOString();
                        }
                        catch (err) {
                            throw err;
                        }
                    }
                }
                else {
                    object[key] = this.transformDateObject(object[key]);
                }
            }
        });
        return object;
    }
    createObject(className, schema, object) {
        schema = Transform.convertParseSchemaToMongoSchema(schema);
        object = Transform.parseObjectToMongoObjectForCreate(className, object, schema);
        object = object = this.transformDateObject(object);
        return this._adaptiveCollection(className).ensureUniqueness(object)
            .then(count => {
            if (count === 0) {
                return this._adaptiveCollection(className).insertOne(object);
            }
            else {
                throw new node_1.Parse.Error(node_1.Parse.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
            }
        })
            .catch(error => { throw error; });
    }
    deleteObjectsByQuery(className, schema, query) {
        schema = Transform.convertParseSchemaToMongoSchema(schema);
        query = Transform.transformWhere(className, query, schema);
        query = this.transformDateObject(query);
        return this._adaptiveCollection(className).deleteMany(query)
            .then(result => {
            if (result.n === 0) {
                throw new node_1.Parse.Error(node_1.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
            }
            return Promise.resolve();
        })
            .catch(error => { throw error; });
    }
    updateObjectsByQuery(className, schema, query, update) {
        schema = Transform.convertParseSchemaToMongoSchema(schema);
        update = Transform.transformUpdate(className, update, schema);
        update = this.transformDateObject(update);
        query = Transform.transformWhere(className, query, schema);
        query = this.transformDateObject(query);
        return this._adaptiveCollection(className).ensureUniqueness(update['$set'])
            .then(count => {
            if (count === 0) {
                return this._adaptiveCollection(className).updateMany(query, update);
            }
            else {
                throw new node_1.Parse.Error(node_1.Parse.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
            }
        })
            .catch(error => { throw error; });
    }
    findOneAndUpdate(className, schema, query, update, upsert = false) {
        schema = Transform.convertParseSchemaToMongoSchema(schema);
        update = Transform.transformUpdate(className, update, schema);
        update = this.transformDateObject(update);
        query = Transform.transformWhere(className, query, schema);
        query = this.transformDateObject(query);
        return this._adaptiveCollection(className).ensureUniqueness(update['$set'])
            .then(count => {
            if (count === 0) {
                return this._adaptiveCollection(className).updateOne(query, update, upsert);
            }
            else {
                throw new node_1.Parse.Error(node_1.Parse.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
            }
        })
            .then(result => Transform.transformToParseObject(className, result.value, schema))
            .catch(error => { throw error; });
    }
    upsertOneObject(className, schema, query, update) {
        schema = Transform.convertParseSchemaToMongoSchema(schema);
        update = Transform.transformUpdate(className, update, schema);
        update = this.transformDateObject(update);
        query = Transform.transformWhere(className, query, schema);
        query = this.transformDateObject(query);
        return this._adaptiveCollection(className).ensureUniqueness(update['$set'])
            .then(count => {
            if (count === 0) {
                return this._adaptiveCollection(className).upsertOne(query, update);
            }
            else {
                throw new node_1.Parse.Error(node_1.Parse.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
            }
        })
            .catch(error => { throw error; });
    }
    find(className, schema = {}, query = {}, options = {}) {
        let { skip, limit, sort, keys } = options;
        schema = Transform.convertParseSchemaToMongoSchema(schema);
        query = Transform.transformWhere(className, query, schema);
        query = this.transformDateObject(query);
        sort = lodash_1._.mapKeys(sort, (value, fieldName) => Transform.transformKey(className, fieldName, schema));
        keys = lodash_1._.reduce(keys, (memo, key) => {
            memo[Transform.transformKey(className, key, schema)] = 1;
            return memo;
        }, {});
        return this._adaptiveCollection(className).find(query, { skip, limit, sort, keys })
            .then(objects => objects.map(object => Transform.transformToParseObject(className, object, schema)));
    }
    _rawFind(className, query = {}) {
        return this._adaptiveCollection(className).find(query)
            .catch(error => { throw error; });
    }
    ensureUniqueness(className, schema, fieldNames) {
        fieldNames = fieldNames.map(fieldName => Transform.transformKey(className, fieldName, schema));
        return new Promise((resolve, reject) => {
            this._adaptiveCollection('_UNIQUE_INDEX_')
                .upsertOne({ _id: className }, { $set: { fields: fieldNames } }).then(res => {
                if (res.value) {
                    Cache_1._Cache.put('UNIQUE', { [className]: fieldNames });
                    resolve();
                }
                else {
                    throw new node_1.Parse.Error(1, 'DynamoDB cannot create this Index');
                }
            }).catch(error => { throw error; });
        });
    }
    count(className, schema, query) {
        schema = Transform.convertParseSchemaToMongoSchema(schema);
        query = this.transformDateObject(query);
        query = Transform.transformWhere(className, query, schema);
        query = this.transformDateObject(query);
        return this._adaptiveCollection(className).count(query);
    }
    performInitialization() {
        return Promise.resolve();
    }
    createIndex(className, index) {
        return Promise.resolve();
    }
}
exports.Adapter = Adapter;
