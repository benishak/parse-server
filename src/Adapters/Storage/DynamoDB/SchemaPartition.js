"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const DynamoPartition_1 = require("./DynamoPartition");
const nonFieldSchemaKeys = ['_id', '_metadata', '_client_permissions'];
const emptyCLPS = Object.freeze({
    find: {},
    get: {},
    create: {},
    update: {},
    delete: {},
    addField: {},
});
const defaultCLPS = Object.freeze({
    find: { '*': true },
    get: { '*': true },
    create: { '*': true },
    update: { '*': true },
    delete: { '*': true },
    addField: { '*': true },
});
function mongoFieldToParseSchemaField(type) {
    if (type[0] === '*') {
        return {
            type: 'Pointer',
            targetClass: type.slice(1),
        };
    }
    if (type.startsWith('relation<')) {
        return {
            type: 'Relation',
            targetClass: type.slice('relation<'.length, type.length - 1),
        };
    }
    switch (type) {
        case 'number': return { type: 'Number' };
        case 'string': return { type: 'String' };
        case 'boolean': return { type: 'Boolean' };
        case 'date': return { type: 'Date' };
        case 'map':
        case 'object': return { type: 'Object' };
        case 'array': return { type: 'Array' };
        case 'geopoint': return { type: 'GeoPoint' };
        case 'file': return { type: 'File' };
        case 'bytes': return { type: 'Bytes' };
    }
}
exports.mongoFieldToParseSchemaField = mongoFieldToParseSchemaField;
function mongoSchemaFieldsToParseSchemaFields(schema) {
    var fieldNames = Object.keys(schema).filter(key => nonFieldSchemaKeys.indexOf(key) === -1);
    var response = fieldNames.reduce((obj, fieldName) => {
        obj[fieldName] = mongoFieldToParseSchemaField(schema[fieldName]);
        return obj;
    }, {});
    response['ACL'] = { type: 'ACL' };
    response['createdAt'] = { type: 'Date' };
    response['updatedAt'] = { type: 'Date' };
    response['objectId'] = { type: 'String' };
    return response;
}
exports.mongoSchemaFieldsToParseSchemaFields = mongoSchemaFieldsToParseSchemaFields;
function mongoSchemaToParseSchema(mongoSchema) {
    let clps = defaultCLPS;
    if (mongoSchema._metadata && mongoSchema._metadata.class_permissions) {
        clps = Object.assign({}, emptyCLPS, mongoSchema._metadata.class_permissions);
    }
    return {
        className: mongoSchema._id,
        fields: mongoSchemaFieldsToParseSchemaFields(mongoSchema),
        classLevelPermissions: clps,
    };
}
exports.mongoSchemaToParseSchema = mongoSchemaToParseSchema;
function _mongoSchemaQueryFromNameQuery(name, query = {}) {
    const object = { _id: name };
    if (query) {
        Object.keys(query).forEach(key => {
            object[key] = query[key];
        });
    }
    return object;
}
exports._mongoSchemaQueryFromNameQuery = _mongoSchemaQueryFromNameQuery;
function parseFieldTypeToMongoFieldType({ type, targetClass = null }) {
    switch (type) {
        case 'Pointer': return `*${targetClass}`;
        case 'Relation': return `relation<${targetClass}>`;
        case 'Number': return 'number';
        case 'String': return 'string';
        case 'Boolean': return 'boolean';
        case 'Date': return 'date';
        case 'Object': return 'object';
        case 'Array': return 'array';
        case 'GeoPoint': return 'geopoint';
        case 'File': return 'file';
        case 'Bytes': return 'bytes';
    }
}
exports.parseFieldTypeToMongoFieldType = parseFieldTypeToMongoFieldType;
class SchemaPartition extends DynamoPartition_1.Partition {
    _fetchAllSchemasFrom_SCHEMA() {
        return this.find().then(schemas => schemas.map(mongoSchemaToParseSchema)).catch(error => { throw error; });
    }
    _fechOneSchemaFrom_SCHEMA(name) {
        let query = _mongoSchemaQueryFromNameQuery(name);
        return this.find(query, { limit: 1 }).then(result => {
            if (result) {
                return mongoSchemaToParseSchema(result);
            }
            else {
                return [];
            }
        });
    }
    findAndDeleteSchema(name) {
        return this.deleteOne({ _id: name });
    }
    updateSchema(name, query, update) {
        let _query = _mongoSchemaQueryFromNameQuery(name, query);
        return this.updateOne(_query, update);
    }
    upsertSchema(name, query, update) {
        return this.updateSchema(name, query, update);
    }
    addFieldIfNotExists(className, fieldName, type) {
        let query = _mongoSchemaQueryFromNameQuery(className);
        return this.upsertOne(query, {
            [fieldName]: parseFieldTypeToMongoFieldType(type)
        }).catch(error => { throw error; });
    }
}
exports.SchemaPartition = SchemaPartition;
