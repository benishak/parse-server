"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Promise = require("bluebird");
// durable cache no ttl!
class Cache {
    constructor() {
        this.cache = {};
    }
    put(key, value, override = false) {
        if (this.cache[key] == undefined || override == true) {
            this.cache[key] = value;
        }
        else if (this.cache[key].constructor === Array) {
            this.cache[key] = this.cache[key].concat(value);
        }
        else if (this.cache[key].constructor === Object) {
            this.cache[key] = Object.assign(this.cache[key], value);
        }
        return Promise.resolve(this.cache[key]);
    }
    get(key, key2 = undefined, key3 = undefined) {
        if (key2 && key3 && this.cache[key] && this.cache[key2]) {
            return Promise.resolve(this.cache[key][key2][key3]);
        }
        if (key2 && !key3 && this.cache[key]) {
            return Promise.resolve(this.cache[key][key2]);
        }
        return Promise.resolve(this.cache[key]);
    }
    del(key) {
        delete this.cache[key];
        return Promise.resolve(true);
    }
    flush() {
        this.cache = {};
        return Promise.resolve(true);
    }
}
const _Cache = new Cache();
exports._Cache = _Cache;
