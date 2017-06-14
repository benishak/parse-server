"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const DynamoPartition_1 = require("./DynamoPartition");
const DynamoAdapter_1 = require("./DynamoAdapter");
class DynamoDB {
    constructor(database, settings) {
        this.database = database;
        this.settings = settings;
        this.database = database;
        this.settings = settings;
        this.Partition = DynamoPartition_1.Partition;
        this.Query = DynamoPartition_1.FilterExpression;
    }
    getAdapter() {
        if (this.Adapter) {
            return this.Adapter;
        }
        this.Adapter = new DynamoAdapter_1.Adapter(this.database, this.settings);
        return this.Adapter;
    }
}
exports.DynamoDB = DynamoDB;
