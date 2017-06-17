"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class $ extends Object {
    static values(obj) {
        return Object.keys(obj).map(e => obj[e]);
    }
    static count(obj, s) {
        return Object.keys(obj).filter(e => { if (e.indexOf(s) === 0)
            return e; }).length;
    }
    static getKey(obj, v) {
        for (let k in obj) {
            if (obj[k] === v)
                return k;
        }
        return null;
    }
}
exports.$ = $;
