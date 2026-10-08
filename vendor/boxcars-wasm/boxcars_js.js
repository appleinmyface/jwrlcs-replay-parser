
let imports = {};
imports['__wbindgen_placeholder__'] = module.exports;
let wasm;
const { TextDecoder } = require(`util`);

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode();

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_export_1.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}
/**
 * @enum {0 | 1 | 2}
 */
module.exports.CrcCheck = Object.freeze({
    Always: 0, "0": "Always",
    Never: 1, "1": "Never",
    OnError: 2, "2": "OnError",
});
/**
 * @enum {0 | 1 | 2}
 */
module.exports.NetworkParse = Object.freeze({
    Always: 0, "0": "Always",
    Never: 1, "1": "Never",
    IgnoreOnError: 2, "2": "IgnoreOnError",
});

const BoxcarsParserFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_boxcarsparser_free(ptr >>> 0, 1));

class BoxcarsParser {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(BoxcarsParser.prototype);
        obj.__wbg_ptr = ptr;
        BoxcarsParserFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BoxcarsParserFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_boxcarsparser_free(ptr, 0);
    }
    /**
     * @param {Uint8Array} data
     */
    constructor(data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.boxcarsparser_new(ptr0, len0);
        this.__wbg_ptr = ret >>> 0;
        BoxcarsParserFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {CrcCheck} check
     * @returns {BoxcarsParser}
     */
    setCrcCheck(check) {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.boxcarsparser_setCrcCheck(ptr, check);
        return BoxcarsParser.__wrap(ret);
    }
    /**
     * @param {NetworkParse} parse
     * @returns {BoxcarsParser}
     */
    setNetworkParse(parse) {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.boxcarsparser_setNetworkParse(ptr, parse);
        return BoxcarsParser.__wrap(ret);
    }
    /**
     * @returns {any}
     */
    parse() {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.boxcarsparser_parse(ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
}
module.exports.BoxcarsParser = BoxcarsParser;

module.exports.__wbg_parse_4810ea4caba91949 = function(arg0, arg1) {
    let deferred0_0;
    let deferred0_1;
    try {
        deferred0_0 = arg0;
        deferred0_1 = arg1;
        const ret = JSON.parse(getStringFromWasm0(arg0, arg1));
        return ret;
    } finally {
        wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
    }
};

module.exports.__wbindgen_init_externref_table = function() {
    const table = wasm.__wbindgen_export_1;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
    ;
};

module.exports.__wbindgen_string_new = function(arg0, arg1) {
    const ret = getStringFromWasm0(arg0, arg1);
    return ret;
};

module.exports.__wbindgen_throw = function(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
};

const path = require('path').join(__dirname, 'boxcars_js_bg.wasm');
const bytes = require('fs').readFileSync(path);

const wasmModule = new WebAssembly.Module(bytes);
const wasmInstance = new WebAssembly.Instance(wasmModule, imports);
wasm = wasmInstance.exports;
module.exports.__wasm = wasm;

wasm.__wbindgen_start();

