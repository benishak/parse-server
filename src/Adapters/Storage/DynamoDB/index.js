"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Partition_1 = require("./Partition");
const Expression_1 = require("./Expression");
const Adapter_1 = require("./Adapter");
class DynamoDB {
    constructor(database, settings) {
        this.database = database;
        this.settings = settings;
        this.database = database;
        this.settings = settings;
        this.Partition = Partition_1.Partition;
        this.Expression = Expression_1.Expression;
    }
    getAdapter() {
        if (this.Adapter) {
            return this.Adapter;
        }
        this.Adapter = new Adapter_1.Adapter(this.database, this.settings);
        return this.Adapter;
    }
}
exports.DynamoDB = DynamoDB;
