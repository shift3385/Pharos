/* @ds-bundle: {"namespace":"Pharos","components":[{"name":"CheckboxGroup","sourcePath":"components/forms/CheckboxGroup/CheckboxGroup.jsx"},{"name":"ConfirmDialog","sourcePath":"components/overlays/ConfirmDialog/ConfirmDialog.jsx"},{"name":"DeleteButton","sourcePath":"components/forms/DeleteButton/DeleteButton.jsx"},{"name":"Dialog","sourcePath":"components/overlays/Dialog/Dialog.jsx"},{"name":"EmptySection","sourcePath":"components/feedback/EmptySection/EmptySection.jsx"},{"name":"ErrorBoundary","sourcePath":"components/feedback/ErrorBoundary/ErrorBoundary.jsx"},{"name":"ErrorFallback","sourcePath":"components/feedback/ErrorFallback/ErrorFallback.jsx"},{"name":"ErrorSummary","sourcePath":"components/forms/ErrorSummary/ErrorSummary.jsx"},{"name":"FieldMessage","sourcePath":"components/forms/FieldMessage/FieldMessage.jsx"},{"name":"FormField","sourcePath":"components/forms/FormField/FormField.jsx"},{"name":"ImportReportModal","sourcePath":"components/overlays/ImportReportModal/ImportReportModal.jsx"},{"name":"LanguageToggle","sourcePath":"components/i18n/LanguageToggle/LanguageToggle.jsx"},{"name":"ListField","sourcePath":"components/forms/ListField/ListField.jsx"},{"name":"Logo","sourcePath":"components/brand/Logo/Logo.jsx"},{"name":"PairListField","sourcePath":"components/forms/PairListField/PairListField.jsx"},{"name":"ThemeProvider","sourcePath":"components/theme/ThemeProvider/ThemeProvider.jsx"},{"name":"ThemeToggle","sourcePath":"components/theme/ThemeToggle/ThemeToggle.jsx"},{"name":"ToastProvider","sourcePath":"components/feedback/ToastProvider/ToastProvider.jsx"}],"sourceHashes":{"components/forms/CheckboxGroup/CheckboxGroup.jsx":"be4782a22dc0","components/forms/CheckboxGroup/CheckboxGroup.d.ts":"6522858b05c9","components/forms/CheckboxGroup/CheckboxGroup.prompt.md":"e350409006c8","components/overlays/ConfirmDialog/ConfirmDialog.jsx":"099103b94732","components/overlays/ConfirmDialog/ConfirmDialog.d.ts":"2eb37c4ca3b7","components/overlays/ConfirmDialog/ConfirmDialog.prompt.md":"59805e40d133","components/forms/DeleteButton/DeleteButton.jsx":"7a1727a8f0c8","components/forms/DeleteButton/DeleteButton.d.ts":"c8992ac15b7f","components/forms/DeleteButton/DeleteButton.prompt.md":"54241252f65e","components/overlays/Dialog/Dialog.jsx":"4ee4a0bd857f","components/overlays/Dialog/Dialog.d.ts":"0dd185cb4637","components/overlays/Dialog/Dialog.prompt.md":"84996ac520c3","components/feedback/EmptySection/EmptySection.jsx":"b87bbd72fd27","components/feedback/EmptySection/EmptySection.d.ts":"9c4d83fba8b6","components/feedback/EmptySection/EmptySection.prompt.md":"f293d49b1a21","components/feedback/ErrorBoundary/ErrorBoundary.jsx":"eb5d1cfc1ac8","components/feedback/ErrorBoundary/ErrorBoundary.d.ts":"9cedc753772b","components/feedback/ErrorBoundary/ErrorBoundary.prompt.md":"081ddc199e59","components/feedback/ErrorFallback/ErrorFallback.jsx":"7bb73a82b6db","components/feedback/ErrorFallback/ErrorFallback.d.ts":"2347338c4abd","components/feedback/ErrorFallback/ErrorFallback.prompt.md":"c85d53239309","components/forms/ErrorSummary/ErrorSummary.jsx":"439542427b9b","components/forms/ErrorSummary/ErrorSummary.d.ts":"690fb3823bb6","components/forms/ErrorSummary/ErrorSummary.prompt.md":"15171c762761","components/forms/FieldMessage/FieldMessage.jsx":"97570480fc7d","components/forms/FieldMessage/FieldMessage.d.ts":"3a9e3892d9bd","components/forms/FieldMessage/FieldMessage.prompt.md":"29d051501a3d","components/forms/FormField/FormField.jsx":"976395f21ac5","components/forms/FormField/FormField.d.ts":"544a0e0346de","components/forms/FormField/FormField.prompt.md":"f76e745ccfa3","components/overlays/ImportReportModal/ImportReportModal.jsx":"147dd2bb1243","components/overlays/ImportReportModal/ImportReportModal.d.ts":"48ad33a72cb6","components/overlays/ImportReportModal/ImportReportModal.prompt.md":"fdc829281bab","components/i18n/LanguageToggle/LanguageToggle.jsx":"3585ec4e1cda","components/i18n/LanguageToggle/LanguageToggle.d.ts":"4c8810bbae0e","components/i18n/LanguageToggle/LanguageToggle.prompt.md":"4f536d68e439","components/forms/ListField/ListField.jsx":"c0f0e73102e2","components/forms/ListField/ListField.d.ts":"186ff2499580","components/forms/ListField/ListField.prompt.md":"b1936b3a5217","components/brand/Logo/Logo.jsx":"5c2a21778e58","components/brand/Logo/Logo.d.ts":"47caafab6d4c","components/brand/Logo/Logo.prompt.md":"9b61ea9823a6","components/forms/PairListField/PairListField.jsx":"4ef8da94c45c","components/forms/PairListField/PairListField.d.ts":"e2fa099eb7dd","components/forms/PairListField/PairListField.prompt.md":"fa0e3497d26d","components/theme/ThemeProvider/ThemeProvider.jsx":"b5de8e5b9586","components/theme/ThemeProvider/ThemeProvider.d.ts":"3e14270e48ff","components/theme/ThemeProvider/ThemeProvider.prompt.md":"bc4633437b8a","components/theme/ThemeToggle/ThemeToggle.jsx":"768759c41b1c","components/theme/ThemeToggle/ThemeToggle.d.ts":"2931cc44c8e5","components/theme/ThemeToggle/ThemeToggle.prompt.md":"0d49ecec791f","components/feedback/ToastProvider/ToastProvider.jsx":"fe929154d09f","components/feedback/ToastProvider/ToastProvider.d.ts":"21fe76232cb0","components/feedback/ToastProvider/ToastProvider.prompt.md":"c9376d5ddcf2"},"inlinedExternals":[],"builtBy":"cc-design-sync"} */
"use strict";
var Pharos = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require3() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // <define:import.meta.env>
  var init_define_import_meta_env = __esm({
    "<define:import.meta.env>"() {
    }
  });

  // shim:react-shim
  var require_react_shim = __commonJS({
    "shim:react-shim"(exports, module) {
      init_define_import_meta_env();
      var R = window.React;
      function np(p, k) {
        var o = {};
        for (var x in p) if (x !== "children") o[x] = p[x];
        if (k !== void 0) o.key = k;
        return o;
      }
      function jsx14(t2, p, k) {
        var c = p && p.children;
        return c === void 0 ? R.createElement(t2, np(p, k)) : R.createElement(t2, np(p, k), c);
      }
      function jsxs10(t2, p, k) {
        return R.createElement.apply(R, [t2, np(p, k)].concat(p.children));
      }
      module.exports = R;
      module.exports.jsx = jsx14;
      module.exports.jsxs = jsxs10;
      module.exports.jsxDEV = function(t2, p, k, s) {
        return (s ? jsxs10 : jsx14)(t2, p, k);
      };
      module.exports.Fragment = R.Fragment;
    }
  });

  // .ds-sync/pharos-ds/dist/index.js
  var index_exports = {};
  __export(index_exports, {
    CheckboxGroup: () => CheckboxGroup,
    ConfirmDialog: () => ConfirmDialog,
    DeleteButton: () => DeleteButton,
    Dialog: () => Dialog,
    EmptySection: () => EmptySection,
    ErrorBoundary: () => ErrorBoundary,
    ErrorFallback: () => ErrorFallback,
    ErrorSummary: () => ErrorSummary,
    FieldMessage: () => FieldMessage,
    FormField: () => FormField,
    ImportReportModal: () => ImportReportModal,
    LanguageToggle: () => LanguageToggle,
    ListField: () => ListField,
    Logo: () => Logo,
    PairListField: () => PairListField,
    ThemeProvider: () => ThemeProvider,
    ThemeToggle: () => ThemeToggle,
    ToastProvider: () => ToastProvider,
    compact: () => compact,
    controlProps: () => controlProps,
    dateOrder: () => dateOrder,
    format: () => format,
    hasBlocking: () => hasBlocking,
    i18n: () => i18n_default,
    notify: () => notify,
    numberInRange: () => numberInRange,
    required: () => required,
    useSaveGuard: () => useSaveGuard,
    useTheme: () => useTheme,
    useToast: () => useToast
  });
  init_define_import_meta_env();
  var import_react = __toESM(require_react_shim(), 1);
  var import_react2 = __toESM(require_react_shim(), 1);
  var import_react3 = __toESM(require_react_shim(), 1);
  var import_react4 = __toESM(require_react_shim(), 1);
  var import_react5 = __toESM(require_react_shim(), 1);
  var import_react6 = __toESM(require_react_shim(), 1);
  var import_react7 = __toESM(require_react_shim(), 1);
  var import_react8 = __toESM(require_react_shim(), 1);
  var import_react9 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime = __toESM(require_react_shim(), 1);
  var import_react10 = __toESM(require_react_shim(), 1);
  var import_react11 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime2 = __toESM(require_react_shim(), 1);
  var import_react12 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime3 = __toESM(require_react_shim(), 1);
  var import_react13 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime4 = __toESM(require_react_shim(), 1);
  var import_react14 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime5 = __toESM(require_react_shim(), 1);
  var import_react15 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime6 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime7 = __toESM(require_react_shim(), 1);
  var import_react16 = __toESM(require_react_shim(), 1);
  var import_react17 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime8 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime9 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime10 = __toESM(require_react_shim(), 1);
  var import_react18 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime11 = __toESM(require_react_shim(), 1);
  var import_react19 = __toESM(require_react_shim(), 1);
  var import_react20 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime12 = __toESM(require_react_shim(), 1);
  var import_react21 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime13 = __toESM(require_react_shim(), 1);
  var __create2 = Object.create;
  var __defProp2 = Object.defineProperty;
  var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames2 = Object.getOwnPropertyNames;
  var __getProtoOf2 = Object.getPrototypeOf;
  var __hasOwnProp2 = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp2(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __require2 = /* @__PURE__ */ ((x) => typeof __require !== "undefined" ? __require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof __require !== "undefined" ? __require : a)[b]
  }) : x)(function(x) {
    if (typeof __require !== "undefined") return __require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __esm2 = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames2(fn)[0]])(fn = 0)), res;
    } catch (e2) {
      throw err = [e2], e2;
    }
  };
  var __commonJS2 = (cb, mod) => function __require22() {
    try {
      return mod || (0, cb[__getOwnPropNames2(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e2) {
      throw mod = 0, e2;
    }
  };
  var __copyProps2 = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames2(from))
        if (!__hasOwnProp2.call(to, key) && key !== except)
          __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM2 = (mod, isNodeMode, target) => (target = mod != null ? __create2(__getProtoOf2(mod)) : {}, __copyProps2(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp2(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  var require_void_elements = __commonJS2({
    "node_modules/void-elements/index.js"(exports, module) {
      "use strict";
      module.exports = {
        "area": true,
        "base": true,
        "br": true,
        "col": true,
        "embed": true,
        "hr": true,
        "img": true,
        "input": true,
        "link": true,
        "meta": true,
        "param": true,
        "source": true,
        "track": true,
        "wbr": true
      };
    }
  });
  function __classPrivateFieldGet(receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
  }
  function __classPrivateFieldSet(receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
  }
  var init_tslib_es6 = __esm2({
    "node_modules/@tauri-apps/api/external/tslib/tslib.es6.js"() {
      "use strict";
    }
  });
  function transformCallback(callback, once = false) {
    return window.__TAURI_INTERNALS__.transformCallback(callback, once);
  }
  async function invoke(cmd, args = {}, options) {
    return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
  }
  var _Channel_onmessage;
  var _Channel_nextMessageIndex;
  var _Channel_pendingMessages;
  var _Channel_messageEndIndex;
  var _Resource_rid;
  var SERIALIZE_TO_IPC_FN;
  var Channel;
  var init_core = __esm2({
    "node_modules/@tauri-apps/api/core.js"() {
      "use strict";
      init_tslib_es6();
      SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";
      Channel = class {
        constructor(onmessage) {
          _Channel_onmessage.set(this, void 0);
          _Channel_nextMessageIndex.set(this, 0);
          _Channel_pendingMessages.set(this, []);
          _Channel_messageEndIndex.set(this, void 0);
          __classPrivateFieldSet(this, _Channel_onmessage, onmessage || (() => {
          }), "f");
          this.id = transformCallback((rawMessage) => {
            const index = rawMessage.index;
            if ("end" in rawMessage) {
              if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
                this.cleanupCallback();
              } else {
                __classPrivateFieldSet(this, _Channel_messageEndIndex, index, "f");
              }
              return;
            }
            const message = rawMessage.message;
            if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
              __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message);
              __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
              while (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") in __classPrivateFieldGet(this, _Channel_pendingMessages, "f")) {
                const message2 = __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
                __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message2);
                delete __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
                __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
              }
              if (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") === __classPrivateFieldGet(this, _Channel_messageEndIndex, "f")) {
                this.cleanupCallback();
              }
            } else {
              __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[index] = message;
            }
          });
        }
        cleanupCallback() {
          window.__TAURI_INTERNALS__.unregisterCallback(this.id);
        }
        set onmessage(handler) {
          __classPrivateFieldSet(this, _Channel_onmessage, handler, "f");
        }
        get onmessage() {
          return __classPrivateFieldGet(this, _Channel_onmessage, "f");
        }
        [(_Channel_onmessage = /* @__PURE__ */ new WeakMap(), _Channel_nextMessageIndex = /* @__PURE__ */ new WeakMap(), _Channel_pendingMessages = /* @__PURE__ */ new WeakMap(), _Channel_messageEndIndex = /* @__PURE__ */ new WeakMap(), SERIALIZE_TO_IPC_FN)]() {
          return `__CHANNEL__:${this.id}`;
        }
        toJSON() {
          return this[SERIALIZE_TO_IPC_FN]();
        }
      };
      _Resource_rid = /* @__PURE__ */ new WeakMap();
    }
  });
  var require_jszip_min = __commonJS2({
    "node_modules/jszip/dist/jszip.min.js"(exports, module) {
      "use strict";
      !(function(e2) {
        if ("object" == typeof exports && "undefined" != typeof module) module.exports = e2();
        else if ("function" == typeof define && define.amd) define([], e2);
        else {
          ("undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof self ? self : this).JSZip = e2();
        }
      })(function() {
        return (function s(a, o, h) {
          function u(r, e3) {
            if (!o[r]) {
              if (!a[r]) {
                var t2 = "function" == typeof __require2 && __require2;
                if (!e3 && t2) return t2(r, true);
                if (l) return l(r, true);
                var n = new Error("Cannot find module '" + r + "'");
                throw n.code = "MODULE_NOT_FOUND", n;
              }
              var i = o[r] = { exports: {} };
              a[r][0].call(i.exports, function(e4) {
                var t3 = a[r][1][e4];
                return u(t3 || e4);
              }, i, i.exports, s, a, o, h);
            }
            return o[r].exports;
          }
          for (var l = "function" == typeof __require2 && __require2, e2 = 0; e2 < h.length; e2++) u(h[e2]);
          return u;
        })({ 1: [function(e2, t2, r) {
          "use strict";
          var d = e2("./utils"), c = e2("./support"), p = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
          r.encode = function(e3) {
            for (var t3, r2, n, i, s, a, o, h = [], u = 0, l = e3.length, f = l, c2 = "string" !== d.getTypeOf(e3); u < e3.length; ) f = l - u, n = c2 ? (t3 = e3[u++], r2 = u < l ? e3[u++] : 0, u < l ? e3[u++] : 0) : (t3 = e3.charCodeAt(u++), r2 = u < l ? e3.charCodeAt(u++) : 0, u < l ? e3.charCodeAt(u++) : 0), i = t3 >> 2, s = (3 & t3) << 4 | r2 >> 4, a = 1 < f ? (15 & r2) << 2 | n >> 6 : 64, o = 2 < f ? 63 & n : 64, h.push(p.charAt(i) + p.charAt(s) + p.charAt(a) + p.charAt(o));
            return h.join("");
          }, r.decode = function(e3) {
            var t3, r2, n, i, s, a, o = 0, h = 0, u = "data:";
            if (e3.substr(0, u.length) === u) throw new Error("Invalid base64 input, it looks like a data url.");
            var l, f = 3 * (e3 = e3.replace(/[^A-Za-z0-9+/=]/g, "")).length / 4;
            if (e3.charAt(e3.length - 1) === p.charAt(64) && f--, e3.charAt(e3.length - 2) === p.charAt(64) && f--, f % 1 != 0) throw new Error("Invalid base64 input, bad content length.");
            for (l = c.uint8array ? new Uint8Array(0 | f) : new Array(0 | f); o < e3.length; ) t3 = p.indexOf(e3.charAt(o++)) << 2 | (i = p.indexOf(e3.charAt(o++))) >> 4, r2 = (15 & i) << 4 | (s = p.indexOf(e3.charAt(o++))) >> 2, n = (3 & s) << 6 | (a = p.indexOf(e3.charAt(o++))), l[h++] = t3, 64 !== s && (l[h++] = r2), 64 !== a && (l[h++] = n);
            return l;
          };
        }, { "./support": 30, "./utils": 32 }], 2: [function(e2, t2, r) {
          "use strict";
          var n = e2("./external"), i = e2("./stream/DataWorker"), s = e2("./stream/Crc32Probe"), a = e2("./stream/DataLengthProbe");
          function o(e3, t3, r2, n2, i2) {
            this.compressedSize = e3, this.uncompressedSize = t3, this.crc32 = r2, this.compression = n2, this.compressedContent = i2;
          }
          o.prototype = { getContentWorker: function() {
            var e3 = new i(n.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new a("data_length")), t3 = this;
            return e3.on("end", function() {
              if (this.streamInfo.data_length !== t3.uncompressedSize) throw new Error("Bug : uncompressed data size mismatch");
            }), e3;
          }, getCompressedWorker: function() {
            return new i(n.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize", this.compressedSize).withStreamInfo("uncompressedSize", this.uncompressedSize).withStreamInfo("crc32", this.crc32).withStreamInfo("compression", this.compression);
          } }, o.createWorkerFrom = function(e3, t3, r2) {
            return e3.pipe(new s()).pipe(new a("uncompressedSize")).pipe(t3.compressWorker(r2)).pipe(new a("compressedSize")).withStreamInfo("compression", t3);
          }, t2.exports = o;
        }, { "./external": 6, "./stream/Crc32Probe": 25, "./stream/DataLengthProbe": 26, "./stream/DataWorker": 27 }], 3: [function(e2, t2, r) {
          "use strict";
          var n = e2("./stream/GenericWorker");
          r.STORE = { magic: "\0\0", compressWorker: function() {
            return new n("STORE compression");
          }, uncompressWorker: function() {
            return new n("STORE decompression");
          } }, r.DEFLATE = e2("./flate");
        }, { "./flate": 7, "./stream/GenericWorker": 28 }], 4: [function(e2, t2, r) {
          "use strict";
          var n = e2("./utils");
          var o = (function() {
            for (var e3, t3 = [], r2 = 0; r2 < 256; r2++) {
              e3 = r2;
              for (var n2 = 0; n2 < 8; n2++) e3 = 1 & e3 ? 3988292384 ^ e3 >>> 1 : e3 >>> 1;
              t3[r2] = e3;
            }
            return t3;
          })();
          t2.exports = function(e3, t3) {
            return void 0 !== e3 && e3.length ? "string" !== n.getTypeOf(e3) ? (function(e4, t4, r2, n2) {
              var i = o, s = n2 + r2;
              e4 ^= -1;
              for (var a = n2; a < s; a++) e4 = e4 >>> 8 ^ i[255 & (e4 ^ t4[a])];
              return -1 ^ e4;
            })(0 | t3, e3, e3.length, 0) : (function(e4, t4, r2, n2) {
              var i = o, s = n2 + r2;
              e4 ^= -1;
              for (var a = n2; a < s; a++) e4 = e4 >>> 8 ^ i[255 & (e4 ^ t4.charCodeAt(a))];
              return -1 ^ e4;
            })(0 | t3, e3, e3.length, 0) : 0;
          };
        }, { "./utils": 32 }], 5: [function(e2, t2, r) {
          "use strict";
          r.base64 = false, r.binary = false, r.dir = false, r.createFolders = true, r.date = null, r.compression = null, r.compressionOptions = null, r.comment = null, r.unixPermissions = null, r.dosPermissions = null;
        }, {}], 6: [function(e2, t2, r) {
          "use strict";
          var n = null;
          n = "undefined" != typeof Promise ? Promise : e2("lie"), t2.exports = { Promise: n };
        }, { lie: 37 }], 7: [function(e2, t2, r) {
          "use strict";
          var n = "undefined" != typeof Uint8Array && "undefined" != typeof Uint16Array && "undefined" != typeof Uint32Array, i = e2("pako"), s = e2("./utils"), a = e2("./stream/GenericWorker"), o = n ? "uint8array" : "array";
          function h(e3, t3) {
            a.call(this, "FlateWorker/" + e3), this._pako = null, this._pakoAction = e3, this._pakoOptions = t3, this.meta = {};
          }
          r.magic = "\b\0", s.inherits(h, a), h.prototype.processChunk = function(e3) {
            this.meta = e3.meta, null === this._pako && this._createPako(), this._pako.push(s.transformTo(o, e3.data), false);
          }, h.prototype.flush = function() {
            a.prototype.flush.call(this), null === this._pako && this._createPako(), this._pako.push([], true);
          }, h.prototype.cleanUp = function() {
            a.prototype.cleanUp.call(this), this._pako = null;
          }, h.prototype._createPako = function() {
            this._pako = new i[this._pakoAction]({ raw: true, level: this._pakoOptions.level || -1 });
            var t3 = this;
            this._pako.onData = function(e3) {
              t3.push({ data: e3, meta: t3.meta });
            };
          }, r.compressWorker = function(e3) {
            return new h("Deflate", e3);
          }, r.uncompressWorker = function() {
            return new h("Inflate", {});
          };
        }, { "./stream/GenericWorker": 28, "./utils": 32, pako: 38 }], 8: [function(e2, t2, r) {
          "use strict";
          function A(e3, t3) {
            var r2, n2 = "";
            for (r2 = 0; r2 < t3; r2++) n2 += String.fromCharCode(255 & e3), e3 >>>= 8;
            return n2;
          }
          function n(e3, t3, r2, n2, i2, s2) {
            var a, o, h = e3.file, u = e3.compression, l = s2 !== O.utf8encode, f = I.transformTo("string", s2(h.name)), c = I.transformTo("string", O.utf8encode(h.name)), d = h.comment, p = I.transformTo("string", s2(d)), m = I.transformTo("string", O.utf8encode(d)), _ = c.length !== h.name.length, g = m.length !== d.length, b = "", v = "", y = "", w = h.dir, k = h.date, x = { crc32: 0, compressedSize: 0, uncompressedSize: 0 };
            t3 && !r2 || (x.crc32 = e3.crc32, x.compressedSize = e3.compressedSize, x.uncompressedSize = e3.uncompressedSize);
            var S = 0;
            t3 && (S |= 8), l || !_ && !g || (S |= 2048);
            var z = 0, C = 0;
            w && (z |= 16), "UNIX" === i2 ? (C = 798, z |= (function(e4, t4) {
              var r3 = e4;
              return e4 || (r3 = t4 ? 16893 : 33204), (65535 & r3) << 16;
            })(h.unixPermissions, w)) : (C = 20, z |= (function(e4) {
              return 63 & (e4 || 0);
            })(h.dosPermissions)), a = k.getUTCHours(), a <<= 6, a |= k.getUTCMinutes(), a <<= 5, a |= k.getUTCSeconds() / 2, o = k.getUTCFullYear() - 1980, o <<= 4, o |= k.getUTCMonth() + 1, o <<= 5, o |= k.getUTCDate(), _ && (v = A(1, 1) + A(B(f), 4) + c, b += "up" + A(v.length, 2) + v), g && (y = A(1, 1) + A(B(p), 4) + m, b += "uc" + A(y.length, 2) + y);
            var E = "";
            return E += "\n\0", E += A(S, 2), E += u.magic, E += A(a, 2), E += A(o, 2), E += A(x.crc32, 4), E += A(x.compressedSize, 4), E += A(x.uncompressedSize, 4), E += A(f.length, 2), E += A(b.length, 2), { fileRecord: R.LOCAL_FILE_HEADER + E + f + b, dirRecord: R.CENTRAL_FILE_HEADER + A(C, 2) + E + A(p.length, 2) + "\0\0\0\0" + A(z, 4) + A(n2, 4) + f + b + p };
          }
          var I = e2("../utils"), i = e2("../stream/GenericWorker"), O = e2("../utf8"), B = e2("../crc32"), R = e2("../signature");
          function s(e3, t3, r2, n2) {
            i.call(this, "ZipFileWorker"), this.bytesWritten = 0, this.zipComment = t3, this.zipPlatform = r2, this.encodeFileName = n2, this.streamFiles = e3, this.accumulate = false, this.contentBuffer = [], this.dirRecords = [], this.currentSourceOffset = 0, this.entriesCount = 0, this.currentFile = null, this._sources = [];
          }
          I.inherits(s, i), s.prototype.push = function(e3) {
            var t3 = e3.meta.percent || 0, r2 = this.entriesCount, n2 = this._sources.length;
            this.accumulate ? this.contentBuffer.push(e3) : (this.bytesWritten += e3.data.length, i.prototype.push.call(this, { data: e3.data, meta: { currentFile: this.currentFile, percent: r2 ? (t3 + 100 * (r2 - n2 - 1)) / r2 : 100 } }));
          }, s.prototype.openedSource = function(e3) {
            this.currentSourceOffset = this.bytesWritten, this.currentFile = e3.file.name;
            var t3 = this.streamFiles && !e3.file.dir;
            if (t3) {
              var r2 = n(e3, t3, false, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
              this.push({ data: r2.fileRecord, meta: { percent: 0 } });
            } else this.accumulate = true;
          }, s.prototype.closedSource = function(e3) {
            this.accumulate = false;
            var t3 = this.streamFiles && !e3.file.dir, r2 = n(e3, t3, true, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
            if (this.dirRecords.push(r2.dirRecord), t3) this.push({ data: (function(e4) {
              return R.DATA_DESCRIPTOR + A(e4.crc32, 4) + A(e4.compressedSize, 4) + A(e4.uncompressedSize, 4);
            })(e3), meta: { percent: 100 } });
            else for (this.push({ data: r2.fileRecord, meta: { percent: 0 } }); this.contentBuffer.length; ) this.push(this.contentBuffer.shift());
            this.currentFile = null;
          }, s.prototype.flush = function() {
            for (var e3 = this.bytesWritten, t3 = 0; t3 < this.dirRecords.length; t3++) this.push({ data: this.dirRecords[t3], meta: { percent: 100 } });
            var r2 = this.bytesWritten - e3, n2 = (function(e4, t4, r3, n3, i2) {
              var s2 = I.transformTo("string", i2(n3));
              return R.CENTRAL_DIRECTORY_END + "\0\0\0\0" + A(e4, 2) + A(e4, 2) + A(t4, 4) + A(r3, 4) + A(s2.length, 2) + s2;
            })(this.dirRecords.length, r2, e3, this.zipComment, this.encodeFileName);
            this.push({ data: n2, meta: { percent: 100 } });
          }, s.prototype.prepareNextSource = function() {
            this.previous = this._sources.shift(), this.openedSource(this.previous.streamInfo), this.isPaused ? this.previous.pause() : this.previous.resume();
          }, s.prototype.registerPrevious = function(e3) {
            this._sources.push(e3);
            var t3 = this;
            return e3.on("data", function(e4) {
              t3.processChunk(e4);
            }), e3.on("end", function() {
              t3.closedSource(t3.previous.streamInfo), t3._sources.length ? t3.prepareNextSource() : t3.end();
            }), e3.on("error", function(e4) {
              t3.error(e4);
            }), this;
          }, s.prototype.resume = function() {
            return !!i.prototype.resume.call(this) && (!this.previous && this._sources.length ? (this.prepareNextSource(), true) : this.previous || this._sources.length || this.generatedError ? void 0 : (this.end(), true));
          }, s.prototype.error = function(e3) {
            var t3 = this._sources;
            if (!i.prototype.error.call(this, e3)) return false;
            for (var r2 = 0; r2 < t3.length; r2++) try {
              t3[r2].error(e3);
            } catch (e4) {
            }
            return true;
          }, s.prototype.lock = function() {
            i.prototype.lock.call(this);
            for (var e3 = this._sources, t3 = 0; t3 < e3.length; t3++) e3[t3].lock();
          }, t2.exports = s;
        }, { "../crc32": 4, "../signature": 23, "../stream/GenericWorker": 28, "../utf8": 31, "../utils": 32 }], 9: [function(e2, t2, r) {
          "use strict";
          var u = e2("../compressions"), n = e2("./ZipFileWorker");
          r.generateWorker = function(e3, a, t3) {
            var o = new n(a.streamFiles, t3, a.platform, a.encodeFileName), h = 0;
            try {
              e3.forEach(function(e4, t4) {
                h++;
                var r2 = (function(e5, t5) {
                  var r3 = e5 || t5, n3 = u[r3];
                  if (!n3) throw new Error(r3 + " is not a valid compression method !");
                  return n3;
                })(t4.options.compression, a.compression), n2 = t4.options.compressionOptions || a.compressionOptions || {}, i = t4.dir, s = t4.date;
                t4._compressWorker(r2, n2).withStreamInfo("file", { name: e4, dir: i, date: s, comment: t4.comment || "", unixPermissions: t4.unixPermissions, dosPermissions: t4.dosPermissions }).pipe(o);
              }), o.entriesCount = h;
            } catch (e4) {
              o.error(e4);
            }
            return o;
          };
        }, { "../compressions": 3, "./ZipFileWorker": 8 }], 10: [function(e2, t2, r) {
          "use strict";
          function n() {
            if (!(this instanceof n)) return new n();
            if (arguments.length) throw new Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");
            this.files = /* @__PURE__ */ Object.create(null), this.comment = null, this.root = "", this.clone = function() {
              var e3 = new n();
              for (var t3 in this) "function" != typeof this[t3] && (e3[t3] = this[t3]);
              return e3;
            };
          }
          (n.prototype = e2("./object")).loadAsync = e2("./load"), n.support = e2("./support"), n.defaults = e2("./defaults"), n.version = "3.10.1", n.loadAsync = function(e3, t3) {
            return new n().loadAsync(e3, t3);
          }, n.external = e2("./external"), t2.exports = n;
        }, { "./defaults": 5, "./external": 6, "./load": 11, "./object": 15, "./support": 30 }], 11: [function(e2, t2, r) {
          "use strict";
          var u = e2("./utils"), i = e2("./external"), n = e2("./utf8"), s = e2("./zipEntries"), a = e2("./stream/Crc32Probe"), l = e2("./nodejsUtils");
          function f(n2) {
            return new i.Promise(function(e3, t3) {
              var r2 = n2.decompressed.getContentWorker().pipe(new a());
              r2.on("error", function(e4) {
                t3(e4);
              }).on("end", function() {
                r2.streamInfo.crc32 !== n2.decompressed.crc32 ? t3(new Error("Corrupted zip : CRC32 mismatch")) : e3();
              }).resume();
            });
          }
          t2.exports = function(e3, o) {
            var h = this;
            return o = u.extend(o || {}, { base64: false, checkCRC32: false, optimizedBinaryString: false, createFolders: false, decodeFileName: n.utf8decode }), l.isNode && l.isStream(e3) ? i.Promise.reject(new Error("JSZip can't accept a stream when loading a zip file.")) : u.prepareContent("the loaded zip file", e3, true, o.optimizedBinaryString, o.base64).then(function(e4) {
              var t3 = new s(o);
              return t3.load(e4), t3;
            }).then(function(e4) {
              var t3 = [i.Promise.resolve(e4)], r2 = e4.files;
              if (o.checkCRC32) for (var n2 = 0; n2 < r2.length; n2++) t3.push(f(r2[n2]));
              return i.Promise.all(t3);
            }).then(function(e4) {
              for (var t3 = e4.shift(), r2 = t3.files, n2 = 0; n2 < r2.length; n2++) {
                var i2 = r2[n2], s2 = i2.fileNameStr, a2 = u.resolve(i2.fileNameStr);
                h.file(a2, i2.decompressed, { binary: true, optimizedBinaryString: true, date: i2.date, dir: i2.dir, comment: i2.fileCommentStr.length ? i2.fileCommentStr : null, unixPermissions: i2.unixPermissions, dosPermissions: i2.dosPermissions, createFolders: o.createFolders }), i2.dir || (h.file(a2).unsafeOriginalName = s2);
              }
              return t3.zipComment.length && (h.comment = t3.zipComment), h;
            });
          };
        }, { "./external": 6, "./nodejsUtils": 14, "./stream/Crc32Probe": 25, "./utf8": 31, "./utils": 32, "./zipEntries": 33 }], 12: [function(e2, t2, r) {
          "use strict";
          var n = e2("../utils"), i = e2("../stream/GenericWorker");
          function s(e3, t3) {
            i.call(this, "Nodejs stream input adapter for " + e3), this._upstreamEnded = false, this._bindStream(t3);
          }
          n.inherits(s, i), s.prototype._bindStream = function(e3) {
            var t3 = this;
            (this._stream = e3).pause(), e3.on("data", function(e4) {
              t3.push({ data: e4, meta: { percent: 0 } });
            }).on("error", function(e4) {
              t3.isPaused ? this.generatedError = e4 : t3.error(e4);
            }).on("end", function() {
              t3.isPaused ? t3._upstreamEnded = true : t3.end();
            });
          }, s.prototype.pause = function() {
            return !!i.prototype.pause.call(this) && (this._stream.pause(), true);
          }, s.prototype.resume = function() {
            return !!i.prototype.resume.call(this) && (this._upstreamEnded ? this.end() : this._stream.resume(), true);
          }, t2.exports = s;
        }, { "../stream/GenericWorker": 28, "../utils": 32 }], 13: [function(e2, t2, r) {
          "use strict";
          var i = e2("readable-stream").Readable;
          function n(e3, t3, r2) {
            i.call(this, t3), this._helper = e3;
            var n2 = this;
            e3.on("data", function(e4, t4) {
              n2.push(e4) || n2._helper.pause(), r2 && r2(t4);
            }).on("error", function(e4) {
              n2.emit("error", e4);
            }).on("end", function() {
              n2.push(null);
            });
          }
          e2("../utils").inherits(n, i), n.prototype._read = function() {
            this._helper.resume();
          }, t2.exports = n;
        }, { "../utils": 32, "readable-stream": 16 }], 14: [function(e2, t2, r) {
          "use strict";
          t2.exports = { isNode: "undefined" != typeof Buffer, newBufferFrom: function(e3, t3) {
            if (Buffer.from && Buffer.from !== Uint8Array.from) return Buffer.from(e3, t3);
            if ("number" == typeof e3) throw new Error('The "data" argument must not be a number');
            return new Buffer(e3, t3);
          }, allocBuffer: function(e3) {
            if (Buffer.alloc) return Buffer.alloc(e3);
            var t3 = new Buffer(e3);
            return t3.fill(0), t3;
          }, isBuffer: function(e3) {
            return Buffer.isBuffer(e3);
          }, isStream: function(e3) {
            return e3 && "function" == typeof e3.on && "function" == typeof e3.pause && "function" == typeof e3.resume;
          } };
        }, {}], 15: [function(e2, t2, r) {
          "use strict";
          function s(e3, t3, r2) {
            var n2, i2 = u.getTypeOf(t3), s2 = u.extend(r2 || {}, f);
            s2.date = s2.date || /* @__PURE__ */ new Date(), null !== s2.compression && (s2.compression = s2.compression.toUpperCase()), "string" == typeof s2.unixPermissions && (s2.unixPermissions = parseInt(s2.unixPermissions, 8)), s2.unixPermissions && 16384 & s2.unixPermissions && (s2.dir = true), s2.dosPermissions && 16 & s2.dosPermissions && (s2.dir = true), s2.dir && (e3 = g(e3)), s2.createFolders && (n2 = _(e3)) && b.call(this, n2, true);
            var a2 = "string" === i2 && false === s2.binary && false === s2.base64;
            r2 && void 0 !== r2.binary || (s2.binary = !a2), (t3 instanceof c && 0 === t3.uncompressedSize || s2.dir || !t3 || 0 === t3.length) && (s2.base64 = false, s2.binary = true, t3 = "", s2.compression = "STORE", i2 = "string");
            var o2 = null;
            o2 = t3 instanceof c || t3 instanceof l ? t3 : p.isNode && p.isStream(t3) ? new m(e3, t3) : u.prepareContent(e3, t3, s2.binary, s2.optimizedBinaryString, s2.base64);
            var h2 = new d(e3, o2, s2);
            this.files[e3] = h2;
          }
          var i = e2("./utf8"), u = e2("./utils"), l = e2("./stream/GenericWorker"), a = e2("./stream/StreamHelper"), f = e2("./defaults"), c = e2("./compressedObject"), d = e2("./zipObject"), o = e2("./generate"), p = e2("./nodejsUtils"), m = e2("./nodejs/NodejsStreamInputAdapter"), _ = function(e3) {
            "/" === e3.slice(-1) && (e3 = e3.substring(0, e3.length - 1));
            var t3 = e3.lastIndexOf("/");
            return 0 < t3 ? e3.substring(0, t3) : "";
          }, g = function(e3) {
            return "/" !== e3.slice(-1) && (e3 += "/"), e3;
          }, b = function(e3, t3) {
            return t3 = void 0 !== t3 ? t3 : f.createFolders, e3 = g(e3), this.files[e3] || s.call(this, e3, null, { dir: true, createFolders: t3 }), this.files[e3];
          };
          function h(e3) {
            return "[object RegExp]" === Object.prototype.toString.call(e3);
          }
          var n = { load: function() {
            throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
          }, forEach: function(e3) {
            var t3, r2, n2;
            for (t3 in this.files) n2 = this.files[t3], (r2 = t3.slice(this.root.length, t3.length)) && t3.slice(0, this.root.length) === this.root && e3(r2, n2);
          }, filter: function(r2) {
            var n2 = [];
            return this.forEach(function(e3, t3) {
              r2(e3, t3) && n2.push(t3);
            }), n2;
          }, file: function(e3, t3, r2) {
            if (1 !== arguments.length) return e3 = this.root + e3, s.call(this, e3, t3, r2), this;
            if (h(e3)) {
              var n2 = e3;
              return this.filter(function(e4, t4) {
                return !t4.dir && n2.test(e4);
              });
            }
            var i2 = this.files[this.root + e3];
            return i2 && !i2.dir ? i2 : null;
          }, folder: function(r2) {
            if (!r2) return this;
            if (h(r2)) return this.filter(function(e4, t4) {
              return t4.dir && r2.test(e4);
            });
            var e3 = this.root + r2, t3 = b.call(this, e3), n2 = this.clone();
            return n2.root = t3.name, n2;
          }, remove: function(r2) {
            r2 = this.root + r2;
            var e3 = this.files[r2];
            if (e3 || ("/" !== r2.slice(-1) && (r2 += "/"), e3 = this.files[r2]), e3 && !e3.dir) delete this.files[r2];
            else for (var t3 = this.filter(function(e4, t4) {
              return t4.name.slice(0, r2.length) === r2;
            }), n2 = 0; n2 < t3.length; n2++) delete this.files[t3[n2].name];
            return this;
          }, generate: function() {
            throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
          }, generateInternalStream: function(e3) {
            var t3, r2 = {};
            try {
              if ((r2 = u.extend(e3 || {}, { streamFiles: false, compression: "STORE", compressionOptions: null, type: "", platform: "DOS", comment: null, mimeType: "application/zip", encodeFileName: i.utf8encode })).type = r2.type.toLowerCase(), r2.compression = r2.compression.toUpperCase(), "binarystring" === r2.type && (r2.type = "string"), !r2.type) throw new Error("No output type specified.");
              u.checkSupport(r2.type), "darwin" !== r2.platform && "freebsd" !== r2.platform && "linux" !== r2.platform && "sunos" !== r2.platform || (r2.platform = "UNIX"), "win32" === r2.platform && (r2.platform = "DOS");
              var n2 = r2.comment || this.comment || "";
              t3 = o.generateWorker(this, r2, n2);
            } catch (e4) {
              (t3 = new l("error")).error(e4);
            }
            return new a(t3, r2.type || "string", r2.mimeType);
          }, generateAsync: function(e3, t3) {
            return this.generateInternalStream(e3).accumulate(t3);
          }, generateNodeStream: function(e3, t3) {
            return (e3 = e3 || {}).type || (e3.type = "nodebuffer"), this.generateInternalStream(e3).toNodejsStream(t3);
          } };
          t2.exports = n;
        }, { "./compressedObject": 2, "./defaults": 5, "./generate": 9, "./nodejs/NodejsStreamInputAdapter": 12, "./nodejsUtils": 14, "./stream/GenericWorker": 28, "./stream/StreamHelper": 29, "./utf8": 31, "./utils": 32, "./zipObject": 35 }], 16: [function(e2, t2, r) {
          "use strict";
          t2.exports = e2("stream");
        }, { stream: void 0 }], 17: [function(e2, t2, r) {
          "use strict";
          var n = e2("./DataReader");
          function i(e3) {
            n.call(this, e3);
            for (var t3 = 0; t3 < this.data.length; t3++) e3[t3] = 255 & e3[t3];
          }
          e2("../utils").inherits(i, n), i.prototype.byteAt = function(e3) {
            return this.data[this.zero + e3];
          }, i.prototype.lastIndexOfSignature = function(e3) {
            for (var t3 = e3.charCodeAt(0), r2 = e3.charCodeAt(1), n2 = e3.charCodeAt(2), i2 = e3.charCodeAt(3), s = this.length - 4; 0 <= s; --s) if (this.data[s] === t3 && this.data[s + 1] === r2 && this.data[s + 2] === n2 && this.data[s + 3] === i2) return s - this.zero;
            return -1;
          }, i.prototype.readAndCheckSignature = function(e3) {
            var t3 = e3.charCodeAt(0), r2 = e3.charCodeAt(1), n2 = e3.charCodeAt(2), i2 = e3.charCodeAt(3), s = this.readData(4);
            return t3 === s[0] && r2 === s[1] && n2 === s[2] && i2 === s[3];
          }, i.prototype.readData = function(e3) {
            if (this.checkOffset(e3), 0 === e3) return [];
            var t3 = this.data.slice(this.zero + this.index, this.zero + this.index + e3);
            return this.index += e3, t3;
          }, t2.exports = i;
        }, { "../utils": 32, "./DataReader": 18 }], 18: [function(e2, t2, r) {
          "use strict";
          var n = e2("../utils");
          function i(e3) {
            this.data = e3, this.length = e3.length, this.index = 0, this.zero = 0;
          }
          i.prototype = { checkOffset: function(e3) {
            this.checkIndex(this.index + e3);
          }, checkIndex: function(e3) {
            if (this.length < this.zero + e3 || e3 < 0) throw new Error("End of data reached (data length = " + this.length + ", asked index = " + e3 + "). Corrupted zip ?");
          }, setIndex: function(e3) {
            this.checkIndex(e3), this.index = e3;
          }, skip: function(e3) {
            this.setIndex(this.index + e3);
          }, byteAt: function() {
          }, readInt: function(e3) {
            var t3, r2 = 0;
            for (this.checkOffset(e3), t3 = this.index + e3 - 1; t3 >= this.index; t3--) r2 = (r2 << 8) + this.byteAt(t3);
            return this.index += e3, r2;
          }, readString: function(e3) {
            return n.transformTo("string", this.readData(e3));
          }, readData: function() {
          }, lastIndexOfSignature: function() {
          }, readAndCheckSignature: function() {
          }, readDate: function() {
            var e3 = this.readInt(4);
            return new Date(Date.UTC(1980 + (e3 >> 25 & 127), (e3 >> 21 & 15) - 1, e3 >> 16 & 31, e3 >> 11 & 31, e3 >> 5 & 63, (31 & e3) << 1));
          } }, t2.exports = i;
        }, { "../utils": 32 }], 19: [function(e2, t2, r) {
          "use strict";
          var n = e2("./Uint8ArrayReader");
          function i(e3) {
            n.call(this, e3);
          }
          e2("../utils").inherits(i, n), i.prototype.readData = function(e3) {
            this.checkOffset(e3);
            var t3 = this.data.slice(this.zero + this.index, this.zero + this.index + e3);
            return this.index += e3, t3;
          }, t2.exports = i;
        }, { "../utils": 32, "./Uint8ArrayReader": 21 }], 20: [function(e2, t2, r) {
          "use strict";
          var n = e2("./DataReader");
          function i(e3) {
            n.call(this, e3);
          }
          e2("../utils").inherits(i, n), i.prototype.byteAt = function(e3) {
            return this.data.charCodeAt(this.zero + e3);
          }, i.prototype.lastIndexOfSignature = function(e3) {
            return this.data.lastIndexOf(e3) - this.zero;
          }, i.prototype.readAndCheckSignature = function(e3) {
            return e3 === this.readData(4);
          }, i.prototype.readData = function(e3) {
            this.checkOffset(e3);
            var t3 = this.data.slice(this.zero + this.index, this.zero + this.index + e3);
            return this.index += e3, t3;
          }, t2.exports = i;
        }, { "../utils": 32, "./DataReader": 18 }], 21: [function(e2, t2, r) {
          "use strict";
          var n = e2("./ArrayReader");
          function i(e3) {
            n.call(this, e3);
          }
          e2("../utils").inherits(i, n), i.prototype.readData = function(e3) {
            if (this.checkOffset(e3), 0 === e3) return new Uint8Array(0);
            var t3 = this.data.subarray(this.zero + this.index, this.zero + this.index + e3);
            return this.index += e3, t3;
          }, t2.exports = i;
        }, { "../utils": 32, "./ArrayReader": 17 }], 22: [function(e2, t2, r) {
          "use strict";
          var n = e2("../utils"), i = e2("../support"), s = e2("./ArrayReader"), a = e2("./StringReader"), o = e2("./NodeBufferReader"), h = e2("./Uint8ArrayReader");
          t2.exports = function(e3) {
            var t3 = n.getTypeOf(e3);
            return n.checkSupport(t3), "string" !== t3 || i.uint8array ? "nodebuffer" === t3 ? new o(e3) : i.uint8array ? new h(n.transformTo("uint8array", e3)) : new s(n.transformTo("array", e3)) : new a(e3);
          };
        }, { "../support": 30, "../utils": 32, "./ArrayReader": 17, "./NodeBufferReader": 19, "./StringReader": 20, "./Uint8ArrayReader": 21 }], 23: [function(e2, t2, r) {
          "use strict";
          r.LOCAL_FILE_HEADER = "PK", r.CENTRAL_FILE_HEADER = "PK", r.CENTRAL_DIRECTORY_END = "PK", r.ZIP64_CENTRAL_DIRECTORY_LOCATOR = "PK\x07", r.ZIP64_CENTRAL_DIRECTORY_END = "PK", r.DATA_DESCRIPTOR = "PK\x07\b";
        }, {}], 24: [function(e2, t2, r) {
          "use strict";
          var n = e2("./GenericWorker"), i = e2("../utils");
          function s(e3) {
            n.call(this, "ConvertWorker to " + e3), this.destType = e3;
          }
          i.inherits(s, n), s.prototype.processChunk = function(e3) {
            this.push({ data: i.transformTo(this.destType, e3.data), meta: e3.meta });
          }, t2.exports = s;
        }, { "../utils": 32, "./GenericWorker": 28 }], 25: [function(e2, t2, r) {
          "use strict";
          var n = e2("./GenericWorker"), i = e2("../crc32");
          function s() {
            n.call(this, "Crc32Probe"), this.withStreamInfo("crc32", 0);
          }
          e2("../utils").inherits(s, n), s.prototype.processChunk = function(e3) {
            this.streamInfo.crc32 = i(e3.data, this.streamInfo.crc32 || 0), this.push(e3);
          }, t2.exports = s;
        }, { "../crc32": 4, "../utils": 32, "./GenericWorker": 28 }], 26: [function(e2, t2, r) {
          "use strict";
          var n = e2("../utils"), i = e2("./GenericWorker");
          function s(e3) {
            i.call(this, "DataLengthProbe for " + e3), this.propName = e3, this.withStreamInfo(e3, 0);
          }
          n.inherits(s, i), s.prototype.processChunk = function(e3) {
            if (e3) {
              var t3 = this.streamInfo[this.propName] || 0;
              this.streamInfo[this.propName] = t3 + e3.data.length;
            }
            i.prototype.processChunk.call(this, e3);
          }, t2.exports = s;
        }, { "../utils": 32, "./GenericWorker": 28 }], 27: [function(e2, t2, r) {
          "use strict";
          var n = e2("../utils"), i = e2("./GenericWorker");
          function s(e3) {
            i.call(this, "DataWorker");
            var t3 = this;
            this.dataIsReady = false, this.index = 0, this.max = 0, this.data = null, this.type = "", this._tickScheduled = false, e3.then(function(e4) {
              t3.dataIsReady = true, t3.data = e4, t3.max = e4 && e4.length || 0, t3.type = n.getTypeOf(e4), t3.isPaused || t3._tickAndRepeat();
            }, function(e4) {
              t3.error(e4);
            });
          }
          n.inherits(s, i), s.prototype.cleanUp = function() {
            i.prototype.cleanUp.call(this), this.data = null;
          }, s.prototype.resume = function() {
            return !!i.prototype.resume.call(this) && (!this._tickScheduled && this.dataIsReady && (this._tickScheduled = true, n.delay(this._tickAndRepeat, [], this)), true);
          }, s.prototype._tickAndRepeat = function() {
            this._tickScheduled = false, this.isPaused || this.isFinished || (this._tick(), this.isFinished || (n.delay(this._tickAndRepeat, [], this), this._tickScheduled = true));
          }, s.prototype._tick = function() {
            if (this.isPaused || this.isFinished) return false;
            var e3 = null, t3 = Math.min(this.max, this.index + 16384);
            if (this.index >= this.max) return this.end();
            switch (this.type) {
              case "string":
                e3 = this.data.substring(this.index, t3);
                break;
              case "uint8array":
                e3 = this.data.subarray(this.index, t3);
                break;
              case "array":
              case "nodebuffer":
                e3 = this.data.slice(this.index, t3);
            }
            return this.index = t3, this.push({ data: e3, meta: { percent: this.max ? this.index / this.max * 100 : 0 } });
          }, t2.exports = s;
        }, { "../utils": 32, "./GenericWorker": 28 }], 28: [function(e2, t2, r) {
          "use strict";
          function n(e3) {
            this.name = e3 || "default", this.streamInfo = {}, this.generatedError = null, this.extraStreamInfo = {}, this.isPaused = true, this.isFinished = false, this.isLocked = false, this._listeners = { data: [], end: [], error: [] }, this.previous = null;
          }
          n.prototype = { push: function(e3) {
            this.emit("data", e3);
          }, end: function() {
            if (this.isFinished) return false;
            this.flush();
            try {
              this.emit("end"), this.cleanUp(), this.isFinished = true;
            } catch (e3) {
              this.emit("error", e3);
            }
            return true;
          }, error: function(e3) {
            return !this.isFinished && (this.isPaused ? this.generatedError = e3 : (this.isFinished = true, this.emit("error", e3), this.previous && this.previous.error(e3), this.cleanUp()), true);
          }, on: function(e3, t3) {
            return this._listeners[e3].push(t3), this;
          }, cleanUp: function() {
            this.streamInfo = this.generatedError = this.extraStreamInfo = null, this._listeners = [];
          }, emit: function(e3, t3) {
            if (this._listeners[e3]) for (var r2 = 0; r2 < this._listeners[e3].length; r2++) this._listeners[e3][r2].call(this, t3);
          }, pipe: function(e3) {
            return e3.registerPrevious(this);
          }, registerPrevious: function(e3) {
            if (this.isLocked) throw new Error("The stream '" + this + "' has already been used.");
            this.streamInfo = e3.streamInfo, this.mergeStreamInfo(), this.previous = e3;
            var t3 = this;
            return e3.on("data", function(e4) {
              t3.processChunk(e4);
            }), e3.on("end", function() {
              t3.end();
            }), e3.on("error", function(e4) {
              t3.error(e4);
            }), this;
          }, pause: function() {
            return !this.isPaused && !this.isFinished && (this.isPaused = true, this.previous && this.previous.pause(), true);
          }, resume: function() {
            if (!this.isPaused || this.isFinished) return false;
            var e3 = this.isPaused = false;
            return this.generatedError && (this.error(this.generatedError), e3 = true), this.previous && this.previous.resume(), !e3;
          }, flush: function() {
          }, processChunk: function(e3) {
            this.push(e3);
          }, withStreamInfo: function(e3, t3) {
            return this.extraStreamInfo[e3] = t3, this.mergeStreamInfo(), this;
          }, mergeStreamInfo: function() {
            for (var e3 in this.extraStreamInfo) Object.prototype.hasOwnProperty.call(this.extraStreamInfo, e3) && (this.streamInfo[e3] = this.extraStreamInfo[e3]);
          }, lock: function() {
            if (this.isLocked) throw new Error("The stream '" + this + "' has already been used.");
            this.isLocked = true, this.previous && this.previous.lock();
          }, toString: function() {
            var e3 = "Worker " + this.name;
            return this.previous ? this.previous + " -> " + e3 : e3;
          } }, t2.exports = n;
        }, {}], 29: [function(e2, t2, r) {
          "use strict";
          var h = e2("../utils"), i = e2("./ConvertWorker"), s = e2("./GenericWorker"), u = e2("../base64"), n = e2("../support"), a = e2("../external"), o = null;
          if (n.nodestream) try {
            o = e2("../nodejs/NodejsStreamOutputAdapter");
          } catch (e3) {
          }
          function l(e3, o2) {
            return new a.Promise(function(t3, r2) {
              var n2 = [], i2 = e3._internalType, s2 = e3._outputType, a2 = e3._mimeType;
              e3.on("data", function(e4, t4) {
                n2.push(e4), o2 && o2(t4);
              }).on("error", function(e4) {
                n2 = [], r2(e4);
              }).on("end", function() {
                try {
                  var e4 = (function(e5, t4, r3) {
                    switch (e5) {
                      case "blob":
                        return h.newBlob(h.transformTo("arraybuffer", t4), r3);
                      case "base64":
                        return u.encode(t4);
                      default:
                        return h.transformTo(e5, t4);
                    }
                  })(s2, (function(e5, t4) {
                    var r3, n3 = 0, i3 = null, s3 = 0;
                    for (r3 = 0; r3 < t4.length; r3++) s3 += t4[r3].length;
                    switch (e5) {
                      case "string":
                        return t4.join("");
                      case "array":
                        return Array.prototype.concat.apply([], t4);
                      case "uint8array":
                        for (i3 = new Uint8Array(s3), r3 = 0; r3 < t4.length; r3++) i3.set(t4[r3], n3), n3 += t4[r3].length;
                        return i3;
                      case "nodebuffer":
                        return Buffer.concat(t4);
                      default:
                        throw new Error("concat : unsupported type '" + e5 + "'");
                    }
                  })(i2, n2), a2);
                  t3(e4);
                } catch (e5) {
                  r2(e5);
                }
                n2 = [];
              }).resume();
            });
          }
          function f(e3, t3, r2) {
            var n2 = t3;
            switch (t3) {
              case "blob":
              case "arraybuffer":
                n2 = "uint8array";
                break;
              case "base64":
                n2 = "string";
            }
            try {
              this._internalType = n2, this._outputType = t3, this._mimeType = r2, h.checkSupport(n2), this._worker = e3.pipe(new i(n2)), e3.lock();
            } catch (e4) {
              this._worker = new s("error"), this._worker.error(e4);
            }
          }
          f.prototype = { accumulate: function(e3) {
            return l(this, e3);
          }, on: function(e3, t3) {
            var r2 = this;
            return "data" === e3 ? this._worker.on(e3, function(e4) {
              t3.call(r2, e4.data, e4.meta);
            }) : this._worker.on(e3, function() {
              h.delay(t3, arguments, r2);
            }), this;
          }, resume: function() {
            return h.delay(this._worker.resume, [], this._worker), this;
          }, pause: function() {
            return this._worker.pause(), this;
          }, toNodejsStream: function(e3) {
            if (h.checkSupport("nodestream"), "nodebuffer" !== this._outputType) throw new Error(this._outputType + " is not supported by this method");
            return new o(this, { objectMode: "nodebuffer" !== this._outputType }, e3);
          } }, t2.exports = f;
        }, { "../base64": 1, "../external": 6, "../nodejs/NodejsStreamOutputAdapter": 13, "../support": 30, "../utils": 32, "./ConvertWorker": 24, "./GenericWorker": 28 }], 30: [function(e2, t2, r) {
          "use strict";
          if (r.base64 = true, r.array = true, r.string = true, r.arraybuffer = "undefined" != typeof ArrayBuffer && "undefined" != typeof Uint8Array, r.nodebuffer = "undefined" != typeof Buffer, r.uint8array = "undefined" != typeof Uint8Array, "undefined" == typeof ArrayBuffer) r.blob = false;
          else {
            var n = new ArrayBuffer(0);
            try {
              r.blob = 0 === new Blob([n], { type: "application/zip" }).size;
            } catch (e3) {
              try {
                var i = new (self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder)();
                i.append(n), r.blob = 0 === i.getBlob("application/zip").size;
              } catch (e4) {
                r.blob = false;
              }
            }
          }
          try {
            r.nodestream = !!e2("readable-stream").Readable;
          } catch (e3) {
            r.nodestream = false;
          }
        }, { "readable-stream": 16 }], 31: [function(e2, t2, s) {
          "use strict";
          for (var o = e2("./utils"), h = e2("./support"), r = e2("./nodejsUtils"), n = e2("./stream/GenericWorker"), u = new Array(256), i = 0; i < 256; i++) u[i] = 252 <= i ? 6 : 248 <= i ? 5 : 240 <= i ? 4 : 224 <= i ? 3 : 192 <= i ? 2 : 1;
          u[254] = u[254] = 1;
          function a() {
            n.call(this, "utf-8 decode"), this.leftOver = null;
          }
          function l() {
            n.call(this, "utf-8 encode");
          }
          s.utf8encode = function(e3) {
            return h.nodebuffer ? r.newBufferFrom(e3, "utf-8") : (function(e4) {
              var t3, r2, n2, i2, s2, a2 = e4.length, o2 = 0;
              for (i2 = 0; i2 < a2; i2++) 55296 == (64512 & (r2 = e4.charCodeAt(i2))) && i2 + 1 < a2 && 56320 == (64512 & (n2 = e4.charCodeAt(i2 + 1))) && (r2 = 65536 + (r2 - 55296 << 10) + (n2 - 56320), i2++), o2 += r2 < 128 ? 1 : r2 < 2048 ? 2 : r2 < 65536 ? 3 : 4;
              for (t3 = h.uint8array ? new Uint8Array(o2) : new Array(o2), i2 = s2 = 0; s2 < o2; i2++) 55296 == (64512 & (r2 = e4.charCodeAt(i2))) && i2 + 1 < a2 && 56320 == (64512 & (n2 = e4.charCodeAt(i2 + 1))) && (r2 = 65536 + (r2 - 55296 << 10) + (n2 - 56320), i2++), r2 < 128 ? t3[s2++] = r2 : (r2 < 2048 ? t3[s2++] = 192 | r2 >>> 6 : (r2 < 65536 ? t3[s2++] = 224 | r2 >>> 12 : (t3[s2++] = 240 | r2 >>> 18, t3[s2++] = 128 | r2 >>> 12 & 63), t3[s2++] = 128 | r2 >>> 6 & 63), t3[s2++] = 128 | 63 & r2);
              return t3;
            })(e3);
          }, s.utf8decode = function(e3) {
            return h.nodebuffer ? o.transformTo("nodebuffer", e3).toString("utf-8") : (function(e4) {
              var t3, r2, n2, i2, s2 = e4.length, a2 = new Array(2 * s2);
              for (t3 = r2 = 0; t3 < s2; ) if ((n2 = e4[t3++]) < 128) a2[r2++] = n2;
              else if (4 < (i2 = u[n2])) a2[r2++] = 65533, t3 += i2 - 1;
              else {
                for (n2 &= 2 === i2 ? 31 : 3 === i2 ? 15 : 7; 1 < i2 && t3 < s2; ) n2 = n2 << 6 | 63 & e4[t3++], i2--;
                1 < i2 ? a2[r2++] = 65533 : n2 < 65536 ? a2[r2++] = n2 : (n2 -= 65536, a2[r2++] = 55296 | n2 >> 10 & 1023, a2[r2++] = 56320 | 1023 & n2);
              }
              return a2.length !== r2 && (a2.subarray ? a2 = a2.subarray(0, r2) : a2.length = r2), o.applyFromCharCode(a2);
            })(e3 = o.transformTo(h.uint8array ? "uint8array" : "array", e3));
          }, o.inherits(a, n), a.prototype.processChunk = function(e3) {
            var t3 = o.transformTo(h.uint8array ? "uint8array" : "array", e3.data);
            if (this.leftOver && this.leftOver.length) {
              if (h.uint8array) {
                var r2 = t3;
                (t3 = new Uint8Array(r2.length + this.leftOver.length)).set(this.leftOver, 0), t3.set(r2, this.leftOver.length);
              } else t3 = this.leftOver.concat(t3);
              this.leftOver = null;
            }
            var n2 = (function(e4, t4) {
              var r3;
              for ((t4 = t4 || e4.length) > e4.length && (t4 = e4.length), r3 = t4 - 1; 0 <= r3 && 128 == (192 & e4[r3]); ) r3--;
              return r3 < 0 ? t4 : 0 === r3 ? t4 : r3 + u[e4[r3]] > t4 ? r3 : t4;
            })(t3), i2 = t3;
            n2 !== t3.length && (h.uint8array ? (i2 = t3.subarray(0, n2), this.leftOver = t3.subarray(n2, t3.length)) : (i2 = t3.slice(0, n2), this.leftOver = t3.slice(n2, t3.length))), this.push({ data: s.utf8decode(i2), meta: e3.meta });
          }, a.prototype.flush = function() {
            this.leftOver && this.leftOver.length && (this.push({ data: s.utf8decode(this.leftOver), meta: {} }), this.leftOver = null);
          }, s.Utf8DecodeWorker = a, o.inherits(l, n), l.prototype.processChunk = function(e3) {
            this.push({ data: s.utf8encode(e3.data), meta: e3.meta });
          }, s.Utf8EncodeWorker = l;
        }, { "./nodejsUtils": 14, "./stream/GenericWorker": 28, "./support": 30, "./utils": 32 }], 32: [function(e2, t2, a) {
          "use strict";
          var o = e2("./support"), h = e2("./base64"), r = e2("./nodejsUtils"), u = e2("./external");
          function n(e3) {
            return e3;
          }
          function l(e3, t3) {
            for (var r2 = 0; r2 < e3.length; ++r2) t3[r2] = 255 & e3.charCodeAt(r2);
            return t3;
          }
          e2("setimmediate"), a.newBlob = function(t3, r2) {
            a.checkSupport("blob");
            try {
              return new Blob([t3], { type: r2 });
            } catch (e3) {
              try {
                var n2 = new (self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder)();
                return n2.append(t3), n2.getBlob(r2);
              } catch (e4) {
                throw new Error("Bug : can't construct the Blob.");
              }
            }
          };
          var i = { stringifyByChunk: function(e3, t3, r2) {
            var n2 = [], i2 = 0, s2 = e3.length;
            if (s2 <= r2) return String.fromCharCode.apply(null, e3);
            for (; i2 < s2; ) "array" === t3 || "nodebuffer" === t3 ? n2.push(String.fromCharCode.apply(null, e3.slice(i2, Math.min(i2 + r2, s2)))) : n2.push(String.fromCharCode.apply(null, e3.subarray(i2, Math.min(i2 + r2, s2)))), i2 += r2;
            return n2.join("");
          }, stringifyByChar: function(e3) {
            for (var t3 = "", r2 = 0; r2 < e3.length; r2++) t3 += String.fromCharCode(e3[r2]);
            return t3;
          }, applyCanBeUsed: { uint8array: (function() {
            try {
              return o.uint8array && 1 === String.fromCharCode.apply(null, new Uint8Array(1)).length;
            } catch (e3) {
              return false;
            }
          })(), nodebuffer: (function() {
            try {
              return o.nodebuffer && 1 === String.fromCharCode.apply(null, r.allocBuffer(1)).length;
            } catch (e3) {
              return false;
            }
          })() } };
          function s(e3) {
            var t3 = 65536, r2 = a.getTypeOf(e3), n2 = true;
            if ("uint8array" === r2 ? n2 = i.applyCanBeUsed.uint8array : "nodebuffer" === r2 && (n2 = i.applyCanBeUsed.nodebuffer), n2) for (; 1 < t3; ) try {
              return i.stringifyByChunk(e3, r2, t3);
            } catch (e4) {
              t3 = Math.floor(t3 / 2);
            }
            return i.stringifyByChar(e3);
          }
          function f(e3, t3) {
            for (var r2 = 0; r2 < e3.length; r2++) t3[r2] = e3[r2];
            return t3;
          }
          a.applyFromCharCode = s;
          var c = {};
          c.string = { string: n, array: function(e3) {
            return l(e3, new Array(e3.length));
          }, arraybuffer: function(e3) {
            return c.string.uint8array(e3).buffer;
          }, uint8array: function(e3) {
            return l(e3, new Uint8Array(e3.length));
          }, nodebuffer: function(e3) {
            return l(e3, r.allocBuffer(e3.length));
          } }, c.array = { string: s, array: n, arraybuffer: function(e3) {
            return new Uint8Array(e3).buffer;
          }, uint8array: function(e3) {
            return new Uint8Array(e3);
          }, nodebuffer: function(e3) {
            return r.newBufferFrom(e3);
          } }, c.arraybuffer = { string: function(e3) {
            return s(new Uint8Array(e3));
          }, array: function(e3) {
            return f(new Uint8Array(e3), new Array(e3.byteLength));
          }, arraybuffer: n, uint8array: function(e3) {
            return new Uint8Array(e3);
          }, nodebuffer: function(e3) {
            return r.newBufferFrom(new Uint8Array(e3));
          } }, c.uint8array = { string: s, array: function(e3) {
            return f(e3, new Array(e3.length));
          }, arraybuffer: function(e3) {
            return e3.buffer;
          }, uint8array: n, nodebuffer: function(e3) {
            return r.newBufferFrom(e3);
          } }, c.nodebuffer = { string: s, array: function(e3) {
            return f(e3, new Array(e3.length));
          }, arraybuffer: function(e3) {
            return c.nodebuffer.uint8array(e3).buffer;
          }, uint8array: function(e3) {
            return f(e3, new Uint8Array(e3.length));
          }, nodebuffer: n }, a.transformTo = function(e3, t3) {
            if (t3 = t3 || "", !e3) return t3;
            a.checkSupport(e3);
            var r2 = a.getTypeOf(t3);
            return c[r2][e3](t3);
          }, a.resolve = function(e3) {
            for (var t3 = e3.split("/"), r2 = [], n2 = 0; n2 < t3.length; n2++) {
              var i2 = t3[n2];
              "." === i2 || "" === i2 && 0 !== n2 && n2 !== t3.length - 1 || (".." === i2 ? r2.pop() : r2.push(i2));
            }
            return r2.join("/");
          }, a.getTypeOf = function(e3) {
            return "string" == typeof e3 ? "string" : "[object Array]" === Object.prototype.toString.call(e3) ? "array" : o.nodebuffer && r.isBuffer(e3) ? "nodebuffer" : o.uint8array && e3 instanceof Uint8Array ? "uint8array" : o.arraybuffer && e3 instanceof ArrayBuffer ? "arraybuffer" : void 0;
          }, a.checkSupport = function(e3) {
            if (!o[e3.toLowerCase()]) throw new Error(e3 + " is not supported by this platform");
          }, a.MAX_VALUE_16BITS = 65535, a.MAX_VALUE_32BITS = -1, a.pretty = function(e3) {
            var t3, r2, n2 = "";
            for (r2 = 0; r2 < (e3 || "").length; r2++) n2 += "\\x" + ((t3 = e3.charCodeAt(r2)) < 16 ? "0" : "") + t3.toString(16).toUpperCase();
            return n2;
          }, a.delay = function(e3, t3, r2) {
            setImmediate(function() {
              e3.apply(r2 || null, t3 || []);
            });
          }, a.inherits = function(e3, t3) {
            function r2() {
            }
            r2.prototype = t3.prototype, e3.prototype = new r2();
          }, a.extend = function() {
            var e3, t3, r2 = {};
            for (e3 = 0; e3 < arguments.length; e3++) for (t3 in arguments[e3]) Object.prototype.hasOwnProperty.call(arguments[e3], t3) && void 0 === r2[t3] && (r2[t3] = arguments[e3][t3]);
            return r2;
          }, a.prepareContent = function(r2, e3, n2, i2, s2) {
            return u.Promise.resolve(e3).then(function(n3) {
              return o.blob && (n3 instanceof Blob || -1 !== ["[object File]", "[object Blob]"].indexOf(Object.prototype.toString.call(n3))) && "undefined" != typeof FileReader ? new u.Promise(function(t3, r3) {
                var e4 = new FileReader();
                e4.onload = function(e5) {
                  t3(e5.target.result);
                }, e4.onerror = function(e5) {
                  r3(e5.target.error);
                }, e4.readAsArrayBuffer(n3);
              }) : n3;
            }).then(function(e4) {
              var t3 = a.getTypeOf(e4);
              return t3 ? ("arraybuffer" === t3 ? e4 = a.transformTo("uint8array", e4) : "string" === t3 && (s2 ? e4 = h.decode(e4) : n2 && true !== i2 && (e4 = (function(e5) {
                return l(e5, o.uint8array ? new Uint8Array(e5.length) : new Array(e5.length));
              })(e4))), e4) : u.Promise.reject(new Error("Can't read the data of '" + r2 + "'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?"));
            });
          };
        }, { "./base64": 1, "./external": 6, "./nodejsUtils": 14, "./support": 30, setimmediate: 54 }], 33: [function(e2, t2, r) {
          "use strict";
          var n = e2("./reader/readerFor"), i = e2("./utils"), s = e2("./signature"), a = e2("./zipEntry"), o = e2("./support");
          function h(e3) {
            this.files = [], this.loadOptions = e3;
          }
          h.prototype = { checkSignature: function(e3) {
            if (!this.reader.readAndCheckSignature(e3)) {
              this.reader.index -= 4;
              var t3 = this.reader.readString(4);
              throw new Error("Corrupted zip or bug: unexpected signature (" + i.pretty(t3) + ", expected " + i.pretty(e3) + ")");
            }
          }, isSignature: function(e3, t3) {
            var r2 = this.reader.index;
            this.reader.setIndex(e3);
            var n2 = this.reader.readString(4) === t3;
            return this.reader.setIndex(r2), n2;
          }, readBlockEndOfCentral: function() {
            this.diskNumber = this.reader.readInt(2), this.diskWithCentralDirStart = this.reader.readInt(2), this.centralDirRecordsOnThisDisk = this.reader.readInt(2), this.centralDirRecords = this.reader.readInt(2), this.centralDirSize = this.reader.readInt(4), this.centralDirOffset = this.reader.readInt(4), this.zipCommentLength = this.reader.readInt(2);
            var e3 = this.reader.readData(this.zipCommentLength), t3 = o.uint8array ? "uint8array" : "array", r2 = i.transformTo(t3, e3);
            this.zipComment = this.loadOptions.decodeFileName(r2);
          }, readBlockZip64EndOfCentral: function() {
            this.zip64EndOfCentralSize = this.reader.readInt(8), this.reader.skip(4), this.diskNumber = this.reader.readInt(4), this.diskWithCentralDirStart = this.reader.readInt(4), this.centralDirRecordsOnThisDisk = this.reader.readInt(8), this.centralDirRecords = this.reader.readInt(8), this.centralDirSize = this.reader.readInt(8), this.centralDirOffset = this.reader.readInt(8), this.zip64ExtensibleData = {};
            for (var e3, t3, r2, n2 = this.zip64EndOfCentralSize - 44; 0 < n2; ) e3 = this.reader.readInt(2), t3 = this.reader.readInt(4), r2 = this.reader.readData(t3), this.zip64ExtensibleData[e3] = { id: e3, length: t3, value: r2 };
          }, readBlockZip64EndOfCentralLocator: function() {
            if (this.diskWithZip64CentralDirStart = this.reader.readInt(4), this.relativeOffsetEndOfZip64CentralDir = this.reader.readInt(8), this.disksCount = this.reader.readInt(4), 1 < this.disksCount) throw new Error("Multi-volumes zip are not supported");
          }, readLocalFiles: function() {
            var e3, t3;
            for (e3 = 0; e3 < this.files.length; e3++) t3 = this.files[e3], this.reader.setIndex(t3.localHeaderOffset), this.checkSignature(s.LOCAL_FILE_HEADER), t3.readLocalPart(this.reader), t3.handleUTF8(), t3.processAttributes();
          }, readCentralDir: function() {
            var e3;
            for (this.reader.setIndex(this.centralDirOffset); this.reader.readAndCheckSignature(s.CENTRAL_FILE_HEADER); ) (e3 = new a({ zip64: this.zip64 }, this.loadOptions)).readCentralPart(this.reader), this.files.push(e3);
            if (this.centralDirRecords !== this.files.length && 0 !== this.centralDirRecords && 0 === this.files.length) throw new Error("Corrupted zip or bug: expected " + this.centralDirRecords + " records in central dir, got " + this.files.length);
          }, readEndOfCentral: function() {
            var e3 = this.reader.lastIndexOfSignature(s.CENTRAL_DIRECTORY_END);
            if (e3 < 0) throw !this.isSignature(0, s.LOCAL_FILE_HEADER) ? new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html") : new Error("Corrupted zip: can't find end of central directory");
            this.reader.setIndex(e3);
            var t3 = e3;
            if (this.checkSignature(s.CENTRAL_DIRECTORY_END), this.readBlockEndOfCentral(), this.diskNumber === i.MAX_VALUE_16BITS || this.diskWithCentralDirStart === i.MAX_VALUE_16BITS || this.centralDirRecordsOnThisDisk === i.MAX_VALUE_16BITS || this.centralDirRecords === i.MAX_VALUE_16BITS || this.centralDirSize === i.MAX_VALUE_32BITS || this.centralDirOffset === i.MAX_VALUE_32BITS) {
              if (this.zip64 = true, (e3 = this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR)) < 0) throw new Error("Corrupted zip: can't find the ZIP64 end of central directory locator");
              if (this.reader.setIndex(e3), this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR), this.readBlockZip64EndOfCentralLocator(), !this.isSignature(this.relativeOffsetEndOfZip64CentralDir, s.ZIP64_CENTRAL_DIRECTORY_END) && (this.relativeOffsetEndOfZip64CentralDir = this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_END), this.relativeOffsetEndOfZip64CentralDir < 0)) throw new Error("Corrupted zip: can't find the ZIP64 end of central directory");
              this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir), this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_END), this.readBlockZip64EndOfCentral();
            }
            var r2 = this.centralDirOffset + this.centralDirSize;
            this.zip64 && (r2 += 20, r2 += 12 + this.zip64EndOfCentralSize);
            var n2 = t3 - r2;
            if (0 < n2) this.isSignature(t3, s.CENTRAL_FILE_HEADER) || (this.reader.zero = n2);
            else if (n2 < 0) throw new Error("Corrupted zip: missing " + Math.abs(n2) + " bytes.");
          }, prepareReader: function(e3) {
            this.reader = n(e3);
          }, load: function(e3) {
            this.prepareReader(e3), this.readEndOfCentral(), this.readCentralDir(), this.readLocalFiles();
          } }, t2.exports = h;
        }, { "./reader/readerFor": 22, "./signature": 23, "./support": 30, "./utils": 32, "./zipEntry": 34 }], 34: [function(e2, t2, r) {
          "use strict";
          var n = e2("./reader/readerFor"), s = e2("./utils"), i = e2("./compressedObject"), a = e2("./crc32"), o = e2("./utf8"), h = e2("./compressions"), u = e2("./support");
          function l(e3, t3) {
            this.options = e3, this.loadOptions = t3;
          }
          l.prototype = { isEncrypted: function() {
            return 1 == (1 & this.bitFlag);
          }, useUTF8: function() {
            return 2048 == (2048 & this.bitFlag);
          }, readLocalPart: function(e3) {
            var t3, r2;
            if (e3.skip(22), this.fileNameLength = e3.readInt(2), r2 = e3.readInt(2), this.fileName = e3.readData(this.fileNameLength), e3.skip(r2), -1 === this.compressedSize || -1 === this.uncompressedSize) throw new Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");
            if (null === (t3 = (function(e4) {
              for (var t4 in h) if (Object.prototype.hasOwnProperty.call(h, t4) && h[t4].magic === e4) return h[t4];
              return null;
            })(this.compressionMethod))) throw new Error("Corrupted zip : compression " + s.pretty(this.compressionMethod) + " unknown (inner file : " + s.transformTo("string", this.fileName) + ")");
            this.decompressed = new i(this.compressedSize, this.uncompressedSize, this.crc32, t3, e3.readData(this.compressedSize));
          }, readCentralPart: function(e3) {
            this.versionMadeBy = e3.readInt(2), e3.skip(2), this.bitFlag = e3.readInt(2), this.compressionMethod = e3.readString(2), this.date = e3.readDate(), this.crc32 = e3.readInt(4), this.compressedSize = e3.readInt(4), this.uncompressedSize = e3.readInt(4);
            var t3 = e3.readInt(2);
            if (this.extraFieldsLength = e3.readInt(2), this.fileCommentLength = e3.readInt(2), this.diskNumberStart = e3.readInt(2), this.internalFileAttributes = e3.readInt(2), this.externalFileAttributes = e3.readInt(4), this.localHeaderOffset = e3.readInt(4), this.isEncrypted()) throw new Error("Encrypted zip are not supported");
            e3.skip(t3), this.readExtraFields(e3), this.parseZIP64ExtraField(e3), this.fileComment = e3.readData(this.fileCommentLength);
          }, processAttributes: function() {
            this.unixPermissions = null, this.dosPermissions = null;
            var e3 = this.versionMadeBy >> 8;
            this.dir = !!(16 & this.externalFileAttributes), 0 == e3 && (this.dosPermissions = 63 & this.externalFileAttributes), 3 == e3 && (this.unixPermissions = this.externalFileAttributes >> 16 & 65535), this.dir || "/" !== this.fileNameStr.slice(-1) || (this.dir = true);
          }, parseZIP64ExtraField: function() {
            if (this.extraFields[1]) {
              var e3 = n(this.extraFields[1].value);
              this.uncompressedSize === s.MAX_VALUE_32BITS && (this.uncompressedSize = e3.readInt(8)), this.compressedSize === s.MAX_VALUE_32BITS && (this.compressedSize = e3.readInt(8)), this.localHeaderOffset === s.MAX_VALUE_32BITS && (this.localHeaderOffset = e3.readInt(8)), this.diskNumberStart === s.MAX_VALUE_32BITS && (this.diskNumberStart = e3.readInt(4));
            }
          }, readExtraFields: function(e3) {
            var t3, r2, n2, i2 = e3.index + this.extraFieldsLength;
            for (this.extraFields || (this.extraFields = {}); e3.index + 4 < i2; ) t3 = e3.readInt(2), r2 = e3.readInt(2), n2 = e3.readData(r2), this.extraFields[t3] = { id: t3, length: r2, value: n2 };
            e3.setIndex(i2);
          }, handleUTF8: function() {
            var e3 = u.uint8array ? "uint8array" : "array";
            if (this.useUTF8()) this.fileNameStr = o.utf8decode(this.fileName), this.fileCommentStr = o.utf8decode(this.fileComment);
            else {
              var t3 = this.findExtraFieldUnicodePath();
              if (null !== t3) this.fileNameStr = t3;
              else {
                var r2 = s.transformTo(e3, this.fileName);
                this.fileNameStr = this.loadOptions.decodeFileName(r2);
              }
              var n2 = this.findExtraFieldUnicodeComment();
              if (null !== n2) this.fileCommentStr = n2;
              else {
                var i2 = s.transformTo(e3, this.fileComment);
                this.fileCommentStr = this.loadOptions.decodeFileName(i2);
              }
            }
          }, findExtraFieldUnicodePath: function() {
            var e3 = this.extraFields[28789];
            if (e3) {
              var t3 = n(e3.value);
              return 1 !== t3.readInt(1) ? null : a(this.fileName) !== t3.readInt(4) ? null : o.utf8decode(t3.readData(e3.length - 5));
            }
            return null;
          }, findExtraFieldUnicodeComment: function() {
            var e3 = this.extraFields[25461];
            if (e3) {
              var t3 = n(e3.value);
              return 1 !== t3.readInt(1) ? null : a(this.fileComment) !== t3.readInt(4) ? null : o.utf8decode(t3.readData(e3.length - 5));
            }
            return null;
          } }, t2.exports = l;
        }, { "./compressedObject": 2, "./compressions": 3, "./crc32": 4, "./reader/readerFor": 22, "./support": 30, "./utf8": 31, "./utils": 32 }], 35: [function(e2, t2, r) {
          "use strict";
          function n(e3, t3, r2) {
            this.name = e3, this.dir = r2.dir, this.date = r2.date, this.comment = r2.comment, this.unixPermissions = r2.unixPermissions, this.dosPermissions = r2.dosPermissions, this._data = t3, this._dataBinary = r2.binary, this.options = { compression: r2.compression, compressionOptions: r2.compressionOptions };
          }
          var s = e2("./stream/StreamHelper"), i = e2("./stream/DataWorker"), a = e2("./utf8"), o = e2("./compressedObject"), h = e2("./stream/GenericWorker");
          n.prototype = { internalStream: function(e3) {
            var t3 = null, r2 = "string";
            try {
              if (!e3) throw new Error("No output type specified.");
              var n2 = "string" === (r2 = e3.toLowerCase()) || "text" === r2;
              "binarystring" !== r2 && "text" !== r2 || (r2 = "string"), t3 = this._decompressWorker();
              var i2 = !this._dataBinary;
              i2 && !n2 && (t3 = t3.pipe(new a.Utf8EncodeWorker())), !i2 && n2 && (t3 = t3.pipe(new a.Utf8DecodeWorker()));
            } catch (e4) {
              (t3 = new h("error")).error(e4);
            }
            return new s(t3, r2, "");
          }, async: function(e3, t3) {
            return this.internalStream(e3).accumulate(t3);
          }, nodeStream: function(e3, t3) {
            return this.internalStream(e3 || "nodebuffer").toNodejsStream(t3);
          }, _compressWorker: function(e3, t3) {
            if (this._data instanceof o && this._data.compression.magic === e3.magic) return this._data.getCompressedWorker();
            var r2 = this._decompressWorker();
            return this._dataBinary || (r2 = r2.pipe(new a.Utf8EncodeWorker())), o.createWorkerFrom(r2, e3, t3);
          }, _decompressWorker: function() {
            return this._data instanceof o ? this._data.getContentWorker() : this._data instanceof h ? this._data : new i(this._data);
          } };
          for (var u = ["asText", "asBinary", "asNodeBuffer", "asUint8Array", "asArrayBuffer"], l = function() {
            throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
          }, f = 0; f < u.length; f++) n.prototype[u[f]] = l;
          t2.exports = n;
        }, { "./compressedObject": 2, "./stream/DataWorker": 27, "./stream/GenericWorker": 28, "./stream/StreamHelper": 29, "./utf8": 31 }], 36: [function(e2, l, t2) {
          (function(t3) {
            "use strict";
            var r, n, e3 = t3.MutationObserver || t3.WebKitMutationObserver;
            if (e3) {
              var i = 0, s = new e3(u), a = t3.document.createTextNode("");
              s.observe(a, { characterData: true }), r = function() {
                a.data = i = ++i % 2;
              };
            } else if (t3.setImmediate || void 0 === t3.MessageChannel) r = "document" in t3 && "onreadystatechange" in t3.document.createElement("script") ? function() {
              var e4 = t3.document.createElement("script");
              e4.onreadystatechange = function() {
                u(), e4.onreadystatechange = null, e4.parentNode.removeChild(e4), e4 = null;
              }, t3.document.documentElement.appendChild(e4);
            } : function() {
              setTimeout(u, 0);
            };
            else {
              var o = new t3.MessageChannel();
              o.port1.onmessage = u, r = function() {
                o.port2.postMessage(0);
              };
            }
            var h = [];
            function u() {
              var e4, t4;
              n = true;
              for (var r2 = h.length; r2; ) {
                for (t4 = h, h = [], e4 = -1; ++e4 < r2; ) t4[e4]();
                r2 = h.length;
              }
              n = false;
            }
            l.exports = function(e4) {
              1 !== h.push(e4) || n || r();
            };
          }).call(this, "undefined" != typeof global ? global : "undefined" != typeof self ? self : "undefined" != typeof window ? window : {});
        }, {}], 37: [function(e2, t2, r) {
          "use strict";
          var i = e2("immediate");
          function u() {
          }
          var l = {}, s = ["REJECTED"], a = ["FULFILLED"], n = ["PENDING"];
          function o(e3) {
            if ("function" != typeof e3) throw new TypeError("resolver must be a function");
            this.state = n, this.queue = [], this.outcome = void 0, e3 !== u && d(this, e3);
          }
          function h(e3, t3, r2) {
            this.promise = e3, "function" == typeof t3 && (this.onFulfilled = t3, this.callFulfilled = this.otherCallFulfilled), "function" == typeof r2 && (this.onRejected = r2, this.callRejected = this.otherCallRejected);
          }
          function f(t3, r2, n2) {
            i(function() {
              var e3;
              try {
                e3 = r2(n2);
              } catch (e4) {
                return l.reject(t3, e4);
              }
              e3 === t3 ? l.reject(t3, new TypeError("Cannot resolve promise with itself")) : l.resolve(t3, e3);
            });
          }
          function c(e3) {
            var t3 = e3 && e3.then;
            if (e3 && ("object" == typeof e3 || "function" == typeof e3) && "function" == typeof t3) return function() {
              t3.apply(e3, arguments);
            };
          }
          function d(t3, e3) {
            var r2 = false;
            function n2(e4) {
              r2 || (r2 = true, l.reject(t3, e4));
            }
            function i2(e4) {
              r2 || (r2 = true, l.resolve(t3, e4));
            }
            var s2 = p(function() {
              e3(i2, n2);
            });
            "error" === s2.status && n2(s2.value);
          }
          function p(e3, t3) {
            var r2 = {};
            try {
              r2.value = e3(t3), r2.status = "success";
            } catch (e4) {
              r2.status = "error", r2.value = e4;
            }
            return r2;
          }
          (t2.exports = o).prototype.finally = function(t3) {
            if ("function" != typeof t3) return this;
            var r2 = this.constructor;
            return this.then(function(e3) {
              return r2.resolve(t3()).then(function() {
                return e3;
              });
            }, function(e3) {
              return r2.resolve(t3()).then(function() {
                throw e3;
              });
            });
          }, o.prototype.catch = function(e3) {
            return this.then(null, e3);
          }, o.prototype.then = function(e3, t3) {
            if ("function" != typeof e3 && this.state === a || "function" != typeof t3 && this.state === s) return this;
            var r2 = new this.constructor(u);
            this.state !== n ? f(r2, this.state === a ? e3 : t3, this.outcome) : this.queue.push(new h(r2, e3, t3));
            return r2;
          }, h.prototype.callFulfilled = function(e3) {
            l.resolve(this.promise, e3);
          }, h.prototype.otherCallFulfilled = function(e3) {
            f(this.promise, this.onFulfilled, e3);
          }, h.prototype.callRejected = function(e3) {
            l.reject(this.promise, e3);
          }, h.prototype.otherCallRejected = function(e3) {
            f(this.promise, this.onRejected, e3);
          }, l.resolve = function(e3, t3) {
            var r2 = p(c, t3);
            if ("error" === r2.status) return l.reject(e3, r2.value);
            var n2 = r2.value;
            if (n2) d(e3, n2);
            else {
              e3.state = a, e3.outcome = t3;
              for (var i2 = -1, s2 = e3.queue.length; ++i2 < s2; ) e3.queue[i2].callFulfilled(t3);
            }
            return e3;
          }, l.reject = function(e3, t3) {
            e3.state = s, e3.outcome = t3;
            for (var r2 = -1, n2 = e3.queue.length; ++r2 < n2; ) e3.queue[r2].callRejected(t3);
            return e3;
          }, o.resolve = function(e3) {
            if (e3 instanceof this) return e3;
            return l.resolve(new this(u), e3);
          }, o.reject = function(e3) {
            var t3 = new this(u);
            return l.reject(t3, e3);
          }, o.all = function(e3) {
            var r2 = this;
            if ("[object Array]" !== Object.prototype.toString.call(e3)) return this.reject(new TypeError("must be an array"));
            var n2 = e3.length, i2 = false;
            if (!n2) return this.resolve([]);
            var s2 = new Array(n2), a2 = 0, t3 = -1, o2 = new this(u);
            for (; ++t3 < n2; ) h2(e3[t3], t3);
            return o2;
            function h2(e4, t4) {
              r2.resolve(e4).then(function(e5) {
                s2[t4] = e5, ++a2 !== n2 || i2 || (i2 = true, l.resolve(o2, s2));
              }, function(e5) {
                i2 || (i2 = true, l.reject(o2, e5));
              });
            }
          }, o.race = function(e3) {
            var t3 = this;
            if ("[object Array]" !== Object.prototype.toString.call(e3)) return this.reject(new TypeError("must be an array"));
            var r2 = e3.length, n2 = false;
            if (!r2) return this.resolve([]);
            var i2 = -1, s2 = new this(u);
            for (; ++i2 < r2; ) a2 = e3[i2], t3.resolve(a2).then(function(e4) {
              n2 || (n2 = true, l.resolve(s2, e4));
            }, function(e4) {
              n2 || (n2 = true, l.reject(s2, e4));
            });
            var a2;
            return s2;
          };
        }, { immediate: 36 }], 38: [function(e2, t2, r) {
          "use strict";
          var n = {};
          (0, e2("./lib/utils/common").assign)(n, e2("./lib/deflate"), e2("./lib/inflate"), e2("./lib/zlib/constants")), t2.exports = n;
        }, { "./lib/deflate": 39, "./lib/inflate": 40, "./lib/utils/common": 41, "./lib/zlib/constants": 44 }], 39: [function(e2, t2, r) {
          "use strict";
          var a = e2("./zlib/deflate"), o = e2("./utils/common"), h = e2("./utils/strings"), i = e2("./zlib/messages"), s = e2("./zlib/zstream"), u = Object.prototype.toString, l = 0, f = -1, c = 0, d = 8;
          function p(e3) {
            if (!(this instanceof p)) return new p(e3);
            this.options = o.assign({ level: f, method: d, chunkSize: 16384, windowBits: 15, memLevel: 8, strategy: c, to: "" }, e3 || {});
            var t3 = this.options;
            t3.raw && 0 < t3.windowBits ? t3.windowBits = -t3.windowBits : t3.gzip && 0 < t3.windowBits && t3.windowBits < 16 && (t3.windowBits += 16), this.err = 0, this.msg = "", this.ended = false, this.chunks = [], this.strm = new s(), this.strm.avail_out = 0;
            var r2 = a.deflateInit2(this.strm, t3.level, t3.method, t3.windowBits, t3.memLevel, t3.strategy);
            if (r2 !== l) throw new Error(i[r2]);
            if (t3.header && a.deflateSetHeader(this.strm, t3.header), t3.dictionary) {
              var n2;
              if (n2 = "string" == typeof t3.dictionary ? h.string2buf(t3.dictionary) : "[object ArrayBuffer]" === u.call(t3.dictionary) ? new Uint8Array(t3.dictionary) : t3.dictionary, (r2 = a.deflateSetDictionary(this.strm, n2)) !== l) throw new Error(i[r2]);
              this._dict_set = true;
            }
          }
          function n(e3, t3) {
            var r2 = new p(t3);
            if (r2.push(e3, true), r2.err) throw r2.msg || i[r2.err];
            return r2.result;
          }
          p.prototype.push = function(e3, t3) {
            var r2, n2, i2 = this.strm, s2 = this.options.chunkSize;
            if (this.ended) return false;
            n2 = t3 === ~~t3 ? t3 : true === t3 ? 4 : 0, "string" == typeof e3 ? i2.input = h.string2buf(e3) : "[object ArrayBuffer]" === u.call(e3) ? i2.input = new Uint8Array(e3) : i2.input = e3, i2.next_in = 0, i2.avail_in = i2.input.length;
            do {
              if (0 === i2.avail_out && (i2.output = new o.Buf8(s2), i2.next_out = 0, i2.avail_out = s2), 1 !== (r2 = a.deflate(i2, n2)) && r2 !== l) return this.onEnd(r2), !(this.ended = true);
              0 !== i2.avail_out && (0 !== i2.avail_in || 4 !== n2 && 2 !== n2) || ("string" === this.options.to ? this.onData(h.buf2binstring(o.shrinkBuf(i2.output, i2.next_out))) : this.onData(o.shrinkBuf(i2.output, i2.next_out)));
            } while ((0 < i2.avail_in || 0 === i2.avail_out) && 1 !== r2);
            return 4 === n2 ? (r2 = a.deflateEnd(this.strm), this.onEnd(r2), this.ended = true, r2 === l) : 2 !== n2 || (this.onEnd(l), !(i2.avail_out = 0));
          }, p.prototype.onData = function(e3) {
            this.chunks.push(e3);
          }, p.prototype.onEnd = function(e3) {
            e3 === l && ("string" === this.options.to ? this.result = this.chunks.join("") : this.result = o.flattenChunks(this.chunks)), this.chunks = [], this.err = e3, this.msg = this.strm.msg;
          }, r.Deflate = p, r.deflate = n, r.deflateRaw = function(e3, t3) {
            return (t3 = t3 || {}).raw = true, n(e3, t3);
          }, r.gzip = function(e3, t3) {
            return (t3 = t3 || {}).gzip = true, n(e3, t3);
          };
        }, { "./utils/common": 41, "./utils/strings": 42, "./zlib/deflate": 46, "./zlib/messages": 51, "./zlib/zstream": 53 }], 40: [function(e2, t2, r) {
          "use strict";
          var c = e2("./zlib/inflate"), d = e2("./utils/common"), p = e2("./utils/strings"), m = e2("./zlib/constants"), n = e2("./zlib/messages"), i = e2("./zlib/zstream"), s = e2("./zlib/gzheader"), _ = Object.prototype.toString;
          function a(e3) {
            if (!(this instanceof a)) return new a(e3);
            this.options = d.assign({ chunkSize: 16384, windowBits: 0, to: "" }, e3 || {});
            var t3 = this.options;
            t3.raw && 0 <= t3.windowBits && t3.windowBits < 16 && (t3.windowBits = -t3.windowBits, 0 === t3.windowBits && (t3.windowBits = -15)), !(0 <= t3.windowBits && t3.windowBits < 16) || e3 && e3.windowBits || (t3.windowBits += 32), 15 < t3.windowBits && t3.windowBits < 48 && 0 == (15 & t3.windowBits) && (t3.windowBits |= 15), this.err = 0, this.msg = "", this.ended = false, this.chunks = [], this.strm = new i(), this.strm.avail_out = 0;
            var r2 = c.inflateInit2(this.strm, t3.windowBits);
            if (r2 !== m.Z_OK) throw new Error(n[r2]);
            this.header = new s(), c.inflateGetHeader(this.strm, this.header);
          }
          function o(e3, t3) {
            var r2 = new a(t3);
            if (r2.push(e3, true), r2.err) throw r2.msg || n[r2.err];
            return r2.result;
          }
          a.prototype.push = function(e3, t3) {
            var r2, n2, i2, s2, a2, o2, h = this.strm, u = this.options.chunkSize, l = this.options.dictionary, f = false;
            if (this.ended) return false;
            n2 = t3 === ~~t3 ? t3 : true === t3 ? m.Z_FINISH : m.Z_NO_FLUSH, "string" == typeof e3 ? h.input = p.binstring2buf(e3) : "[object ArrayBuffer]" === _.call(e3) ? h.input = new Uint8Array(e3) : h.input = e3, h.next_in = 0, h.avail_in = h.input.length;
            do {
              if (0 === h.avail_out && (h.output = new d.Buf8(u), h.next_out = 0, h.avail_out = u), (r2 = c.inflate(h, m.Z_NO_FLUSH)) === m.Z_NEED_DICT && l && (o2 = "string" == typeof l ? p.string2buf(l) : "[object ArrayBuffer]" === _.call(l) ? new Uint8Array(l) : l, r2 = c.inflateSetDictionary(this.strm, o2)), r2 === m.Z_BUF_ERROR && true === f && (r2 = m.Z_OK, f = false), r2 !== m.Z_STREAM_END && r2 !== m.Z_OK) return this.onEnd(r2), !(this.ended = true);
              h.next_out && (0 !== h.avail_out && r2 !== m.Z_STREAM_END && (0 !== h.avail_in || n2 !== m.Z_FINISH && n2 !== m.Z_SYNC_FLUSH) || ("string" === this.options.to ? (i2 = p.utf8border(h.output, h.next_out), s2 = h.next_out - i2, a2 = p.buf2string(h.output, i2), h.next_out = s2, h.avail_out = u - s2, s2 && d.arraySet(h.output, h.output, i2, s2, 0), this.onData(a2)) : this.onData(d.shrinkBuf(h.output, h.next_out)))), 0 === h.avail_in && 0 === h.avail_out && (f = true);
            } while ((0 < h.avail_in || 0 === h.avail_out) && r2 !== m.Z_STREAM_END);
            return r2 === m.Z_STREAM_END && (n2 = m.Z_FINISH), n2 === m.Z_FINISH ? (r2 = c.inflateEnd(this.strm), this.onEnd(r2), this.ended = true, r2 === m.Z_OK) : n2 !== m.Z_SYNC_FLUSH || (this.onEnd(m.Z_OK), !(h.avail_out = 0));
          }, a.prototype.onData = function(e3) {
            this.chunks.push(e3);
          }, a.prototype.onEnd = function(e3) {
            e3 === m.Z_OK && ("string" === this.options.to ? this.result = this.chunks.join("") : this.result = d.flattenChunks(this.chunks)), this.chunks = [], this.err = e3, this.msg = this.strm.msg;
          }, r.Inflate = a, r.inflate = o, r.inflateRaw = function(e3, t3) {
            return (t3 = t3 || {}).raw = true, o(e3, t3);
          }, r.ungzip = o;
        }, { "./utils/common": 41, "./utils/strings": 42, "./zlib/constants": 44, "./zlib/gzheader": 47, "./zlib/inflate": 49, "./zlib/messages": 51, "./zlib/zstream": 53 }], 41: [function(e2, t2, r) {
          "use strict";
          var n = "undefined" != typeof Uint8Array && "undefined" != typeof Uint16Array && "undefined" != typeof Int32Array;
          r.assign = function(e3) {
            for (var t3 = Array.prototype.slice.call(arguments, 1); t3.length; ) {
              var r2 = t3.shift();
              if (r2) {
                if ("object" != typeof r2) throw new TypeError(r2 + "must be non-object");
                for (var n2 in r2) r2.hasOwnProperty(n2) && (e3[n2] = r2[n2]);
              }
            }
            return e3;
          }, r.shrinkBuf = function(e3, t3) {
            return e3.length === t3 ? e3 : e3.subarray ? e3.subarray(0, t3) : (e3.length = t3, e3);
          };
          var i = { arraySet: function(e3, t3, r2, n2, i2) {
            if (t3.subarray && e3.subarray) e3.set(t3.subarray(r2, r2 + n2), i2);
            else for (var s2 = 0; s2 < n2; s2++) e3[i2 + s2] = t3[r2 + s2];
          }, flattenChunks: function(e3) {
            var t3, r2, n2, i2, s2, a;
            for (t3 = n2 = 0, r2 = e3.length; t3 < r2; t3++) n2 += e3[t3].length;
            for (a = new Uint8Array(n2), t3 = i2 = 0, r2 = e3.length; t3 < r2; t3++) s2 = e3[t3], a.set(s2, i2), i2 += s2.length;
            return a;
          } }, s = { arraySet: function(e3, t3, r2, n2, i2) {
            for (var s2 = 0; s2 < n2; s2++) e3[i2 + s2] = t3[r2 + s2];
          }, flattenChunks: function(e3) {
            return [].concat.apply([], e3);
          } };
          r.setTyped = function(e3) {
            e3 ? (r.Buf8 = Uint8Array, r.Buf16 = Uint16Array, r.Buf32 = Int32Array, r.assign(r, i)) : (r.Buf8 = Array, r.Buf16 = Array, r.Buf32 = Array, r.assign(r, s));
          }, r.setTyped(n);
        }, {}], 42: [function(e2, t2, r) {
          "use strict";
          var h = e2("./common"), i = true, s = true;
          try {
            String.fromCharCode.apply(null, [0]);
          } catch (e3) {
            i = false;
          }
          try {
            String.fromCharCode.apply(null, new Uint8Array(1));
          } catch (e3) {
            s = false;
          }
          for (var u = new h.Buf8(256), n = 0; n < 256; n++) u[n] = 252 <= n ? 6 : 248 <= n ? 5 : 240 <= n ? 4 : 224 <= n ? 3 : 192 <= n ? 2 : 1;
          function l(e3, t3) {
            if (t3 < 65537 && (e3.subarray && s || !e3.subarray && i)) return String.fromCharCode.apply(null, h.shrinkBuf(e3, t3));
            for (var r2 = "", n2 = 0; n2 < t3; n2++) r2 += String.fromCharCode(e3[n2]);
            return r2;
          }
          u[254] = u[254] = 1, r.string2buf = function(e3) {
            var t3, r2, n2, i2, s2, a = e3.length, o = 0;
            for (i2 = 0; i2 < a; i2++) 55296 == (64512 & (r2 = e3.charCodeAt(i2))) && i2 + 1 < a && 56320 == (64512 & (n2 = e3.charCodeAt(i2 + 1))) && (r2 = 65536 + (r2 - 55296 << 10) + (n2 - 56320), i2++), o += r2 < 128 ? 1 : r2 < 2048 ? 2 : r2 < 65536 ? 3 : 4;
            for (t3 = new h.Buf8(o), i2 = s2 = 0; s2 < o; i2++) 55296 == (64512 & (r2 = e3.charCodeAt(i2))) && i2 + 1 < a && 56320 == (64512 & (n2 = e3.charCodeAt(i2 + 1))) && (r2 = 65536 + (r2 - 55296 << 10) + (n2 - 56320), i2++), r2 < 128 ? t3[s2++] = r2 : (r2 < 2048 ? t3[s2++] = 192 | r2 >>> 6 : (r2 < 65536 ? t3[s2++] = 224 | r2 >>> 12 : (t3[s2++] = 240 | r2 >>> 18, t3[s2++] = 128 | r2 >>> 12 & 63), t3[s2++] = 128 | r2 >>> 6 & 63), t3[s2++] = 128 | 63 & r2);
            return t3;
          }, r.buf2binstring = function(e3) {
            return l(e3, e3.length);
          }, r.binstring2buf = function(e3) {
            for (var t3 = new h.Buf8(e3.length), r2 = 0, n2 = t3.length; r2 < n2; r2++) t3[r2] = e3.charCodeAt(r2);
            return t3;
          }, r.buf2string = function(e3, t3) {
            var r2, n2, i2, s2, a = t3 || e3.length, o = new Array(2 * a);
            for (r2 = n2 = 0; r2 < a; ) if ((i2 = e3[r2++]) < 128) o[n2++] = i2;
            else if (4 < (s2 = u[i2])) o[n2++] = 65533, r2 += s2 - 1;
            else {
              for (i2 &= 2 === s2 ? 31 : 3 === s2 ? 15 : 7; 1 < s2 && r2 < a; ) i2 = i2 << 6 | 63 & e3[r2++], s2--;
              1 < s2 ? o[n2++] = 65533 : i2 < 65536 ? o[n2++] = i2 : (i2 -= 65536, o[n2++] = 55296 | i2 >> 10 & 1023, o[n2++] = 56320 | 1023 & i2);
            }
            return l(o, n2);
          }, r.utf8border = function(e3, t3) {
            var r2;
            for ((t3 = t3 || e3.length) > e3.length && (t3 = e3.length), r2 = t3 - 1; 0 <= r2 && 128 == (192 & e3[r2]); ) r2--;
            return r2 < 0 ? t3 : 0 === r2 ? t3 : r2 + u[e3[r2]] > t3 ? r2 : t3;
          };
        }, { "./common": 41 }], 43: [function(e2, t2, r) {
          "use strict";
          t2.exports = function(e3, t3, r2, n) {
            for (var i = 65535 & e3 | 0, s = e3 >>> 16 & 65535 | 0, a = 0; 0 !== r2; ) {
              for (r2 -= a = 2e3 < r2 ? 2e3 : r2; s = s + (i = i + t3[n++] | 0) | 0, --a; ) ;
              i %= 65521, s %= 65521;
            }
            return i | s << 16 | 0;
          };
        }, {}], 44: [function(e2, t2, r) {
          "use strict";
          t2.exports = { Z_NO_FLUSH: 0, Z_PARTIAL_FLUSH: 1, Z_SYNC_FLUSH: 2, Z_FULL_FLUSH: 3, Z_FINISH: 4, Z_BLOCK: 5, Z_TREES: 6, Z_OK: 0, Z_STREAM_END: 1, Z_NEED_DICT: 2, Z_ERRNO: -1, Z_STREAM_ERROR: -2, Z_DATA_ERROR: -3, Z_BUF_ERROR: -5, Z_NO_COMPRESSION: 0, Z_BEST_SPEED: 1, Z_BEST_COMPRESSION: 9, Z_DEFAULT_COMPRESSION: -1, Z_FILTERED: 1, Z_HUFFMAN_ONLY: 2, Z_RLE: 3, Z_FIXED: 4, Z_DEFAULT_STRATEGY: 0, Z_BINARY: 0, Z_TEXT: 1, Z_UNKNOWN: 2, Z_DEFLATED: 8 };
        }, {}], 45: [function(e2, t2, r) {
          "use strict";
          var o = (function() {
            for (var e3, t3 = [], r2 = 0; r2 < 256; r2++) {
              e3 = r2;
              for (var n = 0; n < 8; n++) e3 = 1 & e3 ? 3988292384 ^ e3 >>> 1 : e3 >>> 1;
              t3[r2] = e3;
            }
            return t3;
          })();
          t2.exports = function(e3, t3, r2, n) {
            var i = o, s = n + r2;
            e3 ^= -1;
            for (var a = n; a < s; a++) e3 = e3 >>> 8 ^ i[255 & (e3 ^ t3[a])];
            return -1 ^ e3;
          };
        }, {}], 46: [function(e2, t2, r) {
          "use strict";
          var h, c = e2("../utils/common"), u = e2("./trees"), d = e2("./adler32"), p = e2("./crc32"), n = e2("./messages"), l = 0, f = 4, m = 0, _ = -2, g = -1, b = 4, i = 2, v = 8, y = 9, s = 286, a = 30, o = 19, w = 2 * s + 1, k = 15, x = 3, S = 258, z = S + x + 1, C = 42, E = 113, A = 1, I = 2, O = 3, B = 4;
          function R(e3, t3) {
            return e3.msg = n[t3], t3;
          }
          function T(e3) {
            return (e3 << 1) - (4 < e3 ? 9 : 0);
          }
          function D(e3) {
            for (var t3 = e3.length; 0 <= --t3; ) e3[t3] = 0;
          }
          function F(e3) {
            var t3 = e3.state, r2 = t3.pending;
            r2 > e3.avail_out && (r2 = e3.avail_out), 0 !== r2 && (c.arraySet(e3.output, t3.pending_buf, t3.pending_out, r2, e3.next_out), e3.next_out += r2, t3.pending_out += r2, e3.total_out += r2, e3.avail_out -= r2, t3.pending -= r2, 0 === t3.pending && (t3.pending_out = 0));
          }
          function N(e3, t3) {
            u._tr_flush_block(e3, 0 <= e3.block_start ? e3.block_start : -1, e3.strstart - e3.block_start, t3), e3.block_start = e3.strstart, F(e3.strm);
          }
          function U(e3, t3) {
            e3.pending_buf[e3.pending++] = t3;
          }
          function P(e3, t3) {
            e3.pending_buf[e3.pending++] = t3 >>> 8 & 255, e3.pending_buf[e3.pending++] = 255 & t3;
          }
          function L(e3, t3) {
            var r2, n2, i2 = e3.max_chain_length, s2 = e3.strstart, a2 = e3.prev_length, o2 = e3.nice_match, h2 = e3.strstart > e3.w_size - z ? e3.strstart - (e3.w_size - z) : 0, u2 = e3.window, l2 = e3.w_mask, f2 = e3.prev, c2 = e3.strstart + S, d2 = u2[s2 + a2 - 1], p2 = u2[s2 + a2];
            e3.prev_length >= e3.good_match && (i2 >>= 2), o2 > e3.lookahead && (o2 = e3.lookahead);
            do {
              if (u2[(r2 = t3) + a2] === p2 && u2[r2 + a2 - 1] === d2 && u2[r2] === u2[s2] && u2[++r2] === u2[s2 + 1]) {
                s2 += 2, r2++;
                do {
                } while (u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && u2[++s2] === u2[++r2] && s2 < c2);
                if (n2 = S - (c2 - s2), s2 = c2 - S, a2 < n2) {
                  if (e3.match_start = t3, o2 <= (a2 = n2)) break;
                  d2 = u2[s2 + a2 - 1], p2 = u2[s2 + a2];
                }
              }
            } while ((t3 = f2[t3 & l2]) > h2 && 0 != --i2);
            return a2 <= e3.lookahead ? a2 : e3.lookahead;
          }
          function j(e3) {
            var t3, r2, n2, i2, s2, a2, o2, h2, u2, l2, f2 = e3.w_size;
            do {
              if (i2 = e3.window_size - e3.lookahead - e3.strstart, e3.strstart >= f2 + (f2 - z)) {
                for (c.arraySet(e3.window, e3.window, f2, f2, 0), e3.match_start -= f2, e3.strstart -= f2, e3.block_start -= f2, t3 = r2 = e3.hash_size; n2 = e3.head[--t3], e3.head[t3] = f2 <= n2 ? n2 - f2 : 0, --r2; ) ;
                for (t3 = r2 = f2; n2 = e3.prev[--t3], e3.prev[t3] = f2 <= n2 ? n2 - f2 : 0, --r2; ) ;
                i2 += f2;
              }
              if (0 === e3.strm.avail_in) break;
              if (a2 = e3.strm, o2 = e3.window, h2 = e3.strstart + e3.lookahead, u2 = i2, l2 = void 0, l2 = a2.avail_in, u2 < l2 && (l2 = u2), r2 = 0 === l2 ? 0 : (a2.avail_in -= l2, c.arraySet(o2, a2.input, a2.next_in, l2, h2), 1 === a2.state.wrap ? a2.adler = d(a2.adler, o2, l2, h2) : 2 === a2.state.wrap && (a2.adler = p(a2.adler, o2, l2, h2)), a2.next_in += l2, a2.total_in += l2, l2), e3.lookahead += r2, e3.lookahead + e3.insert >= x) for (s2 = e3.strstart - e3.insert, e3.ins_h = e3.window[s2], e3.ins_h = (e3.ins_h << e3.hash_shift ^ e3.window[s2 + 1]) & e3.hash_mask; e3.insert && (e3.ins_h = (e3.ins_h << e3.hash_shift ^ e3.window[s2 + x - 1]) & e3.hash_mask, e3.prev[s2 & e3.w_mask] = e3.head[e3.ins_h], e3.head[e3.ins_h] = s2, s2++, e3.insert--, !(e3.lookahead + e3.insert < x)); ) ;
            } while (e3.lookahead < z && 0 !== e3.strm.avail_in);
          }
          function Z(e3, t3) {
            for (var r2, n2; ; ) {
              if (e3.lookahead < z) {
                if (j(e3), e3.lookahead < z && t3 === l) return A;
                if (0 === e3.lookahead) break;
              }
              if (r2 = 0, e3.lookahead >= x && (e3.ins_h = (e3.ins_h << e3.hash_shift ^ e3.window[e3.strstart + x - 1]) & e3.hash_mask, r2 = e3.prev[e3.strstart & e3.w_mask] = e3.head[e3.ins_h], e3.head[e3.ins_h] = e3.strstart), 0 !== r2 && e3.strstart - r2 <= e3.w_size - z && (e3.match_length = L(e3, r2)), e3.match_length >= x) if (n2 = u._tr_tally(e3, e3.strstart - e3.match_start, e3.match_length - x), e3.lookahead -= e3.match_length, e3.match_length <= e3.max_lazy_match && e3.lookahead >= x) {
                for (e3.match_length--; e3.strstart++, e3.ins_h = (e3.ins_h << e3.hash_shift ^ e3.window[e3.strstart + x - 1]) & e3.hash_mask, r2 = e3.prev[e3.strstart & e3.w_mask] = e3.head[e3.ins_h], e3.head[e3.ins_h] = e3.strstart, 0 != --e3.match_length; ) ;
                e3.strstart++;
              } else e3.strstart += e3.match_length, e3.match_length = 0, e3.ins_h = e3.window[e3.strstart], e3.ins_h = (e3.ins_h << e3.hash_shift ^ e3.window[e3.strstart + 1]) & e3.hash_mask;
              else n2 = u._tr_tally(e3, 0, e3.window[e3.strstart]), e3.lookahead--, e3.strstart++;
              if (n2 && (N(e3, false), 0 === e3.strm.avail_out)) return A;
            }
            return e3.insert = e3.strstart < x - 1 ? e3.strstart : x - 1, t3 === f ? (N(e3, true), 0 === e3.strm.avail_out ? O : B) : e3.last_lit && (N(e3, false), 0 === e3.strm.avail_out) ? A : I;
          }
          function W(e3, t3) {
            for (var r2, n2, i2; ; ) {
              if (e3.lookahead < z) {
                if (j(e3), e3.lookahead < z && t3 === l) return A;
                if (0 === e3.lookahead) break;
              }
              if (r2 = 0, e3.lookahead >= x && (e3.ins_h = (e3.ins_h << e3.hash_shift ^ e3.window[e3.strstart + x - 1]) & e3.hash_mask, r2 = e3.prev[e3.strstart & e3.w_mask] = e3.head[e3.ins_h], e3.head[e3.ins_h] = e3.strstart), e3.prev_length = e3.match_length, e3.prev_match = e3.match_start, e3.match_length = x - 1, 0 !== r2 && e3.prev_length < e3.max_lazy_match && e3.strstart - r2 <= e3.w_size - z && (e3.match_length = L(e3, r2), e3.match_length <= 5 && (1 === e3.strategy || e3.match_length === x && 4096 < e3.strstart - e3.match_start) && (e3.match_length = x - 1)), e3.prev_length >= x && e3.match_length <= e3.prev_length) {
                for (i2 = e3.strstart + e3.lookahead - x, n2 = u._tr_tally(e3, e3.strstart - 1 - e3.prev_match, e3.prev_length - x), e3.lookahead -= e3.prev_length - 1, e3.prev_length -= 2; ++e3.strstart <= i2 && (e3.ins_h = (e3.ins_h << e3.hash_shift ^ e3.window[e3.strstart + x - 1]) & e3.hash_mask, r2 = e3.prev[e3.strstart & e3.w_mask] = e3.head[e3.ins_h], e3.head[e3.ins_h] = e3.strstart), 0 != --e3.prev_length; ) ;
                if (e3.match_available = 0, e3.match_length = x - 1, e3.strstart++, n2 && (N(e3, false), 0 === e3.strm.avail_out)) return A;
              } else if (e3.match_available) {
                if ((n2 = u._tr_tally(e3, 0, e3.window[e3.strstart - 1])) && N(e3, false), e3.strstart++, e3.lookahead--, 0 === e3.strm.avail_out) return A;
              } else e3.match_available = 1, e3.strstart++, e3.lookahead--;
            }
            return e3.match_available && (n2 = u._tr_tally(e3, 0, e3.window[e3.strstart - 1]), e3.match_available = 0), e3.insert = e3.strstart < x - 1 ? e3.strstart : x - 1, t3 === f ? (N(e3, true), 0 === e3.strm.avail_out ? O : B) : e3.last_lit && (N(e3, false), 0 === e3.strm.avail_out) ? A : I;
          }
          function M(e3, t3, r2, n2, i2) {
            this.good_length = e3, this.max_lazy = t3, this.nice_length = r2, this.max_chain = n2, this.func = i2;
          }
          function H() {
            this.strm = null, this.status = 0, this.pending_buf = null, this.pending_buf_size = 0, this.pending_out = 0, this.pending = 0, this.wrap = 0, this.gzhead = null, this.gzindex = 0, this.method = v, this.last_flush = -1, this.w_size = 0, this.w_bits = 0, this.w_mask = 0, this.window = null, this.window_size = 0, this.prev = null, this.head = null, this.ins_h = 0, this.hash_size = 0, this.hash_bits = 0, this.hash_mask = 0, this.hash_shift = 0, this.block_start = 0, this.match_length = 0, this.prev_match = 0, this.match_available = 0, this.strstart = 0, this.match_start = 0, this.lookahead = 0, this.prev_length = 0, this.max_chain_length = 0, this.max_lazy_match = 0, this.level = 0, this.strategy = 0, this.good_match = 0, this.nice_match = 0, this.dyn_ltree = new c.Buf16(2 * w), this.dyn_dtree = new c.Buf16(2 * (2 * a + 1)), this.bl_tree = new c.Buf16(2 * (2 * o + 1)), D(this.dyn_ltree), D(this.dyn_dtree), D(this.bl_tree), this.l_desc = null, this.d_desc = null, this.bl_desc = null, this.bl_count = new c.Buf16(k + 1), this.heap = new c.Buf16(2 * s + 1), D(this.heap), this.heap_len = 0, this.heap_max = 0, this.depth = new c.Buf16(2 * s + 1), D(this.depth), this.l_buf = 0, this.lit_bufsize = 0, this.last_lit = 0, this.d_buf = 0, this.opt_len = 0, this.static_len = 0, this.matches = 0, this.insert = 0, this.bi_buf = 0, this.bi_valid = 0;
          }
          function G(e3) {
            var t3;
            return e3 && e3.state ? (e3.total_in = e3.total_out = 0, e3.data_type = i, (t3 = e3.state).pending = 0, t3.pending_out = 0, t3.wrap < 0 && (t3.wrap = -t3.wrap), t3.status = t3.wrap ? C : E, e3.adler = 2 === t3.wrap ? 0 : 1, t3.last_flush = l, u._tr_init(t3), m) : R(e3, _);
          }
          function K(e3) {
            var t3 = G(e3);
            return t3 === m && (function(e4) {
              e4.window_size = 2 * e4.w_size, D(e4.head), e4.max_lazy_match = h[e4.level].max_lazy, e4.good_match = h[e4.level].good_length, e4.nice_match = h[e4.level].nice_length, e4.max_chain_length = h[e4.level].max_chain, e4.strstart = 0, e4.block_start = 0, e4.lookahead = 0, e4.insert = 0, e4.match_length = e4.prev_length = x - 1, e4.match_available = 0, e4.ins_h = 0;
            })(e3.state), t3;
          }
          function Y(e3, t3, r2, n2, i2, s2) {
            if (!e3) return _;
            var a2 = 1;
            if (t3 === g && (t3 = 6), n2 < 0 ? (a2 = 0, n2 = -n2) : 15 < n2 && (a2 = 2, n2 -= 16), i2 < 1 || y < i2 || r2 !== v || n2 < 8 || 15 < n2 || t3 < 0 || 9 < t3 || s2 < 0 || b < s2) return R(e3, _);
            8 === n2 && (n2 = 9);
            var o2 = new H();
            return (e3.state = o2).strm = e3, o2.wrap = a2, o2.gzhead = null, o2.w_bits = n2, o2.w_size = 1 << o2.w_bits, o2.w_mask = o2.w_size - 1, o2.hash_bits = i2 + 7, o2.hash_size = 1 << o2.hash_bits, o2.hash_mask = o2.hash_size - 1, o2.hash_shift = ~~((o2.hash_bits + x - 1) / x), o2.window = new c.Buf8(2 * o2.w_size), o2.head = new c.Buf16(o2.hash_size), o2.prev = new c.Buf16(o2.w_size), o2.lit_bufsize = 1 << i2 + 6, o2.pending_buf_size = 4 * o2.lit_bufsize, o2.pending_buf = new c.Buf8(o2.pending_buf_size), o2.d_buf = 1 * o2.lit_bufsize, o2.l_buf = 3 * o2.lit_bufsize, o2.level = t3, o2.strategy = s2, o2.method = r2, K(e3);
          }
          h = [new M(0, 0, 0, 0, function(e3, t3) {
            var r2 = 65535;
            for (r2 > e3.pending_buf_size - 5 && (r2 = e3.pending_buf_size - 5); ; ) {
              if (e3.lookahead <= 1) {
                if (j(e3), 0 === e3.lookahead && t3 === l) return A;
                if (0 === e3.lookahead) break;
              }
              e3.strstart += e3.lookahead, e3.lookahead = 0;
              var n2 = e3.block_start + r2;
              if ((0 === e3.strstart || e3.strstart >= n2) && (e3.lookahead = e3.strstart - n2, e3.strstart = n2, N(e3, false), 0 === e3.strm.avail_out)) return A;
              if (e3.strstart - e3.block_start >= e3.w_size - z && (N(e3, false), 0 === e3.strm.avail_out)) return A;
            }
            return e3.insert = 0, t3 === f ? (N(e3, true), 0 === e3.strm.avail_out ? O : B) : (e3.strstart > e3.block_start && (N(e3, false), e3.strm.avail_out), A);
          }), new M(4, 4, 8, 4, Z), new M(4, 5, 16, 8, Z), new M(4, 6, 32, 32, Z), new M(4, 4, 16, 16, W), new M(8, 16, 32, 32, W), new M(8, 16, 128, 128, W), new M(8, 32, 128, 256, W), new M(32, 128, 258, 1024, W), new M(32, 258, 258, 4096, W)], r.deflateInit = function(e3, t3) {
            return Y(e3, t3, v, 15, 8, 0);
          }, r.deflateInit2 = Y, r.deflateReset = K, r.deflateResetKeep = G, r.deflateSetHeader = function(e3, t3) {
            return e3 && e3.state ? 2 !== e3.state.wrap ? _ : (e3.state.gzhead = t3, m) : _;
          }, r.deflate = function(e3, t3) {
            var r2, n2, i2, s2;
            if (!e3 || !e3.state || 5 < t3 || t3 < 0) return e3 ? R(e3, _) : _;
            if (n2 = e3.state, !e3.output || !e3.input && 0 !== e3.avail_in || 666 === n2.status && t3 !== f) return R(e3, 0 === e3.avail_out ? -5 : _);
            if (n2.strm = e3, r2 = n2.last_flush, n2.last_flush = t3, n2.status === C) if (2 === n2.wrap) e3.adler = 0, U(n2, 31), U(n2, 139), U(n2, 8), n2.gzhead ? (U(n2, (n2.gzhead.text ? 1 : 0) + (n2.gzhead.hcrc ? 2 : 0) + (n2.gzhead.extra ? 4 : 0) + (n2.gzhead.name ? 8 : 0) + (n2.gzhead.comment ? 16 : 0)), U(n2, 255 & n2.gzhead.time), U(n2, n2.gzhead.time >> 8 & 255), U(n2, n2.gzhead.time >> 16 & 255), U(n2, n2.gzhead.time >> 24 & 255), U(n2, 9 === n2.level ? 2 : 2 <= n2.strategy || n2.level < 2 ? 4 : 0), U(n2, 255 & n2.gzhead.os), n2.gzhead.extra && n2.gzhead.extra.length && (U(n2, 255 & n2.gzhead.extra.length), U(n2, n2.gzhead.extra.length >> 8 & 255)), n2.gzhead.hcrc && (e3.adler = p(e3.adler, n2.pending_buf, n2.pending, 0)), n2.gzindex = 0, n2.status = 69) : (U(n2, 0), U(n2, 0), U(n2, 0), U(n2, 0), U(n2, 0), U(n2, 9 === n2.level ? 2 : 2 <= n2.strategy || n2.level < 2 ? 4 : 0), U(n2, 3), n2.status = E);
            else {
              var a2 = v + (n2.w_bits - 8 << 4) << 8;
              a2 |= (2 <= n2.strategy || n2.level < 2 ? 0 : n2.level < 6 ? 1 : 6 === n2.level ? 2 : 3) << 6, 0 !== n2.strstart && (a2 |= 32), a2 += 31 - a2 % 31, n2.status = E, P(n2, a2), 0 !== n2.strstart && (P(n2, e3.adler >>> 16), P(n2, 65535 & e3.adler)), e3.adler = 1;
            }
            if (69 === n2.status) if (n2.gzhead.extra) {
              for (i2 = n2.pending; n2.gzindex < (65535 & n2.gzhead.extra.length) && (n2.pending !== n2.pending_buf_size || (n2.gzhead.hcrc && n2.pending > i2 && (e3.adler = p(e3.adler, n2.pending_buf, n2.pending - i2, i2)), F(e3), i2 = n2.pending, n2.pending !== n2.pending_buf_size)); ) U(n2, 255 & n2.gzhead.extra[n2.gzindex]), n2.gzindex++;
              n2.gzhead.hcrc && n2.pending > i2 && (e3.adler = p(e3.adler, n2.pending_buf, n2.pending - i2, i2)), n2.gzindex === n2.gzhead.extra.length && (n2.gzindex = 0, n2.status = 73);
            } else n2.status = 73;
            if (73 === n2.status) if (n2.gzhead.name) {
              i2 = n2.pending;
              do {
                if (n2.pending === n2.pending_buf_size && (n2.gzhead.hcrc && n2.pending > i2 && (e3.adler = p(e3.adler, n2.pending_buf, n2.pending - i2, i2)), F(e3), i2 = n2.pending, n2.pending === n2.pending_buf_size)) {
                  s2 = 1;
                  break;
                }
                s2 = n2.gzindex < n2.gzhead.name.length ? 255 & n2.gzhead.name.charCodeAt(n2.gzindex++) : 0, U(n2, s2);
              } while (0 !== s2);
              n2.gzhead.hcrc && n2.pending > i2 && (e3.adler = p(e3.adler, n2.pending_buf, n2.pending - i2, i2)), 0 === s2 && (n2.gzindex = 0, n2.status = 91);
            } else n2.status = 91;
            if (91 === n2.status) if (n2.gzhead.comment) {
              i2 = n2.pending;
              do {
                if (n2.pending === n2.pending_buf_size && (n2.gzhead.hcrc && n2.pending > i2 && (e3.adler = p(e3.adler, n2.pending_buf, n2.pending - i2, i2)), F(e3), i2 = n2.pending, n2.pending === n2.pending_buf_size)) {
                  s2 = 1;
                  break;
                }
                s2 = n2.gzindex < n2.gzhead.comment.length ? 255 & n2.gzhead.comment.charCodeAt(n2.gzindex++) : 0, U(n2, s2);
              } while (0 !== s2);
              n2.gzhead.hcrc && n2.pending > i2 && (e3.adler = p(e3.adler, n2.pending_buf, n2.pending - i2, i2)), 0 === s2 && (n2.status = 103);
            } else n2.status = 103;
            if (103 === n2.status && (n2.gzhead.hcrc ? (n2.pending + 2 > n2.pending_buf_size && F(e3), n2.pending + 2 <= n2.pending_buf_size && (U(n2, 255 & e3.adler), U(n2, e3.adler >> 8 & 255), e3.adler = 0, n2.status = E)) : n2.status = E), 0 !== n2.pending) {
              if (F(e3), 0 === e3.avail_out) return n2.last_flush = -1, m;
            } else if (0 === e3.avail_in && T(t3) <= T(r2) && t3 !== f) return R(e3, -5);
            if (666 === n2.status && 0 !== e3.avail_in) return R(e3, -5);
            if (0 !== e3.avail_in || 0 !== n2.lookahead || t3 !== l && 666 !== n2.status) {
              var o2 = 2 === n2.strategy ? (function(e4, t4) {
                for (var r3; ; ) {
                  if (0 === e4.lookahead && (j(e4), 0 === e4.lookahead)) {
                    if (t4 === l) return A;
                    break;
                  }
                  if (e4.match_length = 0, r3 = u._tr_tally(e4, 0, e4.window[e4.strstart]), e4.lookahead--, e4.strstart++, r3 && (N(e4, false), 0 === e4.strm.avail_out)) return A;
                }
                return e4.insert = 0, t4 === f ? (N(e4, true), 0 === e4.strm.avail_out ? O : B) : e4.last_lit && (N(e4, false), 0 === e4.strm.avail_out) ? A : I;
              })(n2, t3) : 3 === n2.strategy ? (function(e4, t4) {
                for (var r3, n3, i3, s3, a3 = e4.window; ; ) {
                  if (e4.lookahead <= S) {
                    if (j(e4), e4.lookahead <= S && t4 === l) return A;
                    if (0 === e4.lookahead) break;
                  }
                  if (e4.match_length = 0, e4.lookahead >= x && 0 < e4.strstart && (n3 = a3[i3 = e4.strstart - 1]) === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3]) {
                    s3 = e4.strstart + S;
                    do {
                    } while (n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && n3 === a3[++i3] && i3 < s3);
                    e4.match_length = S - (s3 - i3), e4.match_length > e4.lookahead && (e4.match_length = e4.lookahead);
                  }
                  if (e4.match_length >= x ? (r3 = u._tr_tally(e4, 1, e4.match_length - x), e4.lookahead -= e4.match_length, e4.strstart += e4.match_length, e4.match_length = 0) : (r3 = u._tr_tally(e4, 0, e4.window[e4.strstart]), e4.lookahead--, e4.strstart++), r3 && (N(e4, false), 0 === e4.strm.avail_out)) return A;
                }
                return e4.insert = 0, t4 === f ? (N(e4, true), 0 === e4.strm.avail_out ? O : B) : e4.last_lit && (N(e4, false), 0 === e4.strm.avail_out) ? A : I;
              })(n2, t3) : h[n2.level].func(n2, t3);
              if (o2 !== O && o2 !== B || (n2.status = 666), o2 === A || o2 === O) return 0 === e3.avail_out && (n2.last_flush = -1), m;
              if (o2 === I && (1 === t3 ? u._tr_align(n2) : 5 !== t3 && (u._tr_stored_block(n2, 0, 0, false), 3 === t3 && (D(n2.head), 0 === n2.lookahead && (n2.strstart = 0, n2.block_start = 0, n2.insert = 0))), F(e3), 0 === e3.avail_out)) return n2.last_flush = -1, m;
            }
            return t3 !== f ? m : n2.wrap <= 0 ? 1 : (2 === n2.wrap ? (U(n2, 255 & e3.adler), U(n2, e3.adler >> 8 & 255), U(n2, e3.adler >> 16 & 255), U(n2, e3.adler >> 24 & 255), U(n2, 255 & e3.total_in), U(n2, e3.total_in >> 8 & 255), U(n2, e3.total_in >> 16 & 255), U(n2, e3.total_in >> 24 & 255)) : (P(n2, e3.adler >>> 16), P(n2, 65535 & e3.adler)), F(e3), 0 < n2.wrap && (n2.wrap = -n2.wrap), 0 !== n2.pending ? m : 1);
          }, r.deflateEnd = function(e3) {
            var t3;
            return e3 && e3.state ? (t3 = e3.state.status) !== C && 69 !== t3 && 73 !== t3 && 91 !== t3 && 103 !== t3 && t3 !== E && 666 !== t3 ? R(e3, _) : (e3.state = null, t3 === E ? R(e3, -3) : m) : _;
          }, r.deflateSetDictionary = function(e3, t3) {
            var r2, n2, i2, s2, a2, o2, h2, u2, l2 = t3.length;
            if (!e3 || !e3.state) return _;
            if (2 === (s2 = (r2 = e3.state).wrap) || 1 === s2 && r2.status !== C || r2.lookahead) return _;
            for (1 === s2 && (e3.adler = d(e3.adler, t3, l2, 0)), r2.wrap = 0, l2 >= r2.w_size && (0 === s2 && (D(r2.head), r2.strstart = 0, r2.block_start = 0, r2.insert = 0), u2 = new c.Buf8(r2.w_size), c.arraySet(u2, t3, l2 - r2.w_size, r2.w_size, 0), t3 = u2, l2 = r2.w_size), a2 = e3.avail_in, o2 = e3.next_in, h2 = e3.input, e3.avail_in = l2, e3.next_in = 0, e3.input = t3, j(r2); r2.lookahead >= x; ) {
              for (n2 = r2.strstart, i2 = r2.lookahead - (x - 1); r2.ins_h = (r2.ins_h << r2.hash_shift ^ r2.window[n2 + x - 1]) & r2.hash_mask, r2.prev[n2 & r2.w_mask] = r2.head[r2.ins_h], r2.head[r2.ins_h] = n2, n2++, --i2; ) ;
              r2.strstart = n2, r2.lookahead = x - 1, j(r2);
            }
            return r2.strstart += r2.lookahead, r2.block_start = r2.strstart, r2.insert = r2.lookahead, r2.lookahead = 0, r2.match_length = r2.prev_length = x - 1, r2.match_available = 0, e3.next_in = o2, e3.input = h2, e3.avail_in = a2, r2.wrap = s2, m;
          }, r.deflateInfo = "pako deflate (from Nodeca project)";
        }, { "../utils/common": 41, "./adler32": 43, "./crc32": 45, "./messages": 51, "./trees": 52 }], 47: [function(e2, t2, r) {
          "use strict";
          t2.exports = function() {
            this.text = 0, this.time = 0, this.xflags = 0, this.os = 0, this.extra = null, this.extra_len = 0, this.name = "", this.comment = "", this.hcrc = 0, this.done = false;
          };
        }, {}], 48: [function(e2, t2, r) {
          "use strict";
          t2.exports = function(e3, t3) {
            var r2, n, i, s, a, o, h, u, l, f, c, d, p, m, _, g, b, v, y, w, k, x, S, z, C;
            r2 = e3.state, n = e3.next_in, z = e3.input, i = n + (e3.avail_in - 5), s = e3.next_out, C = e3.output, a = s - (t3 - e3.avail_out), o = s + (e3.avail_out - 257), h = r2.dmax, u = r2.wsize, l = r2.whave, f = r2.wnext, c = r2.window, d = r2.hold, p = r2.bits, m = r2.lencode, _ = r2.distcode, g = (1 << r2.lenbits) - 1, b = (1 << r2.distbits) - 1;
            e: do {
              p < 15 && (d += z[n++] << p, p += 8, d += z[n++] << p, p += 8), v = m[d & g];
              t: for (; ; ) {
                if (d >>>= y = v >>> 24, p -= y, 0 === (y = v >>> 16 & 255)) C[s++] = 65535 & v;
                else {
                  if (!(16 & y)) {
                    if (0 == (64 & y)) {
                      v = m[(65535 & v) + (d & (1 << y) - 1)];
                      continue t;
                    }
                    if (32 & y) {
                      r2.mode = 12;
                      break e;
                    }
                    e3.msg = "invalid literal/length code", r2.mode = 30;
                    break e;
                  }
                  w = 65535 & v, (y &= 15) && (p < y && (d += z[n++] << p, p += 8), w += d & (1 << y) - 1, d >>>= y, p -= y), p < 15 && (d += z[n++] << p, p += 8, d += z[n++] << p, p += 8), v = _[d & b];
                  r: for (; ; ) {
                    if (d >>>= y = v >>> 24, p -= y, !(16 & (y = v >>> 16 & 255))) {
                      if (0 == (64 & y)) {
                        v = _[(65535 & v) + (d & (1 << y) - 1)];
                        continue r;
                      }
                      e3.msg = "invalid distance code", r2.mode = 30;
                      break e;
                    }
                    if (k = 65535 & v, p < (y &= 15) && (d += z[n++] << p, (p += 8) < y && (d += z[n++] << p, p += 8)), h < (k += d & (1 << y) - 1)) {
                      e3.msg = "invalid distance too far back", r2.mode = 30;
                      break e;
                    }
                    if (d >>>= y, p -= y, (y = s - a) < k) {
                      if (l < (y = k - y) && r2.sane) {
                        e3.msg = "invalid distance too far back", r2.mode = 30;
                        break e;
                      }
                      if (S = c, (x = 0) === f) {
                        if (x += u - y, y < w) {
                          for (w -= y; C[s++] = c[x++], --y; ) ;
                          x = s - k, S = C;
                        }
                      } else if (f < y) {
                        if (x += u + f - y, (y -= f) < w) {
                          for (w -= y; C[s++] = c[x++], --y; ) ;
                          if (x = 0, f < w) {
                            for (w -= y = f; C[s++] = c[x++], --y; ) ;
                            x = s - k, S = C;
                          }
                        }
                      } else if (x += f - y, y < w) {
                        for (w -= y; C[s++] = c[x++], --y; ) ;
                        x = s - k, S = C;
                      }
                      for (; 2 < w; ) C[s++] = S[x++], C[s++] = S[x++], C[s++] = S[x++], w -= 3;
                      w && (C[s++] = S[x++], 1 < w && (C[s++] = S[x++]));
                    } else {
                      for (x = s - k; C[s++] = C[x++], C[s++] = C[x++], C[s++] = C[x++], 2 < (w -= 3); ) ;
                      w && (C[s++] = C[x++], 1 < w && (C[s++] = C[x++]));
                    }
                    break;
                  }
                }
                break;
              }
            } while (n < i && s < o);
            n -= w = p >> 3, d &= (1 << (p -= w << 3)) - 1, e3.next_in = n, e3.next_out = s, e3.avail_in = n < i ? i - n + 5 : 5 - (n - i), e3.avail_out = s < o ? o - s + 257 : 257 - (s - o), r2.hold = d, r2.bits = p;
          };
        }, {}], 49: [function(e2, t2, r) {
          "use strict";
          var I = e2("../utils/common"), O = e2("./adler32"), B = e2("./crc32"), R = e2("./inffast"), T = e2("./inftrees"), D = 1, F = 2, N = 0, U = -2, P = 1, n = 852, i = 592;
          function L(e3) {
            return (e3 >>> 24 & 255) + (e3 >>> 8 & 65280) + ((65280 & e3) << 8) + ((255 & e3) << 24);
          }
          function s() {
            this.mode = 0, this.last = false, this.wrap = 0, this.havedict = false, this.flags = 0, this.dmax = 0, this.check = 0, this.total = 0, this.head = null, this.wbits = 0, this.wsize = 0, this.whave = 0, this.wnext = 0, this.window = null, this.hold = 0, this.bits = 0, this.length = 0, this.offset = 0, this.extra = 0, this.lencode = null, this.distcode = null, this.lenbits = 0, this.distbits = 0, this.ncode = 0, this.nlen = 0, this.ndist = 0, this.have = 0, this.next = null, this.lens = new I.Buf16(320), this.work = new I.Buf16(288), this.lendyn = null, this.distdyn = null, this.sane = 0, this.back = 0, this.was = 0;
          }
          function a(e3) {
            var t3;
            return e3 && e3.state ? (t3 = e3.state, e3.total_in = e3.total_out = t3.total = 0, e3.msg = "", t3.wrap && (e3.adler = 1 & t3.wrap), t3.mode = P, t3.last = 0, t3.havedict = 0, t3.dmax = 32768, t3.head = null, t3.hold = 0, t3.bits = 0, t3.lencode = t3.lendyn = new I.Buf32(n), t3.distcode = t3.distdyn = new I.Buf32(i), t3.sane = 1, t3.back = -1, N) : U;
          }
          function o(e3) {
            var t3;
            return e3 && e3.state ? ((t3 = e3.state).wsize = 0, t3.whave = 0, t3.wnext = 0, a(e3)) : U;
          }
          function h(e3, t3) {
            var r2, n2;
            return e3 && e3.state ? (n2 = e3.state, t3 < 0 ? (r2 = 0, t3 = -t3) : (r2 = 1 + (t3 >> 4), t3 < 48 && (t3 &= 15)), t3 && (t3 < 8 || 15 < t3) ? U : (null !== n2.window && n2.wbits !== t3 && (n2.window = null), n2.wrap = r2, n2.wbits = t3, o(e3))) : U;
          }
          function u(e3, t3) {
            var r2, n2;
            return e3 ? (n2 = new s(), (e3.state = n2).window = null, (r2 = h(e3, t3)) !== N && (e3.state = null), r2) : U;
          }
          var l, f, c = true;
          function j(e3) {
            if (c) {
              var t3;
              for (l = new I.Buf32(512), f = new I.Buf32(32), t3 = 0; t3 < 144; ) e3.lens[t3++] = 8;
              for (; t3 < 256; ) e3.lens[t3++] = 9;
              for (; t3 < 280; ) e3.lens[t3++] = 7;
              for (; t3 < 288; ) e3.lens[t3++] = 8;
              for (T(D, e3.lens, 0, 288, l, 0, e3.work, { bits: 9 }), t3 = 0; t3 < 32; ) e3.lens[t3++] = 5;
              T(F, e3.lens, 0, 32, f, 0, e3.work, { bits: 5 }), c = false;
            }
            e3.lencode = l, e3.lenbits = 9, e3.distcode = f, e3.distbits = 5;
          }
          function Z(e3, t3, r2, n2) {
            var i2, s2 = e3.state;
            return null === s2.window && (s2.wsize = 1 << s2.wbits, s2.wnext = 0, s2.whave = 0, s2.window = new I.Buf8(s2.wsize)), n2 >= s2.wsize ? (I.arraySet(s2.window, t3, r2 - s2.wsize, s2.wsize, 0), s2.wnext = 0, s2.whave = s2.wsize) : (n2 < (i2 = s2.wsize - s2.wnext) && (i2 = n2), I.arraySet(s2.window, t3, r2 - n2, i2, s2.wnext), (n2 -= i2) ? (I.arraySet(s2.window, t3, r2 - n2, n2, 0), s2.wnext = n2, s2.whave = s2.wsize) : (s2.wnext += i2, s2.wnext === s2.wsize && (s2.wnext = 0), s2.whave < s2.wsize && (s2.whave += i2))), 0;
          }
          r.inflateReset = o, r.inflateReset2 = h, r.inflateResetKeep = a, r.inflateInit = function(e3) {
            return u(e3, 15);
          }, r.inflateInit2 = u, r.inflate = function(e3, t3) {
            var r2, n2, i2, s2, a2, o2, h2, u2, l2, f2, c2, d, p, m, _, g, b, v, y, w, k, x, S, z, C = 0, E = new I.Buf8(4), A = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
            if (!e3 || !e3.state || !e3.output || !e3.input && 0 !== e3.avail_in) return U;
            12 === (r2 = e3.state).mode && (r2.mode = 13), a2 = e3.next_out, i2 = e3.output, h2 = e3.avail_out, s2 = e3.next_in, n2 = e3.input, o2 = e3.avail_in, u2 = r2.hold, l2 = r2.bits, f2 = o2, c2 = h2, x = N;
            e: for (; ; ) switch (r2.mode) {
              case P:
                if (0 === r2.wrap) {
                  r2.mode = 13;
                  break;
                }
                for (; l2 < 16; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (2 & r2.wrap && 35615 === u2) {
                  E[r2.check = 0] = 255 & u2, E[1] = u2 >>> 8 & 255, r2.check = B(r2.check, E, 2, 0), l2 = u2 = 0, r2.mode = 2;
                  break;
                }
                if (r2.flags = 0, r2.head && (r2.head.done = false), !(1 & r2.wrap) || (((255 & u2) << 8) + (u2 >> 8)) % 31) {
                  e3.msg = "incorrect header check", r2.mode = 30;
                  break;
                }
                if (8 != (15 & u2)) {
                  e3.msg = "unknown compression method", r2.mode = 30;
                  break;
                }
                if (l2 -= 4, k = 8 + (15 & (u2 >>>= 4)), 0 === r2.wbits) r2.wbits = k;
                else if (k > r2.wbits) {
                  e3.msg = "invalid window size", r2.mode = 30;
                  break;
                }
                r2.dmax = 1 << k, e3.adler = r2.check = 1, r2.mode = 512 & u2 ? 10 : 12, l2 = u2 = 0;
                break;
              case 2:
                for (; l2 < 16; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (r2.flags = u2, 8 != (255 & r2.flags)) {
                  e3.msg = "unknown compression method", r2.mode = 30;
                  break;
                }
                if (57344 & r2.flags) {
                  e3.msg = "unknown header flags set", r2.mode = 30;
                  break;
                }
                r2.head && (r2.head.text = u2 >> 8 & 1), 512 & r2.flags && (E[0] = 255 & u2, E[1] = u2 >>> 8 & 255, r2.check = B(r2.check, E, 2, 0)), l2 = u2 = 0, r2.mode = 3;
              case 3:
                for (; l2 < 32; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                r2.head && (r2.head.time = u2), 512 & r2.flags && (E[0] = 255 & u2, E[1] = u2 >>> 8 & 255, E[2] = u2 >>> 16 & 255, E[3] = u2 >>> 24 & 255, r2.check = B(r2.check, E, 4, 0)), l2 = u2 = 0, r2.mode = 4;
              case 4:
                for (; l2 < 16; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                r2.head && (r2.head.xflags = 255 & u2, r2.head.os = u2 >> 8), 512 & r2.flags && (E[0] = 255 & u2, E[1] = u2 >>> 8 & 255, r2.check = B(r2.check, E, 2, 0)), l2 = u2 = 0, r2.mode = 5;
              case 5:
                if (1024 & r2.flags) {
                  for (; l2 < 16; ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  r2.length = u2, r2.head && (r2.head.extra_len = u2), 512 & r2.flags && (E[0] = 255 & u2, E[1] = u2 >>> 8 & 255, r2.check = B(r2.check, E, 2, 0)), l2 = u2 = 0;
                } else r2.head && (r2.head.extra = null);
                r2.mode = 6;
              case 6:
                if (1024 & r2.flags && (o2 < (d = r2.length) && (d = o2), d && (r2.head && (k = r2.head.extra_len - r2.length, r2.head.extra || (r2.head.extra = new Array(r2.head.extra_len)), I.arraySet(r2.head.extra, n2, s2, d, k)), 512 & r2.flags && (r2.check = B(r2.check, n2, d, s2)), o2 -= d, s2 += d, r2.length -= d), r2.length)) break e;
                r2.length = 0, r2.mode = 7;
              case 7:
                if (2048 & r2.flags) {
                  if (0 === o2) break e;
                  for (d = 0; k = n2[s2 + d++], r2.head && k && r2.length < 65536 && (r2.head.name += String.fromCharCode(k)), k && d < o2; ) ;
                  if (512 & r2.flags && (r2.check = B(r2.check, n2, d, s2)), o2 -= d, s2 += d, k) break e;
                } else r2.head && (r2.head.name = null);
                r2.length = 0, r2.mode = 8;
              case 8:
                if (4096 & r2.flags) {
                  if (0 === o2) break e;
                  for (d = 0; k = n2[s2 + d++], r2.head && k && r2.length < 65536 && (r2.head.comment += String.fromCharCode(k)), k && d < o2; ) ;
                  if (512 & r2.flags && (r2.check = B(r2.check, n2, d, s2)), o2 -= d, s2 += d, k) break e;
                } else r2.head && (r2.head.comment = null);
                r2.mode = 9;
              case 9:
                if (512 & r2.flags) {
                  for (; l2 < 16; ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  if (u2 !== (65535 & r2.check)) {
                    e3.msg = "header crc mismatch", r2.mode = 30;
                    break;
                  }
                  l2 = u2 = 0;
                }
                r2.head && (r2.head.hcrc = r2.flags >> 9 & 1, r2.head.done = true), e3.adler = r2.check = 0, r2.mode = 12;
                break;
              case 10:
                for (; l2 < 32; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                e3.adler = r2.check = L(u2), l2 = u2 = 0, r2.mode = 11;
              case 11:
                if (0 === r2.havedict) return e3.next_out = a2, e3.avail_out = h2, e3.next_in = s2, e3.avail_in = o2, r2.hold = u2, r2.bits = l2, 2;
                e3.adler = r2.check = 1, r2.mode = 12;
              case 12:
                if (5 === t3 || 6 === t3) break e;
              case 13:
                if (r2.last) {
                  u2 >>>= 7 & l2, l2 -= 7 & l2, r2.mode = 27;
                  break;
                }
                for (; l2 < 3; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                switch (r2.last = 1 & u2, l2 -= 1, 3 & (u2 >>>= 1)) {
                  case 0:
                    r2.mode = 14;
                    break;
                  case 1:
                    if (j(r2), r2.mode = 20, 6 !== t3) break;
                    u2 >>>= 2, l2 -= 2;
                    break e;
                  case 2:
                    r2.mode = 17;
                    break;
                  case 3:
                    e3.msg = "invalid block type", r2.mode = 30;
                }
                u2 >>>= 2, l2 -= 2;
                break;
              case 14:
                for (u2 >>>= 7 & l2, l2 -= 7 & l2; l2 < 32; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if ((65535 & u2) != (u2 >>> 16 ^ 65535)) {
                  e3.msg = "invalid stored block lengths", r2.mode = 30;
                  break;
                }
                if (r2.length = 65535 & u2, l2 = u2 = 0, r2.mode = 15, 6 === t3) break e;
              case 15:
                r2.mode = 16;
              case 16:
                if (d = r2.length) {
                  if (o2 < d && (d = o2), h2 < d && (d = h2), 0 === d) break e;
                  I.arraySet(i2, n2, s2, d, a2), o2 -= d, s2 += d, h2 -= d, a2 += d, r2.length -= d;
                  break;
                }
                r2.mode = 12;
                break;
              case 17:
                for (; l2 < 14; ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (r2.nlen = 257 + (31 & u2), u2 >>>= 5, l2 -= 5, r2.ndist = 1 + (31 & u2), u2 >>>= 5, l2 -= 5, r2.ncode = 4 + (15 & u2), u2 >>>= 4, l2 -= 4, 286 < r2.nlen || 30 < r2.ndist) {
                  e3.msg = "too many length or distance symbols", r2.mode = 30;
                  break;
                }
                r2.have = 0, r2.mode = 18;
              case 18:
                for (; r2.have < r2.ncode; ) {
                  for (; l2 < 3; ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  r2.lens[A[r2.have++]] = 7 & u2, u2 >>>= 3, l2 -= 3;
                }
                for (; r2.have < 19; ) r2.lens[A[r2.have++]] = 0;
                if (r2.lencode = r2.lendyn, r2.lenbits = 7, S = { bits: r2.lenbits }, x = T(0, r2.lens, 0, 19, r2.lencode, 0, r2.work, S), r2.lenbits = S.bits, x) {
                  e3.msg = "invalid code lengths set", r2.mode = 30;
                  break;
                }
                r2.have = 0, r2.mode = 19;
              case 19:
                for (; r2.have < r2.nlen + r2.ndist; ) {
                  for (; g = (C = r2.lencode[u2 & (1 << r2.lenbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l2); ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  if (b < 16) u2 >>>= _, l2 -= _, r2.lens[r2.have++] = b;
                  else {
                    if (16 === b) {
                      for (z = _ + 2; l2 < z; ) {
                        if (0 === o2) break e;
                        o2--, u2 += n2[s2++] << l2, l2 += 8;
                      }
                      if (u2 >>>= _, l2 -= _, 0 === r2.have) {
                        e3.msg = "invalid bit length repeat", r2.mode = 30;
                        break;
                      }
                      k = r2.lens[r2.have - 1], d = 3 + (3 & u2), u2 >>>= 2, l2 -= 2;
                    } else if (17 === b) {
                      for (z = _ + 3; l2 < z; ) {
                        if (0 === o2) break e;
                        o2--, u2 += n2[s2++] << l2, l2 += 8;
                      }
                      l2 -= _, k = 0, d = 3 + (7 & (u2 >>>= _)), u2 >>>= 3, l2 -= 3;
                    } else {
                      for (z = _ + 7; l2 < z; ) {
                        if (0 === o2) break e;
                        o2--, u2 += n2[s2++] << l2, l2 += 8;
                      }
                      l2 -= _, k = 0, d = 11 + (127 & (u2 >>>= _)), u2 >>>= 7, l2 -= 7;
                    }
                    if (r2.have + d > r2.nlen + r2.ndist) {
                      e3.msg = "invalid bit length repeat", r2.mode = 30;
                      break;
                    }
                    for (; d--; ) r2.lens[r2.have++] = k;
                  }
                }
                if (30 === r2.mode) break;
                if (0 === r2.lens[256]) {
                  e3.msg = "invalid code -- missing end-of-block", r2.mode = 30;
                  break;
                }
                if (r2.lenbits = 9, S = { bits: r2.lenbits }, x = T(D, r2.lens, 0, r2.nlen, r2.lencode, 0, r2.work, S), r2.lenbits = S.bits, x) {
                  e3.msg = "invalid literal/lengths set", r2.mode = 30;
                  break;
                }
                if (r2.distbits = 6, r2.distcode = r2.distdyn, S = { bits: r2.distbits }, x = T(F, r2.lens, r2.nlen, r2.ndist, r2.distcode, 0, r2.work, S), r2.distbits = S.bits, x) {
                  e3.msg = "invalid distances set", r2.mode = 30;
                  break;
                }
                if (r2.mode = 20, 6 === t3) break e;
              case 20:
                r2.mode = 21;
              case 21:
                if (6 <= o2 && 258 <= h2) {
                  e3.next_out = a2, e3.avail_out = h2, e3.next_in = s2, e3.avail_in = o2, r2.hold = u2, r2.bits = l2, R(e3, c2), a2 = e3.next_out, i2 = e3.output, h2 = e3.avail_out, s2 = e3.next_in, n2 = e3.input, o2 = e3.avail_in, u2 = r2.hold, l2 = r2.bits, 12 === r2.mode && (r2.back = -1);
                  break;
                }
                for (r2.back = 0; g = (C = r2.lencode[u2 & (1 << r2.lenbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l2); ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (g && 0 == (240 & g)) {
                  for (v = _, y = g, w = b; g = (C = r2.lencode[w + ((u2 & (1 << v + y) - 1) >> v)]) >>> 16 & 255, b = 65535 & C, !(v + (_ = C >>> 24) <= l2); ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  u2 >>>= v, l2 -= v, r2.back += v;
                }
                if (u2 >>>= _, l2 -= _, r2.back += _, r2.length = b, 0 === g) {
                  r2.mode = 26;
                  break;
                }
                if (32 & g) {
                  r2.back = -1, r2.mode = 12;
                  break;
                }
                if (64 & g) {
                  e3.msg = "invalid literal/length code", r2.mode = 30;
                  break;
                }
                r2.extra = 15 & g, r2.mode = 22;
              case 22:
                if (r2.extra) {
                  for (z = r2.extra; l2 < z; ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  r2.length += u2 & (1 << r2.extra) - 1, u2 >>>= r2.extra, l2 -= r2.extra, r2.back += r2.extra;
                }
                r2.was = r2.length, r2.mode = 23;
              case 23:
                for (; g = (C = r2.distcode[u2 & (1 << r2.distbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l2); ) {
                  if (0 === o2) break e;
                  o2--, u2 += n2[s2++] << l2, l2 += 8;
                }
                if (0 == (240 & g)) {
                  for (v = _, y = g, w = b; g = (C = r2.distcode[w + ((u2 & (1 << v + y) - 1) >> v)]) >>> 16 & 255, b = 65535 & C, !(v + (_ = C >>> 24) <= l2); ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  u2 >>>= v, l2 -= v, r2.back += v;
                }
                if (u2 >>>= _, l2 -= _, r2.back += _, 64 & g) {
                  e3.msg = "invalid distance code", r2.mode = 30;
                  break;
                }
                r2.offset = b, r2.extra = 15 & g, r2.mode = 24;
              case 24:
                if (r2.extra) {
                  for (z = r2.extra; l2 < z; ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  r2.offset += u2 & (1 << r2.extra) - 1, u2 >>>= r2.extra, l2 -= r2.extra, r2.back += r2.extra;
                }
                if (r2.offset > r2.dmax) {
                  e3.msg = "invalid distance too far back", r2.mode = 30;
                  break;
                }
                r2.mode = 25;
              case 25:
                if (0 === h2) break e;
                if (d = c2 - h2, r2.offset > d) {
                  if ((d = r2.offset - d) > r2.whave && r2.sane) {
                    e3.msg = "invalid distance too far back", r2.mode = 30;
                    break;
                  }
                  p = d > r2.wnext ? (d -= r2.wnext, r2.wsize - d) : r2.wnext - d, d > r2.length && (d = r2.length), m = r2.window;
                } else m = i2, p = a2 - r2.offset, d = r2.length;
                for (h2 < d && (d = h2), h2 -= d, r2.length -= d; i2[a2++] = m[p++], --d; ) ;
                0 === r2.length && (r2.mode = 21);
                break;
              case 26:
                if (0 === h2) break e;
                i2[a2++] = r2.length, h2--, r2.mode = 21;
                break;
              case 27:
                if (r2.wrap) {
                  for (; l2 < 32; ) {
                    if (0 === o2) break e;
                    o2--, u2 |= n2[s2++] << l2, l2 += 8;
                  }
                  if (c2 -= h2, e3.total_out += c2, r2.total += c2, c2 && (e3.adler = r2.check = r2.flags ? B(r2.check, i2, c2, a2 - c2) : O(r2.check, i2, c2, a2 - c2)), c2 = h2, (r2.flags ? u2 : L(u2)) !== r2.check) {
                    e3.msg = "incorrect data check", r2.mode = 30;
                    break;
                  }
                  l2 = u2 = 0;
                }
                r2.mode = 28;
              case 28:
                if (r2.wrap && r2.flags) {
                  for (; l2 < 32; ) {
                    if (0 === o2) break e;
                    o2--, u2 += n2[s2++] << l2, l2 += 8;
                  }
                  if (u2 !== (4294967295 & r2.total)) {
                    e3.msg = "incorrect length check", r2.mode = 30;
                    break;
                  }
                  l2 = u2 = 0;
                }
                r2.mode = 29;
              case 29:
                x = 1;
                break e;
              case 30:
                x = -3;
                break e;
              case 31:
                return -4;
              case 32:
              default:
                return U;
            }
            return e3.next_out = a2, e3.avail_out = h2, e3.next_in = s2, e3.avail_in = o2, r2.hold = u2, r2.bits = l2, (r2.wsize || c2 !== e3.avail_out && r2.mode < 30 && (r2.mode < 27 || 4 !== t3)) && Z(e3, e3.output, e3.next_out, c2 - e3.avail_out) ? (r2.mode = 31, -4) : (f2 -= e3.avail_in, c2 -= e3.avail_out, e3.total_in += f2, e3.total_out += c2, r2.total += c2, r2.wrap && c2 && (e3.adler = r2.check = r2.flags ? B(r2.check, i2, c2, e3.next_out - c2) : O(r2.check, i2, c2, e3.next_out - c2)), e3.data_type = r2.bits + (r2.last ? 64 : 0) + (12 === r2.mode ? 128 : 0) + (20 === r2.mode || 15 === r2.mode ? 256 : 0), (0 == f2 && 0 === c2 || 4 === t3) && x === N && (x = -5), x);
          }, r.inflateEnd = function(e3) {
            if (!e3 || !e3.state) return U;
            var t3 = e3.state;
            return t3.window && (t3.window = null), e3.state = null, N;
          }, r.inflateGetHeader = function(e3, t3) {
            var r2;
            return e3 && e3.state ? 0 == (2 & (r2 = e3.state).wrap) ? U : ((r2.head = t3).done = false, N) : U;
          }, r.inflateSetDictionary = function(e3, t3) {
            var r2, n2 = t3.length;
            return e3 && e3.state ? 0 !== (r2 = e3.state).wrap && 11 !== r2.mode ? U : 11 === r2.mode && O(1, t3, n2, 0) !== r2.check ? -3 : Z(e3, t3, n2, n2) ? (r2.mode = 31, -4) : (r2.havedict = 1, N) : U;
          }, r.inflateInfo = "pako inflate (from Nodeca project)";
        }, { "../utils/common": 41, "./adler32": 43, "./crc32": 45, "./inffast": 48, "./inftrees": 50 }], 50: [function(e2, t2, r) {
          "use strict";
          var D = e2("../utils/common"), F = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 0, 0], N = [16, 16, 16, 16, 16, 16, 16, 16, 17, 17, 17, 17, 18, 18, 18, 18, 19, 19, 19, 19, 20, 20, 20, 20, 21, 21, 21, 21, 16, 72, 78], U = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577, 0, 0], P = [16, 16, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 23, 24, 24, 25, 25, 26, 26, 27, 27, 28, 28, 29, 29, 64, 64];
          t2.exports = function(e3, t3, r2, n, i, s, a, o) {
            var h, u, l, f, c, d, p, m, _, g = o.bits, b = 0, v = 0, y = 0, w = 0, k = 0, x = 0, S = 0, z = 0, C = 0, E = 0, A = null, I = 0, O = new D.Buf16(16), B = new D.Buf16(16), R = null, T = 0;
            for (b = 0; b <= 15; b++) O[b] = 0;
            for (v = 0; v < n; v++) O[t3[r2 + v]]++;
            for (k = g, w = 15; 1 <= w && 0 === O[w]; w--) ;
            if (w < k && (k = w), 0 === w) return i[s++] = 20971520, i[s++] = 20971520, o.bits = 1, 0;
            for (y = 1; y < w && 0 === O[y]; y++) ;
            for (k < y && (k = y), b = z = 1; b <= 15; b++) if (z <<= 1, (z -= O[b]) < 0) return -1;
            if (0 < z && (0 === e3 || 1 !== w)) return -1;
            for (B[1] = 0, b = 1; b < 15; b++) B[b + 1] = B[b] + O[b];
            for (v = 0; v < n; v++) 0 !== t3[r2 + v] && (a[B[t3[r2 + v]]++] = v);
            if (d = 0 === e3 ? (A = R = a, 19) : 1 === e3 ? (A = F, I -= 257, R = N, T -= 257, 256) : (A = U, R = P, -1), b = y, c = s, S = v = E = 0, l = -1, f = (C = 1 << (x = k)) - 1, 1 === e3 && 852 < C || 2 === e3 && 592 < C) return 1;
            for (; ; ) {
              for (p = b - S, _ = a[v] < d ? (m = 0, a[v]) : a[v] > d ? (m = R[T + a[v]], A[I + a[v]]) : (m = 96, 0), h = 1 << b - S, y = u = 1 << x; i[c + (E >> S) + (u -= h)] = p << 24 | m << 16 | _ | 0, 0 !== u; ) ;
              for (h = 1 << b - 1; E & h; ) h >>= 1;
              if (0 !== h ? (E &= h - 1, E += h) : E = 0, v++, 0 == --O[b]) {
                if (b === w) break;
                b = t3[r2 + a[v]];
              }
              if (k < b && (E & f) !== l) {
                for (0 === S && (S = k), c += y, z = 1 << (x = b - S); x + S < w && !((z -= O[x + S]) <= 0); ) x++, z <<= 1;
                if (C += 1 << x, 1 === e3 && 852 < C || 2 === e3 && 592 < C) return 1;
                i[l = E & f] = k << 24 | x << 16 | c - s | 0;
              }
            }
            return 0 !== E && (i[c + E] = b - S << 24 | 64 << 16 | 0), o.bits = k, 0;
          };
        }, { "../utils/common": 41 }], 51: [function(e2, t2, r) {
          "use strict";
          t2.exports = { 2: "need dictionary", 1: "stream end", 0: "", "-1": "file error", "-2": "stream error", "-3": "data error", "-4": "insufficient memory", "-5": "buffer error", "-6": "incompatible version" };
        }, {}], 52: [function(e2, t2, r) {
          "use strict";
          var i = e2("../utils/common"), o = 0, h = 1;
          function n(e3) {
            for (var t3 = e3.length; 0 <= --t3; ) e3[t3] = 0;
          }
          var s = 0, a = 29, u = 256, l = u + 1 + a, f = 30, c = 19, _ = 2 * l + 1, g = 15, d = 16, p = 7, m = 256, b = 16, v = 17, y = 18, w = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0], k = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13], x = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7], S = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15], z = new Array(2 * (l + 2));
          n(z);
          var C = new Array(2 * f);
          n(C);
          var E = new Array(512);
          n(E);
          var A = new Array(256);
          n(A);
          var I = new Array(a);
          n(I);
          var O, B, R, T = new Array(f);
          function D(e3, t3, r2, n2, i2) {
            this.static_tree = e3, this.extra_bits = t3, this.extra_base = r2, this.elems = n2, this.max_length = i2, this.has_stree = e3 && e3.length;
          }
          function F(e3, t3) {
            this.dyn_tree = e3, this.max_code = 0, this.stat_desc = t3;
          }
          function N(e3) {
            return e3 < 256 ? E[e3] : E[256 + (e3 >>> 7)];
          }
          function U(e3, t3) {
            e3.pending_buf[e3.pending++] = 255 & t3, e3.pending_buf[e3.pending++] = t3 >>> 8 & 255;
          }
          function P(e3, t3, r2) {
            e3.bi_valid > d - r2 ? (e3.bi_buf |= t3 << e3.bi_valid & 65535, U(e3, e3.bi_buf), e3.bi_buf = t3 >> d - e3.bi_valid, e3.bi_valid += r2 - d) : (e3.bi_buf |= t3 << e3.bi_valid & 65535, e3.bi_valid += r2);
          }
          function L(e3, t3, r2) {
            P(e3, r2[2 * t3], r2[2 * t3 + 1]);
          }
          function j(e3, t3) {
            for (var r2 = 0; r2 |= 1 & e3, e3 >>>= 1, r2 <<= 1, 0 < --t3; ) ;
            return r2 >>> 1;
          }
          function Z(e3, t3, r2) {
            var n2, i2, s2 = new Array(g + 1), a2 = 0;
            for (n2 = 1; n2 <= g; n2++) s2[n2] = a2 = a2 + r2[n2 - 1] << 1;
            for (i2 = 0; i2 <= t3; i2++) {
              var o2 = e3[2 * i2 + 1];
              0 !== o2 && (e3[2 * i2] = j(s2[o2]++, o2));
            }
          }
          function W(e3) {
            var t3;
            for (t3 = 0; t3 < l; t3++) e3.dyn_ltree[2 * t3] = 0;
            for (t3 = 0; t3 < f; t3++) e3.dyn_dtree[2 * t3] = 0;
            for (t3 = 0; t3 < c; t3++) e3.bl_tree[2 * t3] = 0;
            e3.dyn_ltree[2 * m] = 1, e3.opt_len = e3.static_len = 0, e3.last_lit = e3.matches = 0;
          }
          function M(e3) {
            8 < e3.bi_valid ? U(e3, e3.bi_buf) : 0 < e3.bi_valid && (e3.pending_buf[e3.pending++] = e3.bi_buf), e3.bi_buf = 0, e3.bi_valid = 0;
          }
          function H(e3, t3, r2, n2) {
            var i2 = 2 * t3, s2 = 2 * r2;
            return e3[i2] < e3[s2] || e3[i2] === e3[s2] && n2[t3] <= n2[r2];
          }
          function G(e3, t3, r2) {
            for (var n2 = e3.heap[r2], i2 = r2 << 1; i2 <= e3.heap_len && (i2 < e3.heap_len && H(t3, e3.heap[i2 + 1], e3.heap[i2], e3.depth) && i2++, !H(t3, n2, e3.heap[i2], e3.depth)); ) e3.heap[r2] = e3.heap[i2], r2 = i2, i2 <<= 1;
            e3.heap[r2] = n2;
          }
          function K(e3, t3, r2) {
            var n2, i2, s2, a2, o2 = 0;
            if (0 !== e3.last_lit) for (; n2 = e3.pending_buf[e3.d_buf + 2 * o2] << 8 | e3.pending_buf[e3.d_buf + 2 * o2 + 1], i2 = e3.pending_buf[e3.l_buf + o2], o2++, 0 === n2 ? L(e3, i2, t3) : (L(e3, (s2 = A[i2]) + u + 1, t3), 0 !== (a2 = w[s2]) && P(e3, i2 -= I[s2], a2), L(e3, s2 = N(--n2), r2), 0 !== (a2 = k[s2]) && P(e3, n2 -= T[s2], a2)), o2 < e3.last_lit; ) ;
            L(e3, m, t3);
          }
          function Y(e3, t3) {
            var r2, n2, i2, s2 = t3.dyn_tree, a2 = t3.stat_desc.static_tree, o2 = t3.stat_desc.has_stree, h2 = t3.stat_desc.elems, u2 = -1;
            for (e3.heap_len = 0, e3.heap_max = _, r2 = 0; r2 < h2; r2++) 0 !== s2[2 * r2] ? (e3.heap[++e3.heap_len] = u2 = r2, e3.depth[r2] = 0) : s2[2 * r2 + 1] = 0;
            for (; e3.heap_len < 2; ) s2[2 * (i2 = e3.heap[++e3.heap_len] = u2 < 2 ? ++u2 : 0)] = 1, e3.depth[i2] = 0, e3.opt_len--, o2 && (e3.static_len -= a2[2 * i2 + 1]);
            for (t3.max_code = u2, r2 = e3.heap_len >> 1; 1 <= r2; r2--) G(e3, s2, r2);
            for (i2 = h2; r2 = e3.heap[1], e3.heap[1] = e3.heap[e3.heap_len--], G(e3, s2, 1), n2 = e3.heap[1], e3.heap[--e3.heap_max] = r2, e3.heap[--e3.heap_max] = n2, s2[2 * i2] = s2[2 * r2] + s2[2 * n2], e3.depth[i2] = (e3.depth[r2] >= e3.depth[n2] ? e3.depth[r2] : e3.depth[n2]) + 1, s2[2 * r2 + 1] = s2[2 * n2 + 1] = i2, e3.heap[1] = i2++, G(e3, s2, 1), 2 <= e3.heap_len; ) ;
            e3.heap[--e3.heap_max] = e3.heap[1], (function(e4, t4) {
              var r3, n3, i3, s3, a3, o3, h3 = t4.dyn_tree, u3 = t4.max_code, l2 = t4.stat_desc.static_tree, f2 = t4.stat_desc.has_stree, c2 = t4.stat_desc.extra_bits, d2 = t4.stat_desc.extra_base, p2 = t4.stat_desc.max_length, m2 = 0;
              for (s3 = 0; s3 <= g; s3++) e4.bl_count[s3] = 0;
              for (h3[2 * e4.heap[e4.heap_max] + 1] = 0, r3 = e4.heap_max + 1; r3 < _; r3++) p2 < (s3 = h3[2 * h3[2 * (n3 = e4.heap[r3]) + 1] + 1] + 1) && (s3 = p2, m2++), h3[2 * n3 + 1] = s3, u3 < n3 || (e4.bl_count[s3]++, a3 = 0, d2 <= n3 && (a3 = c2[n3 - d2]), o3 = h3[2 * n3], e4.opt_len += o3 * (s3 + a3), f2 && (e4.static_len += o3 * (l2[2 * n3 + 1] + a3)));
              if (0 !== m2) {
                do {
                  for (s3 = p2 - 1; 0 === e4.bl_count[s3]; ) s3--;
                  e4.bl_count[s3]--, e4.bl_count[s3 + 1] += 2, e4.bl_count[p2]--, m2 -= 2;
                } while (0 < m2);
                for (s3 = p2; 0 !== s3; s3--) for (n3 = e4.bl_count[s3]; 0 !== n3; ) u3 < (i3 = e4.heap[--r3]) || (h3[2 * i3 + 1] !== s3 && (e4.opt_len += (s3 - h3[2 * i3 + 1]) * h3[2 * i3], h3[2 * i3 + 1] = s3), n3--);
              }
            })(e3, t3), Z(s2, u2, e3.bl_count);
          }
          function X(e3, t3, r2) {
            var n2, i2, s2 = -1, a2 = t3[1], o2 = 0, h2 = 7, u2 = 4;
            for (0 === a2 && (h2 = 138, u2 = 3), t3[2 * (r2 + 1) + 1] = 65535, n2 = 0; n2 <= r2; n2++) i2 = a2, a2 = t3[2 * (n2 + 1) + 1], ++o2 < h2 && i2 === a2 || (o2 < u2 ? e3.bl_tree[2 * i2] += o2 : 0 !== i2 ? (i2 !== s2 && e3.bl_tree[2 * i2]++, e3.bl_tree[2 * b]++) : o2 <= 10 ? e3.bl_tree[2 * v]++ : e3.bl_tree[2 * y]++, s2 = i2, u2 = (o2 = 0) === a2 ? (h2 = 138, 3) : i2 === a2 ? (h2 = 6, 3) : (h2 = 7, 4));
          }
          function V(e3, t3, r2) {
            var n2, i2, s2 = -1, a2 = t3[1], o2 = 0, h2 = 7, u2 = 4;
            for (0 === a2 && (h2 = 138, u2 = 3), n2 = 0; n2 <= r2; n2++) if (i2 = a2, a2 = t3[2 * (n2 + 1) + 1], !(++o2 < h2 && i2 === a2)) {
              if (o2 < u2) for (; L(e3, i2, e3.bl_tree), 0 != --o2; ) ;
              else 0 !== i2 ? (i2 !== s2 && (L(e3, i2, e3.bl_tree), o2--), L(e3, b, e3.bl_tree), P(e3, o2 - 3, 2)) : o2 <= 10 ? (L(e3, v, e3.bl_tree), P(e3, o2 - 3, 3)) : (L(e3, y, e3.bl_tree), P(e3, o2 - 11, 7));
              s2 = i2, u2 = (o2 = 0) === a2 ? (h2 = 138, 3) : i2 === a2 ? (h2 = 6, 3) : (h2 = 7, 4);
            }
          }
          n(T);
          var q = false;
          function J(e3, t3, r2, n2) {
            P(e3, (s << 1) + (n2 ? 1 : 0), 3), (function(e4, t4, r3, n3) {
              M(e4), n3 && (U(e4, r3), U(e4, ~r3)), i.arraySet(e4.pending_buf, e4.window, t4, r3, e4.pending), e4.pending += r3;
            })(e3, t3, r2, true);
          }
          r._tr_init = function(e3) {
            q || ((function() {
              var e4, t3, r2, n2, i2, s2 = new Array(g + 1);
              for (n2 = r2 = 0; n2 < a - 1; n2++) for (I[n2] = r2, e4 = 0; e4 < 1 << w[n2]; e4++) A[r2++] = n2;
              for (A[r2 - 1] = n2, n2 = i2 = 0; n2 < 16; n2++) for (T[n2] = i2, e4 = 0; e4 < 1 << k[n2]; e4++) E[i2++] = n2;
              for (i2 >>= 7; n2 < f; n2++) for (T[n2] = i2 << 7, e4 = 0; e4 < 1 << k[n2] - 7; e4++) E[256 + i2++] = n2;
              for (t3 = 0; t3 <= g; t3++) s2[t3] = 0;
              for (e4 = 0; e4 <= 143; ) z[2 * e4 + 1] = 8, e4++, s2[8]++;
              for (; e4 <= 255; ) z[2 * e4 + 1] = 9, e4++, s2[9]++;
              for (; e4 <= 279; ) z[2 * e4 + 1] = 7, e4++, s2[7]++;
              for (; e4 <= 287; ) z[2 * e4 + 1] = 8, e4++, s2[8]++;
              for (Z(z, l + 1, s2), e4 = 0; e4 < f; e4++) C[2 * e4 + 1] = 5, C[2 * e4] = j(e4, 5);
              O = new D(z, w, u + 1, l, g), B = new D(C, k, 0, f, g), R = new D(new Array(0), x, 0, c, p);
            })(), q = true), e3.l_desc = new F(e3.dyn_ltree, O), e3.d_desc = new F(e3.dyn_dtree, B), e3.bl_desc = new F(e3.bl_tree, R), e3.bi_buf = 0, e3.bi_valid = 0, W(e3);
          }, r._tr_stored_block = J, r._tr_flush_block = function(e3, t3, r2, n2) {
            var i2, s2, a2 = 0;
            0 < e3.level ? (2 === e3.strm.data_type && (e3.strm.data_type = (function(e4) {
              var t4, r3 = 4093624447;
              for (t4 = 0; t4 <= 31; t4++, r3 >>>= 1) if (1 & r3 && 0 !== e4.dyn_ltree[2 * t4]) return o;
              if (0 !== e4.dyn_ltree[18] || 0 !== e4.dyn_ltree[20] || 0 !== e4.dyn_ltree[26]) return h;
              for (t4 = 32; t4 < u; t4++) if (0 !== e4.dyn_ltree[2 * t4]) return h;
              return o;
            })(e3)), Y(e3, e3.l_desc), Y(e3, e3.d_desc), a2 = (function(e4) {
              var t4;
              for (X(e4, e4.dyn_ltree, e4.l_desc.max_code), X(e4, e4.dyn_dtree, e4.d_desc.max_code), Y(e4, e4.bl_desc), t4 = c - 1; 3 <= t4 && 0 === e4.bl_tree[2 * S[t4] + 1]; t4--) ;
              return e4.opt_len += 3 * (t4 + 1) + 5 + 5 + 4, t4;
            })(e3), i2 = e3.opt_len + 3 + 7 >>> 3, (s2 = e3.static_len + 3 + 7 >>> 3) <= i2 && (i2 = s2)) : i2 = s2 = r2 + 5, r2 + 4 <= i2 && -1 !== t3 ? J(e3, t3, r2, n2) : 4 === e3.strategy || s2 === i2 ? (P(e3, 2 + (n2 ? 1 : 0), 3), K(e3, z, C)) : (P(e3, 4 + (n2 ? 1 : 0), 3), (function(e4, t4, r3, n3) {
              var i3;
              for (P(e4, t4 - 257, 5), P(e4, r3 - 1, 5), P(e4, n3 - 4, 4), i3 = 0; i3 < n3; i3++) P(e4, e4.bl_tree[2 * S[i3] + 1], 3);
              V(e4, e4.dyn_ltree, t4 - 1), V(e4, e4.dyn_dtree, r3 - 1);
            })(e3, e3.l_desc.max_code + 1, e3.d_desc.max_code + 1, a2 + 1), K(e3, e3.dyn_ltree, e3.dyn_dtree)), W(e3), n2 && M(e3);
          }, r._tr_tally = function(e3, t3, r2) {
            return e3.pending_buf[e3.d_buf + 2 * e3.last_lit] = t3 >>> 8 & 255, e3.pending_buf[e3.d_buf + 2 * e3.last_lit + 1] = 255 & t3, e3.pending_buf[e3.l_buf + e3.last_lit] = 255 & r2, e3.last_lit++, 0 === t3 ? e3.dyn_ltree[2 * r2]++ : (e3.matches++, t3--, e3.dyn_ltree[2 * (A[r2] + u + 1)]++, e3.dyn_dtree[2 * N(t3)]++), e3.last_lit === e3.lit_bufsize - 1;
          }, r._tr_align = function(e3) {
            P(e3, 2, 3), L(e3, m, z), (function(e4) {
              16 === e4.bi_valid ? (U(e4, e4.bi_buf), e4.bi_buf = 0, e4.bi_valid = 0) : 8 <= e4.bi_valid && (e4.pending_buf[e4.pending++] = 255 & e4.bi_buf, e4.bi_buf >>= 8, e4.bi_valid -= 8);
            })(e3);
          };
        }, { "../utils/common": 41 }], 53: [function(e2, t2, r) {
          "use strict";
          t2.exports = function() {
            this.input = null, this.next_in = 0, this.avail_in = 0, this.total_in = 0, this.output = null, this.next_out = 0, this.avail_out = 0, this.total_out = 0, this.msg = "", this.state = null, this.data_type = 2, this.adler = 0;
          };
        }, {}], 54: [function(e2, t2, r) {
          (function(e3) {
            !(function(r2, n) {
              "use strict";
              if (!r2.setImmediate) {
                var i, s, t3, a, o = 1, h = {}, u = false, l = r2.document, e4 = Object.getPrototypeOf && Object.getPrototypeOf(r2);
                e4 = e4 && e4.setTimeout ? e4 : r2, i = "[object process]" === {}.toString.call(r2.process) ? function(e5) {
                  process.nextTick(function() {
                    c(e5);
                  });
                } : (function() {
                  if (r2.postMessage && !r2.importScripts) {
                    var e5 = true, t4 = r2.onmessage;
                    return r2.onmessage = function() {
                      e5 = false;
                    }, r2.postMessage("", "*"), r2.onmessage = t4, e5;
                  }
                })() ? (a = "setImmediate$" + Math.random() + "$", r2.addEventListener ? r2.addEventListener("message", d, false) : r2.attachEvent("onmessage", d), function(e5) {
                  r2.postMessage(a + e5, "*");
                }) : r2.MessageChannel ? ((t3 = new MessageChannel()).port1.onmessage = function(e5) {
                  c(e5.data);
                }, function(e5) {
                  t3.port2.postMessage(e5);
                }) : l && "onreadystatechange" in l.createElement("script") ? (s = l.documentElement, function(e5) {
                  var t4 = l.createElement("script");
                  t4.onreadystatechange = function() {
                    c(e5), t4.onreadystatechange = null, s.removeChild(t4), t4 = null;
                  }, s.appendChild(t4);
                }) : function(e5) {
                  setTimeout(c, 0, e5);
                }, e4.setImmediate = function(e5) {
                  "function" != typeof e5 && (e5 = new Function("" + e5));
                  for (var t4 = new Array(arguments.length - 1), r3 = 0; r3 < t4.length; r3++) t4[r3] = arguments[r3 + 1];
                  var n2 = { callback: e5, args: t4 };
                  return h[o] = n2, i(o), o++;
                }, e4.clearImmediate = f;
              }
              function f(e5) {
                delete h[e5];
              }
              function c(e5) {
                if (u) setTimeout(c, 0, e5);
                else {
                  var t4 = h[e5];
                  if (t4) {
                    u = true;
                    try {
                      !(function(e6) {
                        var t5 = e6.callback, r3 = e6.args;
                        switch (r3.length) {
                          case 0:
                            t5();
                            break;
                          case 1:
                            t5(r3[0]);
                            break;
                          case 2:
                            t5(r3[0], r3[1]);
                            break;
                          case 3:
                            t5(r3[0], r3[1], r3[2]);
                            break;
                          default:
                            t5.apply(n, r3);
                        }
                      })(t4);
                    } finally {
                      f(e5), u = false;
                    }
                  }
                }
              }
              function d(e5) {
                e5.source === r2 && "string" == typeof e5.data && 0 === e5.data.indexOf(a) && c(+e5.data.slice(a.length));
              }
            })("undefined" == typeof self ? void 0 === e3 ? this : e3 : self);
          }).call(this, "undefined" != typeof global ? global : "undefined" != typeof self ? self : "undefined" != typeof window ? window : {});
        }, {}] }, {}, [10])(10);
      });
    }
  });
  var isString = (obj) => typeof obj === "string";
  var defer = () => {
    let res;
    let rej;
    const promise = new Promise((resolve, reject) => {
      res = resolve;
      rej = reject;
    });
    promise.resolve = res;
    promise.reject = rej;
    return promise;
  };
  var makeString = (object) => {
    if (object == null) return "";
    return "" + object;
  };
  var copy = (a, s, t2) => {
    a.forEach((m) => {
      if (s[m]) t2[m] = s[m];
    });
  };
  var lastOfPathSeparatorRegExp = /###/g;
  var cleanKey = (key) => key && key.indexOf("###") > -1 ? key.replace(lastOfPathSeparatorRegExp, ".") : key;
  var canNotTraverseDeeper = (object) => !object || isString(object);
  var getLastOfPath = (object, path, Empty) => {
    const stack2 = !isString(path) ? path : path.split(".");
    let stackIndex = 0;
    while (stackIndex < stack2.length - 1) {
      if (canNotTraverseDeeper(object)) return {};
      const key = cleanKey(stack2[stackIndex]);
      if (!object[key] && Empty) object[key] = new Empty();
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        object = object[key];
      } else {
        object = {};
      }
      ++stackIndex;
    }
    if (canNotTraverseDeeper(object)) return {};
    return {
      obj: object,
      k: cleanKey(stack2[stackIndex])
    };
  };
  var setPath = (object, path, newValue) => {
    const {
      obj,
      k
    } = getLastOfPath(object, path, Object);
    if (obj !== void 0 || path.length === 1) {
      obj[k] = newValue;
      return;
    }
    let e2 = path[path.length - 1];
    let p = path.slice(0, path.length - 1);
    let last = getLastOfPath(object, p, Object);
    while (last.obj === void 0 && p.length) {
      e2 = `${p[p.length - 1]}.${e2}`;
      p = p.slice(0, p.length - 1);
      last = getLastOfPath(object, p, Object);
      if (last && last.obj && typeof last.obj[`${last.k}.${e2}`] !== "undefined") {
        last.obj = void 0;
      }
    }
    last.obj[`${last.k}.${e2}`] = newValue;
  };
  var pushPath = (object, path, newValue, concat) => {
    const {
      obj,
      k
    } = getLastOfPath(object, path, Object);
    obj[k] = obj[k] || [];
    obj[k].push(newValue);
  };
  var getPath = (object, path) => {
    const {
      obj,
      k
    } = getLastOfPath(object, path);
    if (!obj) return void 0;
    return obj[k];
  };
  var getPathWithDefaults = (data, defaultData, key) => {
    const value = getPath(data, key);
    if (value !== void 0) {
      return value;
    }
    return getPath(defaultData, key);
  };
  var deepExtend = (target, source, overwrite) => {
    for (const prop in source) {
      if (prop !== "__proto__" && prop !== "constructor") {
        if (prop in target) {
          if (isString(target[prop]) || target[prop] instanceof String || isString(source[prop]) || source[prop] instanceof String) {
            if (overwrite) target[prop] = source[prop];
          } else {
            deepExtend(target[prop], source[prop], overwrite);
          }
        } else {
          target[prop] = source[prop];
        }
      }
    }
    return target;
  };
  var regexEscape = (str) => str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
  var _entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "/": "&#x2F;"
  };
  var escape = (data) => {
    if (isString(data)) {
      return data.replace(/[&<>"'\/]/g, (s) => _entityMap[s]);
    }
    return data;
  };
  var RegExpCache = class {
    constructor(capacity) {
      this.capacity = capacity;
      this.regExpMap = /* @__PURE__ */ new Map();
      this.regExpQueue = [];
    }
    getRegExp(pattern) {
      const regExpFromCache = this.regExpMap.get(pattern);
      if (regExpFromCache !== void 0) {
        return regExpFromCache;
      }
      const regExpNew = new RegExp(pattern);
      if (this.regExpQueue.length === this.capacity) {
        this.regExpMap.delete(this.regExpQueue.shift());
      }
      this.regExpMap.set(pattern, regExpNew);
      this.regExpQueue.push(pattern);
      return regExpNew;
    }
  };
  var chars = [" ", ",", "?", "!", ";"];
  var looksLikeObjectPathRegExpCache = new RegExpCache(20);
  var looksLikeObjectPath = (key, nsSeparator, keySeparator) => {
    nsSeparator = nsSeparator || "";
    keySeparator = keySeparator || "";
    const possibleChars = chars.filter((c) => nsSeparator.indexOf(c) < 0 && keySeparator.indexOf(c) < 0);
    if (possibleChars.length === 0) return true;
    const r = looksLikeObjectPathRegExpCache.getRegExp(`(${possibleChars.map((c) => c === "?" ? "\\?" : c).join("|")})`);
    let matched = !r.test(key);
    if (!matched) {
      const ki = key.indexOf(keySeparator);
      if (ki > 0 && !r.test(key.substring(0, ki))) {
        matched = true;
      }
    }
    return matched;
  };
  var deepFind = function(obj, path) {
    let keySeparator = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : ".";
    if (!obj) return void 0;
    if (obj[path]) return obj[path];
    const tokens = path.split(keySeparator);
    let current = obj;
    for (let i = 0; i < tokens.length; ) {
      if (!current || typeof current !== "object") {
        return void 0;
      }
      let next;
      let nextPath = "";
      for (let j = i; j < tokens.length; ++j) {
        if (j !== i) {
          nextPath += keySeparator;
        }
        nextPath += tokens[j];
        next = current[nextPath];
        if (next !== void 0) {
          if (["string", "number", "boolean"].indexOf(typeof next) > -1 && j < tokens.length - 1) {
            continue;
          }
          i += j - i + 1;
          break;
        }
      }
      current = next;
    }
    return current;
  };
  var getCleanedCode = (code) => code && code.replace("_", "-");
  var consoleLogger = {
    type: "logger",
    log(args) {
      this.output("log", args);
    },
    warn(args) {
      this.output("warn", args);
    },
    error(args) {
      this.output("error", args);
    },
    output(type, args) {
      if (console && console[type]) console[type].apply(console, args);
    }
  };
  var Logger = class _Logger {
    constructor(concreteLogger) {
      let options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
      this.init(concreteLogger, options);
    }
    init(concreteLogger) {
      let options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
      this.prefix = options.prefix || "i18next:";
      this.logger = concreteLogger || consoleLogger;
      this.options = options;
      this.debug = options.debug;
    }
    log() {
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }
      return this.forward(args, "log", "", true);
    }
    warn() {
      for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        args[_key2] = arguments[_key2];
      }
      return this.forward(args, "warn", "", true);
    }
    error() {
      for (var _len3 = arguments.length, args = new Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
        args[_key3] = arguments[_key3];
      }
      return this.forward(args, "error", "");
    }
    deprecate() {
      for (var _len4 = arguments.length, args = new Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
        args[_key4] = arguments[_key4];
      }
      return this.forward(args, "warn", "WARNING DEPRECATED: ", true);
    }
    forward(args, lvl, prefix, debugOnly) {
      if (debugOnly && !this.debug) return null;
      if (isString(args[0])) args[0] = `${prefix}${this.prefix} ${args[0]}`;
      return this.logger[lvl](args);
    }
    create(moduleName) {
      return new _Logger(this.logger, {
        ...{
          prefix: `${this.prefix}:${moduleName}:`
        },
        ...this.options
      });
    }
    clone(options) {
      options = options || this.options;
      options.prefix = options.prefix || this.prefix;
      return new _Logger(this.logger, options);
    }
  };
  var baseLogger = new Logger();
  var EventEmitter = class {
    constructor() {
      this.observers = {};
    }
    on(events, listener) {
      events.split(" ").forEach((event) => {
        if (!this.observers[event]) this.observers[event] = /* @__PURE__ */ new Map();
        const numListeners = this.observers[event].get(listener) || 0;
        this.observers[event].set(listener, numListeners + 1);
      });
      return this;
    }
    off(event, listener) {
      if (!this.observers[event]) return;
      if (!listener) {
        delete this.observers[event];
        return;
      }
      this.observers[event].delete(listener);
    }
    emit(event) {
      for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        args[_key - 1] = arguments[_key];
      }
      if (this.observers[event]) {
        const cloned = Array.from(this.observers[event].entries());
        cloned.forEach((_ref) => {
          let [observer, numTimesAdded] = _ref;
          for (let i = 0; i < numTimesAdded; i++) {
            observer(...args);
          }
        });
      }
      if (this.observers["*"]) {
        const cloned = Array.from(this.observers["*"].entries());
        cloned.forEach((_ref2) => {
          let [observer, numTimesAdded] = _ref2;
          for (let i = 0; i < numTimesAdded; i++) {
            observer.apply(observer, [event, ...args]);
          }
        });
      }
    }
  };
  var ResourceStore = class extends EventEmitter {
    constructor(data) {
      let options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {
        ns: ["translation"],
        defaultNS: "translation"
      };
      super();
      this.data = data || {};
      this.options = options;
      if (this.options.keySeparator === void 0) {
        this.options.keySeparator = ".";
      }
      if (this.options.ignoreJSONStructure === void 0) {
        this.options.ignoreJSONStructure = true;
      }
    }
    addNamespaces(ns) {
      if (this.options.ns.indexOf(ns) < 0) {
        this.options.ns.push(ns);
      }
    }
    removeNamespaces(ns) {
      const index = this.options.ns.indexOf(ns);
      if (index > -1) {
        this.options.ns.splice(index, 1);
      }
    }
    getResource(lng, ns, key) {
      let options = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : {};
      const keySeparator = options.keySeparator !== void 0 ? options.keySeparator : this.options.keySeparator;
      const ignoreJSONStructure = options.ignoreJSONStructure !== void 0 ? options.ignoreJSONStructure : this.options.ignoreJSONStructure;
      let path;
      if (lng.indexOf(".") > -1) {
        path = lng.split(".");
      } else {
        path = [lng, ns];
        if (key) {
          if (Array.isArray(key)) {
            path.push(...key);
          } else if (isString(key) && keySeparator) {
            path.push(...key.split(keySeparator));
          } else {
            path.push(key);
          }
        }
      }
      const result = getPath(this.data, path);
      if (!result && !ns && !key && lng.indexOf(".") > -1) {
        lng = path[0];
        ns = path[1];
        key = path.slice(2).join(".");
      }
      if (result || !ignoreJSONStructure || !isString(key)) return result;
      return deepFind(this.data && this.data[lng] && this.data[lng][ns], key, keySeparator);
    }
    addResource(lng, ns, key, value) {
      let options = arguments.length > 4 && arguments[4] !== void 0 ? arguments[4] : {
        silent: false
      };
      const keySeparator = options.keySeparator !== void 0 ? options.keySeparator : this.options.keySeparator;
      let path = [lng, ns];
      if (key) path = path.concat(keySeparator ? key.split(keySeparator) : key);
      if (lng.indexOf(".") > -1) {
        path = lng.split(".");
        value = ns;
        ns = path[1];
      }
      this.addNamespaces(ns);
      setPath(this.data, path, value);
      if (!options.silent) this.emit("added", lng, ns, key, value);
    }
    addResources(lng, ns, resources) {
      let options = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : {
        silent: false
      };
      for (const m in resources) {
        if (isString(resources[m]) || Array.isArray(resources[m])) this.addResource(lng, ns, m, resources[m], {
          silent: true
        });
      }
      if (!options.silent) this.emit("added", lng, ns, resources);
    }
    addResourceBundle(lng, ns, resources, deep, overwrite) {
      let options = arguments.length > 5 && arguments[5] !== void 0 ? arguments[5] : {
        silent: false,
        skipCopy: false
      };
      let path = [lng, ns];
      if (lng.indexOf(".") > -1) {
        path = lng.split(".");
        deep = resources;
        resources = ns;
        ns = path[1];
      }
      this.addNamespaces(ns);
      let pack = getPath(this.data, path) || {};
      if (!options.skipCopy) resources = JSON.parse(JSON.stringify(resources));
      if (deep) {
        deepExtend(pack, resources, overwrite);
      } else {
        pack = {
          ...pack,
          ...resources
        };
      }
      setPath(this.data, path, pack);
      if (!options.silent) this.emit("added", lng, ns, resources);
    }
    removeResourceBundle(lng, ns) {
      if (this.hasResourceBundle(lng, ns)) {
        delete this.data[lng][ns];
      }
      this.removeNamespaces(ns);
      this.emit("removed", lng, ns);
    }
    hasResourceBundle(lng, ns) {
      return this.getResource(lng, ns) !== void 0;
    }
    getResourceBundle(lng, ns) {
      if (!ns) ns = this.options.defaultNS;
      if (this.options.compatibilityAPI === "v1") return {
        ...{},
        ...this.getResource(lng, ns)
      };
      return this.getResource(lng, ns);
    }
    getDataByLanguage(lng) {
      return this.data[lng];
    }
    hasLanguageSomeTranslations(lng) {
      const data = this.getDataByLanguage(lng);
      const n = data && Object.keys(data) || [];
      return !!n.find((v) => data[v] && Object.keys(data[v]).length > 0);
    }
    toJSON() {
      return this.data;
    }
  };
  var postProcessor = {
    processors: {},
    addPostProcessor(module) {
      this.processors[module.name] = module;
    },
    handle(processors, value, key, options, translator) {
      processors.forEach((processor) => {
        if (this.processors[processor]) value = this.processors[processor].process(value, key, options, translator);
      });
      return value;
    }
  };
  var checkedLoadedFor = {};
  var Translator = class _Translator extends EventEmitter {
    constructor(services) {
      let options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
      super();
      copy(["resourceStore", "languageUtils", "pluralResolver", "interpolator", "backendConnector", "i18nFormat", "utils"], services, this);
      this.options = options;
      if (this.options.keySeparator === void 0) {
        this.options.keySeparator = ".";
      }
      this.logger = baseLogger.create("translator");
    }
    changeLanguage(lng) {
      if (lng) this.language = lng;
    }
    exists(key) {
      let options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {
        interpolation: {}
      };
      if (key === void 0 || key === null) {
        return false;
      }
      const resolved = this.resolve(key, options);
      return resolved && resolved.res !== void 0;
    }
    extractFromKey(key, options) {
      let nsSeparator = options.nsSeparator !== void 0 ? options.nsSeparator : this.options.nsSeparator;
      if (nsSeparator === void 0) nsSeparator = ":";
      const keySeparator = options.keySeparator !== void 0 ? options.keySeparator : this.options.keySeparator;
      let namespaces = options.ns || this.options.defaultNS || [];
      const wouldCheckForNsInKey = nsSeparator && key.indexOf(nsSeparator) > -1;
      const seemsNaturalLanguage = !this.options.userDefinedKeySeparator && !options.keySeparator && !this.options.userDefinedNsSeparator && !options.nsSeparator && !looksLikeObjectPath(key, nsSeparator, keySeparator);
      if (wouldCheckForNsInKey && !seemsNaturalLanguage) {
        const m = key.match(this.interpolator.nestingRegexp);
        if (m && m.length > 0) {
          return {
            key,
            namespaces: isString(namespaces) ? [namespaces] : namespaces
          };
        }
        const parts = key.split(nsSeparator);
        if (nsSeparator !== keySeparator || nsSeparator === keySeparator && this.options.ns.indexOf(parts[0]) > -1) namespaces = parts.shift();
        key = parts.join(keySeparator);
      }
      return {
        key,
        namespaces: isString(namespaces) ? [namespaces] : namespaces
      };
    }
    translate(keys, options, lastKey) {
      if (typeof options !== "object" && this.options.overloadTranslationOptionHandler) {
        options = this.options.overloadTranslationOptionHandler(arguments);
      }
      if (typeof options === "object") options = {
        ...options
      };
      if (!options) options = {};
      if (keys === void 0 || keys === null) return "";
      if (!Array.isArray(keys)) keys = [String(keys)];
      const returnDetails = options.returnDetails !== void 0 ? options.returnDetails : this.options.returnDetails;
      const keySeparator = options.keySeparator !== void 0 ? options.keySeparator : this.options.keySeparator;
      const {
        key,
        namespaces
      } = this.extractFromKey(keys[keys.length - 1], options);
      const namespace = namespaces[namespaces.length - 1];
      const lng = options.lng || this.language;
      const appendNamespaceToCIMode = options.appendNamespaceToCIMode || this.options.appendNamespaceToCIMode;
      if (lng && lng.toLowerCase() === "cimode") {
        if (appendNamespaceToCIMode) {
          const nsSeparator = options.nsSeparator || this.options.nsSeparator;
          if (returnDetails) {
            return {
              res: `${namespace}${nsSeparator}${key}`,
              usedKey: key,
              exactUsedKey: key,
              usedLng: lng,
              usedNS: namespace,
              usedParams: this.getUsedParamsDetails(options)
            };
          }
          return `${namespace}${nsSeparator}${key}`;
        }
        if (returnDetails) {
          return {
            res: key,
            usedKey: key,
            exactUsedKey: key,
            usedLng: lng,
            usedNS: namespace,
            usedParams: this.getUsedParamsDetails(options)
          };
        }
        return key;
      }
      const resolved = this.resolve(keys, options);
      let res = resolved && resolved.res;
      const resUsedKey = resolved && resolved.usedKey || key;
      const resExactUsedKey = resolved && resolved.exactUsedKey || key;
      const resType = Object.prototype.toString.apply(res);
      const noObject = ["[object Number]", "[object Function]", "[object RegExp]"];
      const joinArrays = options.joinArrays !== void 0 ? options.joinArrays : this.options.joinArrays;
      const handleAsObjectInI18nFormat = !this.i18nFormat || this.i18nFormat.handleAsObject;
      const handleAsObject = !isString(res) && typeof res !== "boolean" && typeof res !== "number";
      if (handleAsObjectInI18nFormat && res && handleAsObject && noObject.indexOf(resType) < 0 && !(isString(joinArrays) && Array.isArray(res))) {
        if (!options.returnObjects && !this.options.returnObjects) {
          if (!this.options.returnedObjectHandler) {
            this.logger.warn("accessing an object - but returnObjects options is not enabled!");
          }
          const r = this.options.returnedObjectHandler ? this.options.returnedObjectHandler(resUsedKey, res, {
            ...options,
            ns: namespaces
          }) : `key '${key} (${this.language})' returned an object instead of string.`;
          if (returnDetails) {
            resolved.res = r;
            resolved.usedParams = this.getUsedParamsDetails(options);
            return resolved;
          }
          return r;
        }
        if (keySeparator) {
          const resTypeIsArray = Array.isArray(res);
          const copy2 = resTypeIsArray ? [] : {};
          const newKeyToUse = resTypeIsArray ? resExactUsedKey : resUsedKey;
          for (const m in res) {
            if (Object.prototype.hasOwnProperty.call(res, m)) {
              const deepKey = `${newKeyToUse}${keySeparator}${m}`;
              copy2[m] = this.translate(deepKey, {
                ...options,
                ...{
                  joinArrays: false,
                  ns: namespaces
                }
              });
              if (copy2[m] === deepKey) copy2[m] = res[m];
            }
          }
          res = copy2;
        }
      } else if (handleAsObjectInI18nFormat && isString(joinArrays) && Array.isArray(res)) {
        res = res.join(joinArrays);
        if (res) res = this.extendTranslation(res, keys, options, lastKey);
      } else {
        let usedDefault = false;
        let usedKey = false;
        const needsPluralHandling = options.count !== void 0 && !isString(options.count);
        const hasDefaultValue = _Translator.hasDefaultValue(options);
        const defaultValueSuffix = needsPluralHandling ? this.pluralResolver.getSuffix(lng, options.count, options) : "";
        const defaultValueSuffixOrdinalFallback = options.ordinal && needsPluralHandling ? this.pluralResolver.getSuffix(lng, options.count, {
          ordinal: false
        }) : "";
        const needsZeroSuffixLookup = needsPluralHandling && !options.ordinal && options.count === 0 && this.pluralResolver.shouldUseIntlApi();
        const defaultValue = needsZeroSuffixLookup && options[`defaultValue${this.options.pluralSeparator}zero`] || options[`defaultValue${defaultValueSuffix}`] || options[`defaultValue${defaultValueSuffixOrdinalFallback}`] || options.defaultValue;
        if (!this.isValidLookup(res) && hasDefaultValue) {
          usedDefault = true;
          res = defaultValue;
        }
        if (!this.isValidLookup(res)) {
          usedKey = true;
          res = key;
        }
        const missingKeyNoValueFallbackToKey = options.missingKeyNoValueFallbackToKey || this.options.missingKeyNoValueFallbackToKey;
        const resForMissing = missingKeyNoValueFallbackToKey && usedKey ? void 0 : res;
        const updateMissing = hasDefaultValue && defaultValue !== res && this.options.updateMissing;
        if (usedKey || usedDefault || updateMissing) {
          this.logger.log(updateMissing ? "updateKey" : "missingKey", lng, namespace, key, updateMissing ? defaultValue : res);
          if (keySeparator) {
            const fk = this.resolve(key, {
              ...options,
              keySeparator: false
            });
            if (fk && fk.res) this.logger.warn("Seems the loaded translations were in flat JSON format instead of nested. Either set keySeparator: false on init or make sure your translations are published in nested format.");
          }
          let lngs = [];
          const fallbackLngs = this.languageUtils.getFallbackCodes(this.options.fallbackLng, options.lng || this.language);
          if (this.options.saveMissingTo === "fallback" && fallbackLngs && fallbackLngs[0]) {
            for (let i = 0; i < fallbackLngs.length; i++) {
              lngs.push(fallbackLngs[i]);
            }
          } else if (this.options.saveMissingTo === "all") {
            lngs = this.languageUtils.toResolveHierarchy(options.lng || this.language);
          } else {
            lngs.push(options.lng || this.language);
          }
          const send = (l, k, specificDefaultValue) => {
            const defaultForMissing = hasDefaultValue && specificDefaultValue !== res ? specificDefaultValue : resForMissing;
            if (this.options.missingKeyHandler) {
              this.options.missingKeyHandler(l, namespace, k, defaultForMissing, updateMissing, options);
            } else if (this.backendConnector && this.backendConnector.saveMissing) {
              this.backendConnector.saveMissing(l, namespace, k, defaultForMissing, updateMissing, options);
            }
            this.emit("missingKey", l, namespace, k, res);
          };
          if (this.options.saveMissing) {
            if (this.options.saveMissingPlurals && needsPluralHandling) {
              lngs.forEach((language) => {
                const suffixes = this.pluralResolver.getSuffixes(language, options);
                if (needsZeroSuffixLookup && options[`defaultValue${this.options.pluralSeparator}zero`] && suffixes.indexOf(`${this.options.pluralSeparator}zero`) < 0) {
                  suffixes.push(`${this.options.pluralSeparator}zero`);
                }
                suffixes.forEach((suffix) => {
                  send([language], key + suffix, options[`defaultValue${suffix}`] || defaultValue);
                });
              });
            } else {
              send(lngs, key, defaultValue);
            }
          }
        }
        res = this.extendTranslation(res, keys, options, resolved, lastKey);
        if (usedKey && res === key && this.options.appendNamespaceToMissingKey) res = `${namespace}:${key}`;
        if ((usedKey || usedDefault) && this.options.parseMissingKeyHandler) {
          if (this.options.compatibilityAPI !== "v1") {
            res = this.options.parseMissingKeyHandler(this.options.appendNamespaceToMissingKey ? `${namespace}:${key}` : key, usedDefault ? res : void 0);
          } else {
            res = this.options.parseMissingKeyHandler(res);
          }
        }
      }
      if (returnDetails) {
        resolved.res = res;
        resolved.usedParams = this.getUsedParamsDetails(options);
        return resolved;
      }
      return res;
    }
    extendTranslation(res, key, options, resolved, lastKey) {
      var _this = this;
      if (this.i18nFormat && this.i18nFormat.parse) {
        res = this.i18nFormat.parse(res, {
          ...this.options.interpolation.defaultVariables,
          ...options
        }, options.lng || this.language || resolved.usedLng, resolved.usedNS, resolved.usedKey, {
          resolved
        });
      } else if (!options.skipInterpolation) {
        if (options.interpolation) this.interpolator.init({
          ...options,
          ...{
            interpolation: {
              ...this.options.interpolation,
              ...options.interpolation
            }
          }
        });
        const skipOnVariables = isString(res) && (options && options.interpolation && options.interpolation.skipOnVariables !== void 0 ? options.interpolation.skipOnVariables : this.options.interpolation.skipOnVariables);
        let nestBef;
        if (skipOnVariables) {
          const nb = res.match(this.interpolator.nestingRegexp);
          nestBef = nb && nb.length;
        }
        let data = options.replace && !isString(options.replace) ? options.replace : options;
        if (this.options.interpolation.defaultVariables) data = {
          ...this.options.interpolation.defaultVariables,
          ...data
        };
        res = this.interpolator.interpolate(res, data, options.lng || this.language || resolved.usedLng, options);
        if (skipOnVariables) {
          const na = res.match(this.interpolator.nestingRegexp);
          const nestAft = na && na.length;
          if (nestBef < nestAft) options.nest = false;
        }
        if (!options.lng && this.options.compatibilityAPI !== "v1" && resolved && resolved.res) options.lng = this.language || resolved.usedLng;
        if (options.nest !== false) res = this.interpolator.nest(res, function() {
          for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
            args[_key] = arguments[_key];
          }
          if (lastKey && lastKey[0] === args[0] && !options.context) {
            _this.logger.warn(`It seems you are nesting recursively key: ${args[0]} in key: ${key[0]}`);
            return null;
          }
          return _this.translate(...args, key);
        }, options);
        if (options.interpolation) this.interpolator.reset();
      }
      const postProcess = options.postProcess || this.options.postProcess;
      const postProcessorNames = isString(postProcess) ? [postProcess] : postProcess;
      if (res !== void 0 && res !== null && postProcessorNames && postProcessorNames.length && options.applyPostProcessor !== false) {
        res = postProcessor.handle(postProcessorNames, res, key, this.options && this.options.postProcessPassResolved ? {
          i18nResolved: {
            ...resolved,
            usedParams: this.getUsedParamsDetails(options)
          },
          ...options
        } : options, this);
      }
      return res;
    }
    resolve(keys) {
      let options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
      let found;
      let usedKey;
      let exactUsedKey;
      let usedLng;
      let usedNS;
      if (isString(keys)) keys = [keys];
      keys.forEach((k) => {
        if (this.isValidLookup(found)) return;
        const extracted = this.extractFromKey(k, options);
        const key = extracted.key;
        usedKey = key;
        let namespaces = extracted.namespaces;
        if (this.options.fallbackNS) namespaces = namespaces.concat(this.options.fallbackNS);
        const needsPluralHandling = options.count !== void 0 && !isString(options.count);
        const needsZeroSuffixLookup = needsPluralHandling && !options.ordinal && options.count === 0 && this.pluralResolver.shouldUseIntlApi();
        const needsContextHandling = options.context !== void 0 && (isString(options.context) || typeof options.context === "number") && options.context !== "";
        const codes = options.lngs ? options.lngs : this.languageUtils.toResolveHierarchy(options.lng || this.language, options.fallbackLng);
        namespaces.forEach((ns) => {
          if (this.isValidLookup(found)) return;
          usedNS = ns;
          if (!checkedLoadedFor[`${codes[0]}-${ns}`] && this.utils && this.utils.hasLoadedNamespace && !this.utils.hasLoadedNamespace(usedNS)) {
            checkedLoadedFor[`${codes[0]}-${ns}`] = true;
            this.logger.warn(`key "${usedKey}" for languages "${codes.join(", ")}" won't get resolved as namespace "${usedNS}" was not yet loaded`, "This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!");
          }
          codes.forEach((code) => {
            if (this.isValidLookup(found)) return;
            usedLng = code;
            const finalKeys = [key];
            if (this.i18nFormat && this.i18nFormat.addLookupKeys) {
              this.i18nFormat.addLookupKeys(finalKeys, key, code, ns, options);
            } else {
              let pluralSuffix;
              if (needsPluralHandling) pluralSuffix = this.pluralResolver.getSuffix(code, options.count, options);
              const zeroSuffix = `${this.options.pluralSeparator}zero`;
              const ordinalPrefix = `${this.options.pluralSeparator}ordinal${this.options.pluralSeparator}`;
              if (needsPluralHandling) {
                finalKeys.push(key + pluralSuffix);
                if (options.ordinal && pluralSuffix.indexOf(ordinalPrefix) === 0) {
                  finalKeys.push(key + pluralSuffix.replace(ordinalPrefix, this.options.pluralSeparator));
                }
                if (needsZeroSuffixLookup) {
                  finalKeys.push(key + zeroSuffix);
                }
              }
              if (needsContextHandling) {
                const contextKey = `${key}${this.options.contextSeparator}${options.context}`;
                finalKeys.push(contextKey);
                if (needsPluralHandling) {
                  finalKeys.push(contextKey + pluralSuffix);
                  if (options.ordinal && pluralSuffix.indexOf(ordinalPrefix) === 0) {
                    finalKeys.push(contextKey + pluralSuffix.replace(ordinalPrefix, this.options.pluralSeparator));
                  }
                  if (needsZeroSuffixLookup) {
                    finalKeys.push(contextKey + zeroSuffix);
                  }
                }
              }
            }
            let possibleKey;
            while (possibleKey = finalKeys.pop()) {
              if (!this.isValidLookup(found)) {
                exactUsedKey = possibleKey;
                found = this.getResource(code, ns, possibleKey, options);
              }
            }
          });
        });
      });
      return {
        res: found,
        usedKey,
        exactUsedKey,
        usedLng,
        usedNS
      };
    }
    isValidLookup(res) {
      return res !== void 0 && !(!this.options.returnNull && res === null) && !(!this.options.returnEmptyString && res === "");
    }
    getResource(code, ns, key) {
      let options = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : {};
      if (this.i18nFormat && this.i18nFormat.getResource) return this.i18nFormat.getResource(code, ns, key, options);
      return this.resourceStore.getResource(code, ns, key, options);
    }
    getUsedParamsDetails() {
      let options = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
      const optionsKeys = ["defaultValue", "ordinal", "context", "replace", "lng", "lngs", "fallbackLng", "ns", "keySeparator", "nsSeparator", "returnObjects", "returnDetails", "joinArrays", "postProcess", "interpolation"];
      const useOptionsReplaceForData = options.replace && !isString(options.replace);
      let data = useOptionsReplaceForData ? options.replace : options;
      if (useOptionsReplaceForData && typeof options.count !== "undefined") {
        data.count = options.count;
      }
      if (this.options.interpolation.defaultVariables) {
        data = {
          ...this.options.interpolation.defaultVariables,
          ...data
        };
      }
      if (!useOptionsReplaceForData) {
        data = {
          ...data
        };
        for (const key of optionsKeys) {
          delete data[key];
        }
      }
      return data;
    }
    static hasDefaultValue(options) {
      const prefix = "defaultValue";
      for (const option in options) {
        if (Object.prototype.hasOwnProperty.call(options, option) && prefix === option.substring(0, prefix.length) && void 0 !== options[option]) {
          return true;
        }
      }
      return false;
    }
  };
  var capitalize = (string) => string.charAt(0).toUpperCase() + string.slice(1);
  var LanguageUtil = class {
    constructor(options) {
      this.options = options;
      this.supportedLngs = this.options.supportedLngs || false;
      this.logger = baseLogger.create("languageUtils");
    }
    getScriptPartFromCode(code) {
      code = getCleanedCode(code);
      if (!code || code.indexOf("-") < 0) return null;
      const p = code.split("-");
      if (p.length === 2) return null;
      p.pop();
      if (p[p.length - 1].toLowerCase() === "x") return null;
      return this.formatLanguageCode(p.join("-"));
    }
    getLanguagePartFromCode(code) {
      code = getCleanedCode(code);
      if (!code || code.indexOf("-") < 0) return code;
      const p = code.split("-");
      return this.formatLanguageCode(p[0]);
    }
    formatLanguageCode(code) {
      if (isString(code) && code.indexOf("-") > -1) {
        if (typeof Intl !== "undefined" && typeof Intl.getCanonicalLocales !== "undefined") {
          try {
            let formattedCode = Intl.getCanonicalLocales(code)[0];
            if (formattedCode && this.options.lowerCaseLng) {
              formattedCode = formattedCode.toLowerCase();
            }
            if (formattedCode) return formattedCode;
          } catch (e2) {
          }
        }
        const specialCases = ["hans", "hant", "latn", "cyrl", "cans", "mong", "arab"];
        let p = code.split("-");
        if (this.options.lowerCaseLng) {
          p = p.map((part) => part.toLowerCase());
        } else if (p.length === 2) {
          p[0] = p[0].toLowerCase();
          p[1] = p[1].toUpperCase();
          if (specialCases.indexOf(p[1].toLowerCase()) > -1) p[1] = capitalize(p[1].toLowerCase());
        } else if (p.length === 3) {
          p[0] = p[0].toLowerCase();
          if (p[1].length === 2) p[1] = p[1].toUpperCase();
          if (p[0] !== "sgn" && p[2].length === 2) p[2] = p[2].toUpperCase();
          if (specialCases.indexOf(p[1].toLowerCase()) > -1) p[1] = capitalize(p[1].toLowerCase());
          if (specialCases.indexOf(p[2].toLowerCase()) > -1) p[2] = capitalize(p[2].toLowerCase());
        }
        return p.join("-");
      }
      return this.options.cleanCode || this.options.lowerCaseLng ? code.toLowerCase() : code;
    }
    isSupportedCode(code) {
      if (this.options.load === "languageOnly" || this.options.nonExplicitSupportedLngs) {
        code = this.getLanguagePartFromCode(code);
      }
      return !this.supportedLngs || !this.supportedLngs.length || this.supportedLngs.indexOf(code) > -1;
    }
    getBestMatchFromCodes(codes) {
      if (!codes) return null;
      let found;
      codes.forEach((code) => {
        if (found) return;
        const cleanedLng = this.formatLanguageCode(code);
        if (!this.options.supportedLngs || this.isSupportedCode(cleanedLng)) found = cleanedLng;
      });
      if (!found && this.options.supportedLngs) {
        codes.forEach((code) => {
          if (found) return;
          const lngOnly = this.getLanguagePartFromCode(code);
          if (this.isSupportedCode(lngOnly)) return found = lngOnly;
          found = this.options.supportedLngs.find((supportedLng) => {
            if (supportedLng === lngOnly) return supportedLng;
            if (supportedLng.indexOf("-") < 0 && lngOnly.indexOf("-") < 0) return;
            if (supportedLng.indexOf("-") > 0 && lngOnly.indexOf("-") < 0 && supportedLng.substring(0, supportedLng.indexOf("-")) === lngOnly) return supportedLng;
            if (supportedLng.indexOf(lngOnly) === 0 && lngOnly.length > 1) return supportedLng;
          });
        });
      }
      if (!found) found = this.getFallbackCodes(this.options.fallbackLng)[0];
      return found;
    }
    getFallbackCodes(fallbacks, code) {
      if (!fallbacks) return [];
      if (typeof fallbacks === "function") fallbacks = fallbacks(code);
      if (isString(fallbacks)) fallbacks = [fallbacks];
      if (Array.isArray(fallbacks)) return fallbacks;
      if (!code) return fallbacks.default || [];
      let found = fallbacks[code];
      if (!found) found = fallbacks[this.getScriptPartFromCode(code)];
      if (!found) found = fallbacks[this.formatLanguageCode(code)];
      if (!found) found = fallbacks[this.getLanguagePartFromCode(code)];
      if (!found) found = fallbacks.default;
      return found || [];
    }
    toResolveHierarchy(code, fallbackCode) {
      const fallbackCodes = this.getFallbackCodes(fallbackCode || this.options.fallbackLng || [], code);
      const codes = [];
      const addCode = (c) => {
        if (!c) return;
        if (this.isSupportedCode(c)) {
          codes.push(c);
        } else {
          this.logger.warn(`rejecting language code not found in supportedLngs: ${c}`);
        }
      };
      if (isString(code) && (code.indexOf("-") > -1 || code.indexOf("_") > -1)) {
        if (this.options.load !== "languageOnly") addCode(this.formatLanguageCode(code));
        if (this.options.load !== "languageOnly" && this.options.load !== "currentOnly") addCode(this.getScriptPartFromCode(code));
        if (this.options.load !== "currentOnly") addCode(this.getLanguagePartFromCode(code));
      } else if (isString(code)) {
        addCode(this.formatLanguageCode(code));
      }
      fallbackCodes.forEach((fc) => {
        if (codes.indexOf(fc) < 0) addCode(this.formatLanguageCode(fc));
      });
      return codes;
    }
  };
  var sets = [{
    lngs: ["ach", "ak", "am", "arn", "br", "fil", "gun", "ln", "mfe", "mg", "mi", "oc", "pt", "pt-BR", "tg", "tl", "ti", "tr", "uz", "wa"],
    nr: [1, 2],
    fc: 1
  }, {
    lngs: ["af", "an", "ast", "az", "bg", "bn", "ca", "da", "de", "dev", "el", "en", "eo", "es", "et", "eu", "fi", "fo", "fur", "fy", "gl", "gu", "ha", "hi", "hu", "hy", "ia", "it", "kk", "kn", "ku", "lb", "mai", "ml", "mn", "mr", "nah", "nap", "nb", "ne", "nl", "nn", "no", "nso", "pa", "pap", "pms", "ps", "pt-PT", "rm", "sco", "se", "si", "so", "son", "sq", "sv", "sw", "ta", "te", "tk", "ur", "yo"],
    nr: [1, 2],
    fc: 2
  }, {
    lngs: ["ay", "bo", "cgg", "fa", "ht", "id", "ja", "jbo", "ka", "km", "ko", "ky", "lo", "ms", "sah", "su", "th", "tt", "ug", "vi", "wo", "zh"],
    nr: [1],
    fc: 3
  }, {
    lngs: ["be", "bs", "cnr", "dz", "hr", "ru", "sr", "uk"],
    nr: [1, 2, 5],
    fc: 4
  }, {
    lngs: ["ar"],
    nr: [0, 1, 2, 3, 11, 100],
    fc: 5
  }, {
    lngs: ["cs", "sk"],
    nr: [1, 2, 5],
    fc: 6
  }, {
    lngs: ["csb", "pl"],
    nr: [1, 2, 5],
    fc: 7
  }, {
    lngs: ["cy"],
    nr: [1, 2, 3, 8],
    fc: 8
  }, {
    lngs: ["fr"],
    nr: [1, 2],
    fc: 9
  }, {
    lngs: ["ga"],
    nr: [1, 2, 3, 7, 11],
    fc: 10
  }, {
    lngs: ["gd"],
    nr: [1, 2, 3, 20],
    fc: 11
  }, {
    lngs: ["is"],
    nr: [1, 2],
    fc: 12
  }, {
    lngs: ["jv"],
    nr: [0, 1],
    fc: 13
  }, {
    lngs: ["kw"],
    nr: [1, 2, 3, 4],
    fc: 14
  }, {
    lngs: ["lt"],
    nr: [1, 2, 10],
    fc: 15
  }, {
    lngs: ["lv"],
    nr: [1, 2, 0],
    fc: 16
  }, {
    lngs: ["mk"],
    nr: [1, 2],
    fc: 17
  }, {
    lngs: ["mnk"],
    nr: [0, 1, 2],
    fc: 18
  }, {
    lngs: ["mt"],
    nr: [1, 2, 11, 20],
    fc: 19
  }, {
    lngs: ["or"],
    nr: [2, 1],
    fc: 2
  }, {
    lngs: ["ro"],
    nr: [1, 2, 20],
    fc: 20
  }, {
    lngs: ["sl"],
    nr: [5, 1, 2, 3],
    fc: 21
  }, {
    lngs: ["he", "iw"],
    nr: [1, 2, 20, 21],
    fc: 22
  }];
  var _rulesPluralsTypes = {
    1: (n) => Number(n > 1),
    2: (n) => Number(n != 1),
    3: (n) => 0,
    4: (n) => Number(n % 10 == 1 && n % 100 != 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2),
    5: (n) => Number(n == 0 ? 0 : n == 1 ? 1 : n == 2 ? 2 : n % 100 >= 3 && n % 100 <= 10 ? 3 : n % 100 >= 11 ? 4 : 5),
    6: (n) => Number(n == 1 ? 0 : n >= 2 && n <= 4 ? 1 : 2),
    7: (n) => Number(n == 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2),
    8: (n) => Number(n == 1 ? 0 : n == 2 ? 1 : n != 8 && n != 11 ? 2 : 3),
    9: (n) => Number(n >= 2),
    10: (n) => Number(n == 1 ? 0 : n == 2 ? 1 : n < 7 ? 2 : n < 11 ? 3 : 4),
    11: (n) => Number(n == 1 || n == 11 ? 0 : n == 2 || n == 12 ? 1 : n > 2 && n < 20 ? 2 : 3),
    12: (n) => Number(n % 10 != 1 || n % 100 == 11),
    13: (n) => Number(n !== 0),
    14: (n) => Number(n == 1 ? 0 : n == 2 ? 1 : n == 3 ? 2 : 3),
    15: (n) => Number(n % 10 == 1 && n % 100 != 11 ? 0 : n % 10 >= 2 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2),
    16: (n) => Number(n % 10 == 1 && n % 100 != 11 ? 0 : n !== 0 ? 1 : 2),
    17: (n) => Number(n == 1 || n % 10 == 1 && n % 100 != 11 ? 0 : 1),
    18: (n) => Number(n == 0 ? 0 : n == 1 ? 1 : 2),
    19: (n) => Number(n == 1 ? 0 : n == 0 || n % 100 > 1 && n % 100 < 11 ? 1 : n % 100 > 10 && n % 100 < 20 ? 2 : 3),
    20: (n) => Number(n == 1 ? 0 : n == 0 || n % 100 > 0 && n % 100 < 20 ? 1 : 2),
    21: (n) => Number(n % 100 == 1 ? 1 : n % 100 == 2 ? 2 : n % 100 == 3 || n % 100 == 4 ? 3 : 0),
    22: (n) => Number(n == 1 ? 0 : n == 2 ? 1 : (n < 0 || n > 10) && n % 10 == 0 ? 2 : 3)
  };
  var nonIntlVersions = ["v1", "v2", "v3"];
  var intlVersions = ["v4"];
  var suffixesOrder = {
    zero: 0,
    one: 1,
    two: 2,
    few: 3,
    many: 4,
    other: 5
  };
  var createRules = () => {
    const rules = {};
    sets.forEach((set) => {
      set.lngs.forEach((l) => {
        rules[l] = {
          numbers: set.nr,
          plurals: _rulesPluralsTypes[set.fc]
        };
      });
    });
    return rules;
  };
  var PluralResolver = class {
    constructor(languageUtils) {
      let options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
      this.languageUtils = languageUtils;
      this.options = options;
      this.logger = baseLogger.create("pluralResolver");
      if ((!this.options.compatibilityJSON || intlVersions.includes(this.options.compatibilityJSON)) && (typeof Intl === "undefined" || !Intl.PluralRules)) {
        this.options.compatibilityJSON = "v3";
        this.logger.error("Your environment seems not to be Intl API compatible, use an Intl.PluralRules polyfill. Will fallback to the compatibilityJSON v3 format handling.");
      }
      this.rules = createRules();
      this.pluralRulesCache = {};
    }
    addRule(lng, obj) {
      this.rules[lng] = obj;
    }
    clearCache() {
      this.pluralRulesCache = {};
    }
    getRule(code) {
      let options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
      if (this.shouldUseIntlApi()) {
        const cleanedCode = getCleanedCode(code === "dev" ? "en" : code);
        const type = options.ordinal ? "ordinal" : "cardinal";
        const cacheKey = JSON.stringify({
          cleanedCode,
          type
        });
        if (cacheKey in this.pluralRulesCache) {
          return this.pluralRulesCache[cacheKey];
        }
        let rule;
        try {
          rule = new Intl.PluralRules(cleanedCode, {
            type
          });
        } catch (err) {
          if (!code.match(/-|_/)) return;
          const lngPart = this.languageUtils.getLanguagePartFromCode(code);
          rule = this.getRule(lngPart, options);
        }
        this.pluralRulesCache[cacheKey] = rule;
        return rule;
      }
      return this.rules[code] || this.rules[this.languageUtils.getLanguagePartFromCode(code)];
    }
    needsPlural(code) {
      let options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
      const rule = this.getRule(code, options);
      if (this.shouldUseIntlApi()) {
        return rule && rule.resolvedOptions().pluralCategories.length > 1;
      }
      return rule && rule.numbers.length > 1;
    }
    getPluralFormsOfKey(code, key) {
      let options = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {};
      return this.getSuffixes(code, options).map((suffix) => `${key}${suffix}`);
    }
    getSuffixes(code) {
      let options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
      const rule = this.getRule(code, options);
      if (!rule) {
        return [];
      }
      if (this.shouldUseIntlApi()) {
        return rule.resolvedOptions().pluralCategories.sort((pluralCategory1, pluralCategory2) => suffixesOrder[pluralCategory1] - suffixesOrder[pluralCategory2]).map((pluralCategory) => `${this.options.prepend}${options.ordinal ? `ordinal${this.options.prepend}` : ""}${pluralCategory}`);
      }
      return rule.numbers.map((number) => this.getSuffix(code, number, options));
    }
    getSuffix(code, count) {
      let options = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {};
      const rule = this.getRule(code, options);
      if (rule) {
        if (this.shouldUseIntlApi()) {
          return `${this.options.prepend}${options.ordinal ? `ordinal${this.options.prepend}` : ""}${rule.select(count)}`;
        }
        return this.getSuffixRetroCompatible(rule, count);
      }
      this.logger.warn(`no plural rule found for: ${code}`);
      return "";
    }
    getSuffixRetroCompatible(rule, count) {
      const idx = rule.noAbs ? rule.plurals(count) : rule.plurals(Math.abs(count));
      let suffix = rule.numbers[idx];
      if (this.options.simplifyPluralSuffix && rule.numbers.length === 2 && rule.numbers[0] === 1) {
        if (suffix === 2) {
          suffix = "plural";
        } else if (suffix === 1) {
          suffix = "";
        }
      }
      const returnSuffix = () => this.options.prepend && suffix.toString() ? this.options.prepend + suffix.toString() : suffix.toString();
      if (this.options.compatibilityJSON === "v1") {
        if (suffix === 1) return "";
        if (typeof suffix === "number") return `_plural_${suffix.toString()}`;
        return returnSuffix();
      } else if (this.options.compatibilityJSON === "v2") {
        return returnSuffix();
      } else if (this.options.simplifyPluralSuffix && rule.numbers.length === 2 && rule.numbers[0] === 1) {
        return returnSuffix();
      }
      return this.options.prepend && idx.toString() ? this.options.prepend + idx.toString() : idx.toString();
    }
    shouldUseIntlApi() {
      return !nonIntlVersions.includes(this.options.compatibilityJSON);
    }
  };
  var deepFindWithDefaults = function(data, defaultData, key) {
    let keySeparator = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : ".";
    let ignoreJSONStructure = arguments.length > 4 && arguments[4] !== void 0 ? arguments[4] : true;
    let path = getPathWithDefaults(data, defaultData, key);
    if (!path && ignoreJSONStructure && isString(key)) {
      path = deepFind(data, key, keySeparator);
      if (path === void 0) path = deepFind(defaultData, key, keySeparator);
    }
    return path;
  };
  var regexSafe = (val) => val.replace(/\$/g, "$$$$");
  var Interpolator = class {
    constructor() {
      let options = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
      this.logger = baseLogger.create("interpolator");
      this.options = options;
      this.format = options.interpolation && options.interpolation.format || ((value) => value);
      this.init(options);
    }
    init() {
      let options = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
      if (!options.interpolation) options.interpolation = {
        escapeValue: true
      };
      const {
        escape: escape$1,
        escapeValue,
        useRawValueToEscape,
        prefix,
        prefixEscaped,
        suffix,
        suffixEscaped,
        formatSeparator,
        unescapeSuffix,
        unescapePrefix,
        nestingPrefix,
        nestingPrefixEscaped,
        nestingSuffix,
        nestingSuffixEscaped,
        nestingOptionsSeparator,
        maxReplaces,
        alwaysFormat
      } = options.interpolation;
      this.escape = escape$1 !== void 0 ? escape$1 : escape;
      this.escapeValue = escapeValue !== void 0 ? escapeValue : true;
      this.useRawValueToEscape = useRawValueToEscape !== void 0 ? useRawValueToEscape : false;
      this.prefix = prefix ? regexEscape(prefix) : prefixEscaped || "{{";
      this.suffix = suffix ? regexEscape(suffix) : suffixEscaped || "}}";
      this.formatSeparator = formatSeparator || ",";
      this.unescapePrefix = unescapeSuffix ? "" : unescapePrefix || "-";
      this.unescapeSuffix = this.unescapePrefix ? "" : unescapeSuffix || "";
      this.nestingPrefix = nestingPrefix ? regexEscape(nestingPrefix) : nestingPrefixEscaped || regexEscape("$t(");
      this.nestingSuffix = nestingSuffix ? regexEscape(nestingSuffix) : nestingSuffixEscaped || regexEscape(")");
      this.nestingOptionsSeparator = nestingOptionsSeparator || ",";
      this.maxReplaces = maxReplaces || 1e3;
      this.alwaysFormat = alwaysFormat !== void 0 ? alwaysFormat : false;
      this.resetRegExp();
    }
    reset() {
      if (this.options) this.init(this.options);
    }
    resetRegExp() {
      const getOrResetRegExp = (existingRegExp, pattern) => {
        if (existingRegExp && existingRegExp.source === pattern) {
          existingRegExp.lastIndex = 0;
          return existingRegExp;
        }
        return new RegExp(pattern, "g");
      };
      this.regexp = getOrResetRegExp(this.regexp, `${this.prefix}(.+?)${this.suffix}`);
      this.regexpUnescape = getOrResetRegExp(this.regexpUnescape, `${this.prefix}${this.unescapePrefix}(.+?)${this.unescapeSuffix}${this.suffix}`);
      this.nestingRegexp = getOrResetRegExp(this.nestingRegexp, `${this.nestingPrefix}(.+?)${this.nestingSuffix}`);
    }
    interpolate(str, data, lng, options) {
      let match;
      let value;
      let replaces;
      const defaultData = this.options && this.options.interpolation && this.options.interpolation.defaultVariables || {};
      const handleFormat = (key) => {
        if (key.indexOf(this.formatSeparator) < 0) {
          const path = deepFindWithDefaults(data, defaultData, key, this.options.keySeparator, this.options.ignoreJSONStructure);
          return this.alwaysFormat ? this.format(path, void 0, lng, {
            ...options,
            ...data,
            interpolationkey: key
          }) : path;
        }
        const p = key.split(this.formatSeparator);
        const k = p.shift().trim();
        const f = p.join(this.formatSeparator).trim();
        return this.format(deepFindWithDefaults(data, defaultData, k, this.options.keySeparator, this.options.ignoreJSONStructure), f, lng, {
          ...options,
          ...data,
          interpolationkey: k
        });
      };
      this.resetRegExp();
      const missingInterpolationHandler = options && options.missingInterpolationHandler || this.options.missingInterpolationHandler;
      const skipOnVariables = options && options.interpolation && options.interpolation.skipOnVariables !== void 0 ? options.interpolation.skipOnVariables : this.options.interpolation.skipOnVariables;
      const todos = [{
        regex: this.regexpUnescape,
        safeValue: (val) => regexSafe(val)
      }, {
        regex: this.regexp,
        safeValue: (val) => this.escapeValue ? regexSafe(this.escape(val)) : regexSafe(val)
      }];
      todos.forEach((todo) => {
        replaces = 0;
        while (match = todo.regex.exec(str)) {
          const matchedVar = match[1].trim();
          value = handleFormat(matchedVar);
          if (value === void 0) {
            if (typeof missingInterpolationHandler === "function") {
              const temp = missingInterpolationHandler(str, match, options);
              value = isString(temp) ? temp : "";
            } else if (options && Object.prototype.hasOwnProperty.call(options, matchedVar)) {
              value = "";
            } else if (skipOnVariables) {
              value = match[0];
              continue;
            } else {
              this.logger.warn(`missed to pass in variable ${matchedVar} for interpolating ${str}`);
              value = "";
            }
          } else if (!isString(value) && !this.useRawValueToEscape) {
            value = makeString(value);
          }
          const safeValue = todo.safeValue(value);
          str = str.replace(match[0], safeValue);
          if (skipOnVariables) {
            todo.regex.lastIndex += value.length;
            todo.regex.lastIndex -= match[0].length;
          } else {
            todo.regex.lastIndex = 0;
          }
          replaces++;
          if (replaces >= this.maxReplaces) {
            break;
          }
        }
      });
      return str;
    }
    nest(str, fc) {
      let options = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {};
      let match;
      let value;
      let clonedOptions;
      const handleHasOptions = (key, inheritedOptions) => {
        const sep = this.nestingOptionsSeparator;
        if (key.indexOf(sep) < 0) return key;
        const c = key.split(new RegExp(`${sep}[ ]*{`));
        let optionsString = `{${c[1]}`;
        key = c[0];
        optionsString = this.interpolate(optionsString, clonedOptions);
        const matchedSingleQuotes = optionsString.match(/'/g);
        const matchedDoubleQuotes = optionsString.match(/"/g);
        if (matchedSingleQuotes && matchedSingleQuotes.length % 2 === 0 && !matchedDoubleQuotes || matchedDoubleQuotes.length % 2 !== 0) {
          optionsString = optionsString.replace(/'/g, '"');
        }
        try {
          clonedOptions = JSON.parse(optionsString);
          if (inheritedOptions) clonedOptions = {
            ...inheritedOptions,
            ...clonedOptions
          };
        } catch (e2) {
          this.logger.warn(`failed parsing options string in nesting for key ${key}`, e2);
          return `${key}${sep}${optionsString}`;
        }
        if (clonedOptions.defaultValue && clonedOptions.defaultValue.indexOf(this.prefix) > -1) delete clonedOptions.defaultValue;
        return key;
      };
      while (match = this.nestingRegexp.exec(str)) {
        let formatters = [];
        clonedOptions = {
          ...options
        };
        clonedOptions = clonedOptions.replace && !isString(clonedOptions.replace) ? clonedOptions.replace : clonedOptions;
        clonedOptions.applyPostProcessor = false;
        delete clonedOptions.defaultValue;
        let doReduce = false;
        if (match[0].indexOf(this.formatSeparator) !== -1 && !/{.*}/.test(match[1])) {
          const r = match[1].split(this.formatSeparator).map((elem) => elem.trim());
          match[1] = r.shift();
          formatters = r;
          doReduce = true;
        }
        value = fc(handleHasOptions.call(this, match[1].trim(), clonedOptions), clonedOptions);
        if (value && match[0] === str && !isString(value)) return value;
        if (!isString(value)) value = makeString(value);
        if (!value) {
          this.logger.warn(`missed to resolve ${match[1]} for nesting ${str}`);
          value = "";
        }
        if (doReduce) {
          value = formatters.reduce((v, f) => this.format(v, f, options.lng, {
            ...options,
            interpolationkey: match[1].trim()
          }), value.trim());
        }
        str = str.replace(match[0], value);
        this.regexp.lastIndex = 0;
      }
      return str;
    }
  };
  var parseFormatStr = (formatStr) => {
    let formatName = formatStr.toLowerCase().trim();
    const formatOptions = {};
    if (formatStr.indexOf("(") > -1) {
      const p = formatStr.split("(");
      formatName = p[0].toLowerCase().trim();
      const optStr = p[1].substring(0, p[1].length - 1);
      if (formatName === "currency" && optStr.indexOf(":") < 0) {
        if (!formatOptions.currency) formatOptions.currency = optStr.trim();
      } else if (formatName === "relativetime" && optStr.indexOf(":") < 0) {
        if (!formatOptions.range) formatOptions.range = optStr.trim();
      } else {
        const opts = optStr.split(";");
        opts.forEach((opt) => {
          if (opt) {
            const [key, ...rest] = opt.split(":");
            const val = rest.join(":").trim().replace(/^'+|'+$/g, "");
            const trimmedKey = key.trim();
            if (!formatOptions[trimmedKey]) formatOptions[trimmedKey] = val;
            if (val === "false") formatOptions[trimmedKey] = false;
            if (val === "true") formatOptions[trimmedKey] = true;
            if (!isNaN(val)) formatOptions[trimmedKey] = parseInt(val, 10);
          }
        });
      }
    }
    return {
      formatName,
      formatOptions
    };
  };
  var createCachedFormatter = (fn) => {
    const cache = {};
    return (val, lng, options) => {
      let optForCache = options;
      if (options && options.interpolationkey && options.formatParams && options.formatParams[options.interpolationkey] && options[options.interpolationkey]) {
        optForCache = {
          ...optForCache,
          [options.interpolationkey]: void 0
        };
      }
      const key = lng + JSON.stringify(optForCache);
      let formatter = cache[key];
      if (!formatter) {
        formatter = fn(getCleanedCode(lng), options);
        cache[key] = formatter;
      }
      return formatter(val);
    };
  };
  var Formatter = class {
    constructor() {
      let options = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
      this.logger = baseLogger.create("formatter");
      this.options = options;
      this.formats = {
        number: createCachedFormatter((lng, opt) => {
          const formatter = new Intl.NumberFormat(lng, {
            ...opt
          });
          return (val) => formatter.format(val);
        }),
        currency: createCachedFormatter((lng, opt) => {
          const formatter = new Intl.NumberFormat(lng, {
            ...opt,
            style: "currency"
          });
          return (val) => formatter.format(val);
        }),
        datetime: createCachedFormatter((lng, opt) => {
          const formatter = new Intl.DateTimeFormat(lng, {
            ...opt
          });
          return (val) => formatter.format(val);
        }),
        relativetime: createCachedFormatter((lng, opt) => {
          const formatter = new Intl.RelativeTimeFormat(lng, {
            ...opt
          });
          return (val) => formatter.format(val, opt.range || "day");
        }),
        list: createCachedFormatter((lng, opt) => {
          const formatter = new Intl.ListFormat(lng, {
            ...opt
          });
          return (val) => formatter.format(val);
        })
      };
      this.init(options);
    }
    init(services) {
      let options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {
        interpolation: {}
      };
      this.formatSeparator = options.interpolation.formatSeparator || ",";
    }
    add(name, fc) {
      this.formats[name.toLowerCase().trim()] = fc;
    }
    addCached(name, fc) {
      this.formats[name.toLowerCase().trim()] = createCachedFormatter(fc);
    }
    format(value, format2, lng) {
      let options = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : {};
      const formats = format2.split(this.formatSeparator);
      if (formats.length > 1 && formats[0].indexOf("(") > 1 && formats[0].indexOf(")") < 0 && formats.find((f) => f.indexOf(")") > -1)) {
        const lastIndex = formats.findIndex((f) => f.indexOf(")") > -1);
        formats[0] = [formats[0], ...formats.splice(1, lastIndex)].join(this.formatSeparator);
      }
      const result = formats.reduce((mem, f) => {
        const {
          formatName,
          formatOptions
        } = parseFormatStr(f);
        if (this.formats[formatName]) {
          let formatted = mem;
          try {
            const valOptions = options && options.formatParams && options.formatParams[options.interpolationkey] || {};
            const l = valOptions.locale || valOptions.lng || options.locale || options.lng || lng;
            formatted = this.formats[formatName](mem, l, {
              ...formatOptions,
              ...options,
              ...valOptions
            });
          } catch (error) {
            this.logger.warn(error);
          }
          return formatted;
        } else {
          this.logger.warn(`there was no format function for ${formatName}`);
        }
        return mem;
      }, value);
      return result;
    }
  };
  var removePending = (q, name) => {
    if (q.pending[name] !== void 0) {
      delete q.pending[name];
      q.pendingCount--;
    }
  };
  var Connector = class extends EventEmitter {
    constructor(backend, store, services) {
      let options = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : {};
      super();
      this.backend = backend;
      this.store = store;
      this.services = services;
      this.languageUtils = services.languageUtils;
      this.options = options;
      this.logger = baseLogger.create("backendConnector");
      this.waitingReads = [];
      this.maxParallelReads = options.maxParallelReads || 10;
      this.readingCalls = 0;
      this.maxRetries = options.maxRetries >= 0 ? options.maxRetries : 5;
      this.retryTimeout = options.retryTimeout >= 1 ? options.retryTimeout : 350;
      this.state = {};
      this.queue = [];
      if (this.backend && this.backend.init) {
        this.backend.init(services, options.backend, options);
      }
    }
    queueLoad(languages, namespaces, options, callback) {
      const toLoad = {};
      const pending = {};
      const toLoadLanguages = {};
      const toLoadNamespaces = {};
      languages.forEach((lng) => {
        let hasAllNamespaces = true;
        namespaces.forEach((ns) => {
          const name = `${lng}|${ns}`;
          if (!options.reload && this.store.hasResourceBundle(lng, ns)) {
            this.state[name] = 2;
          } else if (this.state[name] < 0) ;
          else if (this.state[name] === 1) {
            if (pending[name] === void 0) pending[name] = true;
          } else {
            this.state[name] = 1;
            hasAllNamespaces = false;
            if (pending[name] === void 0) pending[name] = true;
            if (toLoad[name] === void 0) toLoad[name] = true;
            if (toLoadNamespaces[ns] === void 0) toLoadNamespaces[ns] = true;
          }
        });
        if (!hasAllNamespaces) toLoadLanguages[lng] = true;
      });
      if (Object.keys(toLoad).length || Object.keys(pending).length) {
        this.queue.push({
          pending,
          pendingCount: Object.keys(pending).length,
          loaded: {},
          errors: [],
          callback
        });
      }
      return {
        toLoad: Object.keys(toLoad),
        pending: Object.keys(pending),
        toLoadLanguages: Object.keys(toLoadLanguages),
        toLoadNamespaces: Object.keys(toLoadNamespaces)
      };
    }
    loaded(name, err, data) {
      const s = name.split("|");
      const lng = s[0];
      const ns = s[1];
      if (err) this.emit("failedLoading", lng, ns, err);
      if (!err && data) {
        this.store.addResourceBundle(lng, ns, data, void 0, void 0, {
          skipCopy: true
        });
      }
      this.state[name] = err ? -1 : 2;
      if (err && data) this.state[name] = 0;
      const loaded = {};
      this.queue.forEach((q) => {
        pushPath(q.loaded, [lng], ns);
        removePending(q, name);
        if (err) q.errors.push(err);
        if (q.pendingCount === 0 && !q.done) {
          Object.keys(q.loaded).forEach((l) => {
            if (!loaded[l]) loaded[l] = {};
            const loadedKeys = q.loaded[l];
            if (loadedKeys.length) {
              loadedKeys.forEach((n) => {
                if (loaded[l][n] === void 0) loaded[l][n] = true;
              });
            }
          });
          q.done = true;
          if (q.errors.length) {
            q.callback(q.errors);
          } else {
            q.callback();
          }
        }
      });
      this.emit("loaded", loaded);
      this.queue = this.queue.filter((q) => !q.done);
    }
    read(lng, ns, fcName) {
      let tried = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : 0;
      let wait = arguments.length > 4 && arguments[4] !== void 0 ? arguments[4] : this.retryTimeout;
      let callback = arguments.length > 5 ? arguments[5] : void 0;
      if (!lng.length) return callback(null, {});
      if (this.readingCalls >= this.maxParallelReads) {
        this.waitingReads.push({
          lng,
          ns,
          fcName,
          tried,
          wait,
          callback
        });
        return;
      }
      this.readingCalls++;
      const resolver = (err, data) => {
        this.readingCalls--;
        if (this.waitingReads.length > 0) {
          const next = this.waitingReads.shift();
          this.read(next.lng, next.ns, next.fcName, next.tried, next.wait, next.callback);
        }
        if (err && data && tried < this.maxRetries) {
          setTimeout(() => {
            this.read.call(this, lng, ns, fcName, tried + 1, wait * 2, callback);
          }, wait);
          return;
        }
        callback(err, data);
      };
      const fc = this.backend[fcName].bind(this.backend);
      if (fc.length === 2) {
        try {
          const r = fc(lng, ns);
          if (r && typeof r.then === "function") {
            r.then((data) => resolver(null, data)).catch(resolver);
          } else {
            resolver(null, r);
          }
        } catch (err) {
          resolver(err);
        }
        return;
      }
      return fc(lng, ns, resolver);
    }
    prepareLoading(languages, namespaces) {
      let options = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {};
      let callback = arguments.length > 3 ? arguments[3] : void 0;
      if (!this.backend) {
        this.logger.warn("No backend was added via i18next.use. Will not load resources.");
        return callback && callback();
      }
      if (isString(languages)) languages = this.languageUtils.toResolveHierarchy(languages);
      if (isString(namespaces)) namespaces = [namespaces];
      const toLoad = this.queueLoad(languages, namespaces, options, callback);
      if (!toLoad.toLoad.length) {
        if (!toLoad.pending.length) callback();
        return null;
      }
      toLoad.toLoad.forEach((name) => {
        this.loadOne(name);
      });
    }
    load(languages, namespaces, callback) {
      this.prepareLoading(languages, namespaces, {}, callback);
    }
    reload(languages, namespaces, callback) {
      this.prepareLoading(languages, namespaces, {
        reload: true
      }, callback);
    }
    loadOne(name) {
      let prefix = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : "";
      const s = name.split("|");
      const lng = s[0];
      const ns = s[1];
      this.read(lng, ns, "read", void 0, void 0, (err, data) => {
        if (err) this.logger.warn(`${prefix}loading namespace ${ns} for language ${lng} failed`, err);
        if (!err && data) this.logger.log(`${prefix}loaded namespace ${ns} for language ${lng}`, data);
        this.loaded(name, err, data);
      });
    }
    saveMissing(languages, namespace, key, fallbackValue, isUpdate) {
      let options = arguments.length > 5 && arguments[5] !== void 0 ? arguments[5] : {};
      let clb = arguments.length > 6 && arguments[6] !== void 0 ? arguments[6] : () => {
      };
      if (this.services.utils && this.services.utils.hasLoadedNamespace && !this.services.utils.hasLoadedNamespace(namespace)) {
        this.logger.warn(`did not save key "${key}" as the namespace "${namespace}" was not yet loaded`, "This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!");
        return;
      }
      if (key === void 0 || key === null || key === "") return;
      if (this.backend && this.backend.create) {
        const opts = {
          ...options,
          isUpdate
        };
        const fc = this.backend.create.bind(this.backend);
        if (fc.length < 6) {
          try {
            let r;
            if (fc.length === 5) {
              r = fc(languages, namespace, key, fallbackValue, opts);
            } else {
              r = fc(languages, namespace, key, fallbackValue);
            }
            if (r && typeof r.then === "function") {
              r.then((data) => clb(null, data)).catch(clb);
            } else {
              clb(null, r);
            }
          } catch (err) {
            clb(err);
          }
        } else {
          fc(languages, namespace, key, fallbackValue, clb, opts);
        }
      }
      if (!languages || !languages[0]) return;
      this.store.addResource(languages[0], namespace, key, fallbackValue);
    }
  };
  var get = () => ({
    debug: false,
    initImmediate: true,
    ns: ["translation"],
    defaultNS: ["translation"],
    fallbackLng: ["dev"],
    fallbackNS: false,
    supportedLngs: false,
    nonExplicitSupportedLngs: false,
    load: "all",
    preload: false,
    simplifyPluralSuffix: true,
    keySeparator: ".",
    nsSeparator: ":",
    pluralSeparator: "_",
    contextSeparator: "_",
    partialBundledLanguages: false,
    saveMissing: false,
    updateMissing: false,
    saveMissingTo: "fallback",
    saveMissingPlurals: true,
    missingKeyHandler: false,
    missingInterpolationHandler: false,
    postProcess: false,
    postProcessPassResolved: false,
    returnNull: false,
    returnEmptyString: true,
    returnObjects: false,
    joinArrays: false,
    returnedObjectHandler: false,
    parseMissingKeyHandler: false,
    appendNamespaceToMissingKey: false,
    appendNamespaceToCIMode: false,
    overloadTranslationOptionHandler: (args) => {
      let ret = {};
      if (typeof args[1] === "object") ret = args[1];
      if (isString(args[1])) ret.defaultValue = args[1];
      if (isString(args[2])) ret.tDescription = args[2];
      if (typeof args[2] === "object" || typeof args[3] === "object") {
        const options = args[3] || args[2];
        Object.keys(options).forEach((key) => {
          ret[key] = options[key];
        });
      }
      return ret;
    },
    interpolation: {
      escapeValue: true,
      format: (value) => value,
      prefix: "{{",
      suffix: "}}",
      formatSeparator: ",",
      unescapePrefix: "-",
      nestingPrefix: "$t(",
      nestingSuffix: ")",
      nestingOptionsSeparator: ",",
      maxReplaces: 1e3,
      skipOnVariables: true
    }
  });
  var transformOptions = (options) => {
    if (isString(options.ns)) options.ns = [options.ns];
    if (isString(options.fallbackLng)) options.fallbackLng = [options.fallbackLng];
    if (isString(options.fallbackNS)) options.fallbackNS = [options.fallbackNS];
    if (options.supportedLngs && options.supportedLngs.indexOf("cimode") < 0) {
      options.supportedLngs = options.supportedLngs.concat(["cimode"]);
    }
    return options;
  };
  var noop = () => {
  };
  var bindMemberFunctions = (inst) => {
    const mems = Object.getOwnPropertyNames(Object.getPrototypeOf(inst));
    mems.forEach((mem) => {
      if (typeof inst[mem] === "function") {
        inst[mem] = inst[mem].bind(inst);
      }
    });
  };
  var I18n = class _I18n extends EventEmitter {
    constructor() {
      let options = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
      let callback = arguments.length > 1 ? arguments[1] : void 0;
      super();
      this.options = transformOptions(options);
      this.services = {};
      this.logger = baseLogger;
      this.modules = {
        external: []
      };
      bindMemberFunctions(this);
      if (callback && !this.isInitialized && !options.isClone) {
        if (!this.options.initImmediate) {
          this.init(options, callback);
          return this;
        }
        setTimeout(() => {
          this.init(options, callback);
        }, 0);
      }
    }
    init() {
      var _this = this;
      let options = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
      let callback = arguments.length > 1 ? arguments[1] : void 0;
      this.isInitializing = true;
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      if (!options.defaultNS && options.defaultNS !== false && options.ns) {
        if (isString(options.ns)) {
          options.defaultNS = options.ns;
        } else if (options.ns.indexOf("translation") < 0) {
          options.defaultNS = options.ns[0];
        }
      }
      const defOpts = get();
      this.options = {
        ...defOpts,
        ...this.options,
        ...transformOptions(options)
      };
      if (this.options.compatibilityAPI !== "v1") {
        this.options.interpolation = {
          ...defOpts.interpolation,
          ...this.options.interpolation
        };
      }
      if (options.keySeparator !== void 0) {
        this.options.userDefinedKeySeparator = options.keySeparator;
      }
      if (options.nsSeparator !== void 0) {
        this.options.userDefinedNsSeparator = options.nsSeparator;
      }
      const createClassOnDemand = (ClassOrObject) => {
        if (!ClassOrObject) return null;
        if (typeof ClassOrObject === "function") return new ClassOrObject();
        return ClassOrObject;
      };
      if (!this.options.isClone) {
        if (this.modules.logger) {
          baseLogger.init(createClassOnDemand(this.modules.logger), this.options);
        } else {
          baseLogger.init(null, this.options);
        }
        let formatter;
        if (this.modules.formatter) {
          formatter = this.modules.formatter;
        } else if (typeof Intl !== "undefined") {
          formatter = Formatter;
        }
        const lu = new LanguageUtil(this.options);
        this.store = new ResourceStore(this.options.resources, this.options);
        const s = this.services;
        s.logger = baseLogger;
        s.resourceStore = this.store;
        s.languageUtils = lu;
        s.pluralResolver = new PluralResolver(lu, {
          prepend: this.options.pluralSeparator,
          compatibilityJSON: this.options.compatibilityJSON,
          simplifyPluralSuffix: this.options.simplifyPluralSuffix
        });
        if (formatter && (!this.options.interpolation.format || this.options.interpolation.format === defOpts.interpolation.format)) {
          s.formatter = createClassOnDemand(formatter);
          s.formatter.init(s, this.options);
          this.options.interpolation.format = s.formatter.format.bind(s.formatter);
        }
        s.interpolator = new Interpolator(this.options);
        s.utils = {
          hasLoadedNamespace: this.hasLoadedNamespace.bind(this)
        };
        s.backendConnector = new Connector(createClassOnDemand(this.modules.backend), s.resourceStore, s, this.options);
        s.backendConnector.on("*", function(event) {
          for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
            args[_key - 1] = arguments[_key];
          }
          _this.emit(event, ...args);
        });
        if (this.modules.languageDetector) {
          s.languageDetector = createClassOnDemand(this.modules.languageDetector);
          if (s.languageDetector.init) s.languageDetector.init(s, this.options.detection, this.options);
        }
        if (this.modules.i18nFormat) {
          s.i18nFormat = createClassOnDemand(this.modules.i18nFormat);
          if (s.i18nFormat.init) s.i18nFormat.init(this);
        }
        this.translator = new Translator(this.services, this.options);
        this.translator.on("*", function(event) {
          for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
            args[_key2 - 1] = arguments[_key2];
          }
          _this.emit(event, ...args);
        });
        this.modules.external.forEach((m) => {
          if (m.init) m.init(this);
        });
      }
      this.format = this.options.interpolation.format;
      if (!callback) callback = noop;
      if (this.options.fallbackLng && !this.services.languageDetector && !this.options.lng) {
        const codes = this.services.languageUtils.getFallbackCodes(this.options.fallbackLng);
        if (codes.length > 0 && codes[0] !== "dev") this.options.lng = codes[0];
      }
      if (!this.services.languageDetector && !this.options.lng) {
        this.logger.warn("init: no languageDetector is used and no lng is defined");
      }
      const storeApi = ["getResource", "hasResourceBundle", "getResourceBundle", "getDataByLanguage"];
      storeApi.forEach((fcName) => {
        this[fcName] = function() {
          return _this.store[fcName](...arguments);
        };
      });
      const storeApiChained = ["addResource", "addResources", "addResourceBundle", "removeResourceBundle"];
      storeApiChained.forEach((fcName) => {
        this[fcName] = function() {
          _this.store[fcName](...arguments);
          return _this;
        };
      });
      const deferred = defer();
      const load = () => {
        const finish = (err, t2) => {
          this.isInitializing = false;
          if (this.isInitialized && !this.initializedStoreOnce) this.logger.warn("init: i18next is already initialized. You should call init just once!");
          this.isInitialized = true;
          if (!this.options.isClone) this.logger.log("initialized", this.options);
          this.emit("initialized", this.options);
          deferred.resolve(t2);
          callback(err, t2);
        };
        if (this.languages && this.options.compatibilityAPI !== "v1" && !this.isInitialized) return finish(null, this.t.bind(this));
        this.changeLanguage(this.options.lng, finish);
      };
      if (this.options.resources || !this.options.initImmediate) {
        load();
      } else {
        setTimeout(load, 0);
      }
      return deferred;
    }
    loadResources(language) {
      let callback = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : noop;
      let usedCallback = callback;
      const usedLng = isString(language) ? language : this.language;
      if (typeof language === "function") usedCallback = language;
      if (!this.options.resources || this.options.partialBundledLanguages) {
        if (usedLng && usedLng.toLowerCase() === "cimode" && (!this.options.preload || this.options.preload.length === 0)) return usedCallback();
        const toLoad = [];
        const append = (lng) => {
          if (!lng) return;
          if (lng === "cimode") return;
          const lngs = this.services.languageUtils.toResolveHierarchy(lng);
          lngs.forEach((l) => {
            if (l === "cimode") return;
            if (toLoad.indexOf(l) < 0) toLoad.push(l);
          });
        };
        if (!usedLng) {
          const fallbacks = this.services.languageUtils.getFallbackCodes(this.options.fallbackLng);
          fallbacks.forEach((l) => append(l));
        } else {
          append(usedLng);
        }
        if (this.options.preload) {
          this.options.preload.forEach((l) => append(l));
        }
        this.services.backendConnector.load(toLoad, this.options.ns, (e2) => {
          if (!e2 && !this.resolvedLanguage && this.language) this.setResolvedLanguage(this.language);
          usedCallback(e2);
        });
      } else {
        usedCallback(null);
      }
    }
    reloadResources(lngs, ns, callback) {
      const deferred = defer();
      if (typeof lngs === "function") {
        callback = lngs;
        lngs = void 0;
      }
      if (typeof ns === "function") {
        callback = ns;
        ns = void 0;
      }
      if (!lngs) lngs = this.languages;
      if (!ns) ns = this.options.ns;
      if (!callback) callback = noop;
      this.services.backendConnector.reload(lngs, ns, (err) => {
        deferred.resolve();
        callback(err);
      });
      return deferred;
    }
    use(module) {
      if (!module) throw new Error("You are passing an undefined module! Please check the object you are passing to i18next.use()");
      if (!module.type) throw new Error("You are passing a wrong module! Please check the object you are passing to i18next.use()");
      if (module.type === "backend") {
        this.modules.backend = module;
      }
      if (module.type === "logger" || module.log && module.warn && module.error) {
        this.modules.logger = module;
      }
      if (module.type === "languageDetector") {
        this.modules.languageDetector = module;
      }
      if (module.type === "i18nFormat") {
        this.modules.i18nFormat = module;
      }
      if (module.type === "postProcessor") {
        postProcessor.addPostProcessor(module);
      }
      if (module.type === "formatter") {
        this.modules.formatter = module;
      }
      if (module.type === "3rdParty") {
        this.modules.external.push(module);
      }
      return this;
    }
    setResolvedLanguage(l) {
      if (!l || !this.languages) return;
      if (["cimode", "dev"].indexOf(l) > -1) return;
      for (let li = 0; li < this.languages.length; li++) {
        const lngInLngs = this.languages[li];
        if (["cimode", "dev"].indexOf(lngInLngs) > -1) continue;
        if (this.store.hasLanguageSomeTranslations(lngInLngs)) {
          this.resolvedLanguage = lngInLngs;
          break;
        }
      }
    }
    changeLanguage(lng, callback) {
      var _this2 = this;
      this.isLanguageChangingTo = lng;
      const deferred = defer();
      this.emit("languageChanging", lng);
      const setLngProps = (l) => {
        this.language = l;
        this.languages = this.services.languageUtils.toResolveHierarchy(l);
        this.resolvedLanguage = void 0;
        this.setResolvedLanguage(l);
      };
      const done = (err, l) => {
        if (l) {
          setLngProps(l);
          this.translator.changeLanguage(l);
          this.isLanguageChangingTo = void 0;
          this.emit("languageChanged", l);
          this.logger.log("languageChanged", l);
        } else {
          this.isLanguageChangingTo = void 0;
        }
        deferred.resolve(function() {
          return _this2.t(...arguments);
        });
        if (callback) callback(err, function() {
          return _this2.t(...arguments);
        });
      };
      const setLng = (lngs) => {
        if (!lng && !lngs && this.services.languageDetector) lngs = [];
        const l = isString(lngs) ? lngs : this.services.languageUtils.getBestMatchFromCodes(lngs);
        if (l) {
          if (!this.language) {
            setLngProps(l);
          }
          if (!this.translator.language) this.translator.changeLanguage(l);
          if (this.services.languageDetector && this.services.languageDetector.cacheUserLanguage) this.services.languageDetector.cacheUserLanguage(l);
        }
        this.loadResources(l, (err) => {
          done(err, l);
        });
      };
      if (!lng && this.services.languageDetector && !this.services.languageDetector.async) {
        setLng(this.services.languageDetector.detect());
      } else if (!lng && this.services.languageDetector && this.services.languageDetector.async) {
        if (this.services.languageDetector.detect.length === 0) {
          this.services.languageDetector.detect().then(setLng);
        } else {
          this.services.languageDetector.detect(setLng);
        }
      } else {
        setLng(lng);
      }
      return deferred;
    }
    getFixedT(lng, ns, keyPrefix) {
      var _this3 = this;
      const fixedT = function(key, opts) {
        let options;
        if (typeof opts !== "object") {
          for (var _len3 = arguments.length, rest = new Array(_len3 > 2 ? _len3 - 2 : 0), _key3 = 2; _key3 < _len3; _key3++) {
            rest[_key3 - 2] = arguments[_key3];
          }
          options = _this3.options.overloadTranslationOptionHandler([key, opts].concat(rest));
        } else {
          options = {
            ...opts
          };
        }
        options.lng = options.lng || fixedT.lng;
        options.lngs = options.lngs || fixedT.lngs;
        options.ns = options.ns || fixedT.ns;
        if (options.keyPrefix !== "") options.keyPrefix = options.keyPrefix || keyPrefix || fixedT.keyPrefix;
        const keySeparator = _this3.options.keySeparator || ".";
        let resultKey;
        if (options.keyPrefix && Array.isArray(key)) {
          resultKey = key.map((k) => `${options.keyPrefix}${keySeparator}${k}`);
        } else {
          resultKey = options.keyPrefix ? `${options.keyPrefix}${keySeparator}${key}` : key;
        }
        return _this3.t(resultKey, options);
      };
      if (isString(lng)) {
        fixedT.lng = lng;
      } else {
        fixedT.lngs = lng;
      }
      fixedT.ns = ns;
      fixedT.keyPrefix = keyPrefix;
      return fixedT;
    }
    t() {
      return this.translator && this.translator.translate(...arguments);
    }
    exists() {
      return this.translator && this.translator.exists(...arguments);
    }
    setDefaultNamespace(ns) {
      this.options.defaultNS = ns;
    }
    hasLoadedNamespace(ns) {
      let options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
      if (!this.isInitialized) {
        this.logger.warn("hasLoadedNamespace: i18next was not initialized", this.languages);
        return false;
      }
      if (!this.languages || !this.languages.length) {
        this.logger.warn("hasLoadedNamespace: i18n.languages were undefined or empty", this.languages);
        return false;
      }
      const lng = options.lng || this.resolvedLanguage || this.languages[0];
      const fallbackLng = this.options ? this.options.fallbackLng : false;
      const lastLng = this.languages[this.languages.length - 1];
      if (lng.toLowerCase() === "cimode") return true;
      const loadNotPending = (l, n) => {
        const loadState = this.services.backendConnector.state[`${l}|${n}`];
        return loadState === -1 || loadState === 0 || loadState === 2;
      };
      if (options.precheck) {
        const preResult = options.precheck(this, loadNotPending);
        if (preResult !== void 0) return preResult;
      }
      if (this.hasResourceBundle(lng, ns)) return true;
      if (!this.services.backendConnector.backend || this.options.resources && !this.options.partialBundledLanguages) return true;
      if (loadNotPending(lng, ns) && (!fallbackLng || loadNotPending(lastLng, ns))) return true;
      return false;
    }
    loadNamespaces(ns, callback) {
      const deferred = defer();
      if (!this.options.ns) {
        if (callback) callback();
        return Promise.resolve();
      }
      if (isString(ns)) ns = [ns];
      ns.forEach((n) => {
        if (this.options.ns.indexOf(n) < 0) this.options.ns.push(n);
      });
      this.loadResources((err) => {
        deferred.resolve();
        if (callback) callback(err);
      });
      return deferred;
    }
    loadLanguages(lngs, callback) {
      const deferred = defer();
      if (isString(lngs)) lngs = [lngs];
      const preloaded = this.options.preload || [];
      const newLngs = lngs.filter((lng) => preloaded.indexOf(lng) < 0 && this.services.languageUtils.isSupportedCode(lng));
      if (!newLngs.length) {
        if (callback) callback();
        return Promise.resolve();
      }
      this.options.preload = preloaded.concat(newLngs);
      this.loadResources((err) => {
        deferred.resolve();
        if (callback) callback(err);
      });
      return deferred;
    }
    dir(lng) {
      if (!lng) lng = this.resolvedLanguage || (this.languages && this.languages.length > 0 ? this.languages[0] : this.language);
      if (!lng) return "rtl";
      const rtlLngs = ["ar", "shu", "sqr", "ssh", "xaa", "yhd", "yud", "aao", "abh", "abv", "acm", "acq", "acw", "acx", "acy", "adf", "ads", "aeb", "aec", "afb", "ajp", "apc", "apd", "arb", "arq", "ars", "ary", "arz", "auz", "avl", "ayh", "ayl", "ayn", "ayp", "bbz", "pga", "he", "iw", "ps", "pbt", "pbu", "pst", "prp", "prd", "ug", "ur", "ydd", "yds", "yih", "ji", "yi", "hbo", "men", "xmn", "fa", "jpr", "peo", "pes", "prs", "dv", "sam", "ckb"];
      const languageUtils = this.services && this.services.languageUtils || new LanguageUtil(get());
      return rtlLngs.indexOf(languageUtils.getLanguagePartFromCode(lng)) > -1 || lng.toLowerCase().indexOf("-arab") > 1 ? "rtl" : "ltr";
    }
    static createInstance() {
      let options = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
      let callback = arguments.length > 1 ? arguments[1] : void 0;
      return new _I18n(options, callback);
    }
    cloneInstance() {
      let options = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
      let callback = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : noop;
      const forkResourceStore = options.forkResourceStore;
      if (forkResourceStore) delete options.forkResourceStore;
      const mergedOptions = {
        ...this.options,
        ...options,
        ...{
          isClone: true
        }
      };
      const clone = new _I18n(mergedOptions);
      if (options.debug !== void 0 || options.prefix !== void 0) {
        clone.logger = clone.logger.clone(options);
      }
      const membersToCopy = ["store", "services", "language"];
      membersToCopy.forEach((m) => {
        clone[m] = this[m];
      });
      clone.services = {
        ...this.services
      };
      clone.services.utils = {
        hasLoadedNamespace: clone.hasLoadedNamespace.bind(clone)
      };
      if (forkResourceStore) {
        clone.store = new ResourceStore(this.store.data, mergedOptions);
        clone.services.resourceStore = clone.store;
      }
      clone.translator = new Translator(clone.services, mergedOptions);
      clone.translator.on("*", function(event) {
        for (var _len4 = arguments.length, args = new Array(_len4 > 1 ? _len4 - 1 : 0), _key4 = 1; _key4 < _len4; _key4++) {
          args[_key4 - 1] = arguments[_key4];
        }
        clone.emit(event, ...args);
      });
      clone.init(mergedOptions, callback);
      clone.translator.options = mergedOptions;
      clone.translator.backendConnector.services.utils = {
        hasLoadedNamespace: clone.hasLoadedNamespace.bind(clone)
      };
      return clone;
    }
    toJSON() {
      return {
        options: this.options,
        store: this.store,
        language: this.language,
        languages: this.languages,
        resolvedLanguage: this.resolvedLanguage
      };
    }
  };
  var instance = I18n.createInstance();
  instance.createInstance = I18n.createInstance;
  var createInstance = instance.createInstance;
  var dir = instance.dir;
  var init = instance.init;
  var loadResources = instance.loadResources;
  var reloadResources = instance.reloadResources;
  var use = instance.use;
  var changeLanguage = instance.changeLanguage;
  var getFixedT = instance.getFixedT;
  var t = instance.t;
  var exists = instance.exists;
  var setDefaultNamespace = instance.setDefaultNamespace;
  var hasLoadedNamespace = instance.hasLoadedNamespace;
  var loadNamespaces = instance.loadNamespaces;
  var loadLanguages = instance.loadLanguages;
  var import_void_elements = __toESM2(require_void_elements());
  var warn = (i18n, code, msg, rest) => {
    const args = [msg, {
      code,
      ...rest || {}
    }];
    if (i18n?.services?.logger?.forward) {
      return i18n.services.logger.forward(args, "warn", "react-i18next::", true);
    }
    if (isString2(args[0])) args[0] = `react-i18next:: ${args[0]}`;
    if (i18n?.services?.logger?.warn) {
      i18n.services.logger.warn(...args);
    } else if (console?.warn) {
      console.warn(...args);
    }
  };
  var alreadyWarned = {};
  var warnOnce = (i18n, code, msg, rest) => {
    if (isString2(msg) && alreadyWarned[msg]) return;
    if (isString2(msg)) alreadyWarned[msg] = /* @__PURE__ */ new Date();
    warn(i18n, code, msg, rest);
  };
  var loadedClb = (i18n, cb) => () => {
    if (i18n.isInitialized) {
      cb();
    } else {
      const initialized = () => {
        setTimeout(() => {
          i18n.off("initialized", initialized);
        }, 0);
        cb();
      };
      i18n.on("initialized", initialized);
    }
  };
  var loadNamespaces2 = (i18n, ns, cb) => {
    i18n.loadNamespaces(ns, loadedClb(i18n, cb));
  };
  var loadLanguages2 = (i18n, lng, ns, cb) => {
    if (isString2(ns)) ns = [ns];
    if (i18n.options.preload && i18n.options.preload.indexOf(lng) > -1) return loadNamespaces2(i18n, ns, cb);
    ns.forEach((n) => {
      if (i18n.options.ns.indexOf(n) < 0) i18n.options.ns.push(n);
    });
    i18n.loadLanguages(lng, loadedClb(i18n, cb));
  };
  var hasLoadedNamespace2 = (ns, i18n, options = {}) => {
    if (!i18n.languages || !i18n.languages.length) {
      warnOnce(i18n, "NO_LANGUAGES", "i18n.languages were undefined or empty", {
        languages: i18n.languages
      });
      return true;
    }
    return i18n.hasLoadedNamespace(ns, {
      lng: options.lng,
      precheck: (i18nInstance2, loadNotPending) => {
        if (options.bindI18n && options.bindI18n.indexOf("languageChanging") > -1 && i18nInstance2.services.backendConnector.backend && i18nInstance2.isLanguageChangingTo && !loadNotPending(i18nInstance2.isLanguageChangingTo, ns)) return false;
      }
    });
  };
  var isString2 = (obj) => typeof obj === "string";
  var isObject = (obj) => typeof obj === "object" && obj !== null;
  var matchHtmlEntity = /&(?:amp|#38|lt|#60|gt|#62|apos|#39|quot|#34|nbsp|#160|copy|#169|reg|#174|hellip|#8230|#x2F|#47);/g;
  var htmlEntities = {
    "&amp;": "&",
    "&#38;": "&",
    "&lt;": "<",
    "&#60;": "<",
    "&gt;": ">",
    "&#62;": ">",
    "&apos;": "'",
    "&#39;": "'",
    "&quot;": '"',
    "&#34;": '"',
    "&nbsp;": " ",
    "&#160;": " ",
    "&copy;": "\xA9",
    "&#169;": "\xA9",
    "&reg;": "\xAE",
    "&#174;": "\xAE",
    "&hellip;": "\u2026",
    "&#8230;": "\u2026",
    "&#x2F;": "/",
    "&#47;": "/"
  };
  var unescapeHtmlEntity = (m) => htmlEntities[m];
  var unescape = (text) => text.replace(matchHtmlEntity, unescapeHtmlEntity);
  var defaultOptions = {
    bindI18n: "languageChanged",
    bindI18nStore: "",
    transEmptyNodeValue: "",
    transSupportBasicHtmlNodes: true,
    transWrapTextNodes: "",
    transKeepBasicHtmlNodesFor: ["br", "strong", "i", "p"],
    useSuspense: true,
    unescape
  };
  var setDefaults = (options = {}) => {
    defaultOptions = {
      ...defaultOptions,
      ...options
    };
  };
  var getDefaults = () => defaultOptions;
  var i18nInstance;
  var setI18n = (instance2) => {
    i18nInstance = instance2;
  };
  var getI18n = () => i18nInstance;
  var initReactI18next = {
    type: "3rdParty",
    init(instance2) {
      setDefaults(instance2.options.react);
      setI18n(instance2);
    }
  };
  var I18nContext = (0, import_react3.createContext)();
  var ReportNamespaces = class {
    constructor() {
      this.usedNamespaces = {};
    }
    addUsedNamespaces(namespaces) {
      namespaces.forEach((ns) => {
        if (!this.usedNamespaces[ns]) this.usedNamespaces[ns] = true;
      });
    }
    getUsedNamespaces() {
      return Object.keys(this.usedNamespaces);
    }
  };
  var usePrevious = (value, ignore) => {
    const ref = (0, import_react4.useRef)();
    (0, import_react4.useEffect)(() => {
      ref.current = ignore ? ref.current : value;
    }, [value, ignore]);
    return ref.current;
  };
  var alwaysNewT = (i18n, language, namespace, keyPrefix) => i18n.getFixedT(language, namespace, keyPrefix);
  var useMemoizedT = (i18n, language, namespace, keyPrefix) => (0, import_react4.useCallback)(alwaysNewT(i18n, language, namespace, keyPrefix), [i18n, language, namespace, keyPrefix]);
  var useTranslation = (ns, props = {}) => {
    const {
      i18n: i18nFromProps
    } = props;
    const {
      i18n: i18nFromContext,
      defaultNS: defaultNSFromContext
    } = (0, import_react4.useContext)(I18nContext) || {};
    const i18n = i18nFromProps || i18nFromContext || getI18n();
    if (i18n && !i18n.reportNamespaces) i18n.reportNamespaces = new ReportNamespaces();
    if (!i18n) {
      warnOnce(i18n, "NO_I18NEXT_INSTANCE", "useTranslation: You will need to pass in an i18next instance by using initReactI18next");
      const notReadyT = (k, optsOrDefaultValue) => {
        if (isString2(optsOrDefaultValue)) return optsOrDefaultValue;
        if (isObject(optsOrDefaultValue) && isString2(optsOrDefaultValue.defaultValue)) return optsOrDefaultValue.defaultValue;
        return Array.isArray(k) ? k[k.length - 1] : k;
      };
      const retNotReady = [notReadyT, {}, false];
      retNotReady.t = notReadyT;
      retNotReady.i18n = {};
      retNotReady.ready = false;
      return retNotReady;
    }
    if (i18n.options.react?.wait) warnOnce(i18n, "DEPRECATED_OPTION", "useTranslation: It seems you are still using the old wait option, you may migrate to the new useSuspense behaviour.");
    const i18nOptions = {
      ...getDefaults(),
      ...i18n.options.react,
      ...props
    };
    const {
      useSuspense,
      keyPrefix
    } = i18nOptions;
    let namespaces = ns || defaultNSFromContext || i18n.options?.defaultNS;
    namespaces = isString2(namespaces) ? [namespaces] : namespaces || ["translation"];
    i18n.reportNamespaces.addUsedNamespaces?.(namespaces);
    const ready = (i18n.isInitialized || i18n.initializedStoreOnce) && namespaces.every((n) => hasLoadedNamespace2(n, i18n, i18nOptions));
    const memoGetT = useMemoizedT(i18n, props.lng || null, i18nOptions.nsMode === "fallback" ? namespaces : namespaces[0], keyPrefix);
    const getT = () => memoGetT;
    const getNewT = () => alwaysNewT(i18n, props.lng || null, i18nOptions.nsMode === "fallback" ? namespaces : namespaces[0], keyPrefix);
    const [t2, setT] = (0, import_react4.useState)(getT);
    let joinedNS = namespaces.join();
    if (props.lng) joinedNS = `${props.lng}${joinedNS}`;
    const previousJoinedNS = usePrevious(joinedNS);
    const isMounted = (0, import_react4.useRef)(true);
    (0, import_react4.useEffect)(() => {
      const {
        bindI18n,
        bindI18nStore
      } = i18nOptions;
      isMounted.current = true;
      if (!ready && !useSuspense) {
        if (props.lng) {
          loadLanguages2(i18n, props.lng, namespaces, () => {
            if (isMounted.current) setT(getNewT);
          });
        } else {
          loadNamespaces2(i18n, namespaces, () => {
            if (isMounted.current) setT(getNewT);
          });
        }
      }
      if (ready && previousJoinedNS && previousJoinedNS !== joinedNS && isMounted.current) {
        setT(getNewT);
      }
      const boundReset = () => {
        if (isMounted.current) setT(getNewT);
      };
      if (bindI18n) i18n?.on(bindI18n, boundReset);
      if (bindI18nStore) i18n?.store.on(bindI18nStore, boundReset);
      return () => {
        isMounted.current = false;
        if (i18n && bindI18n) bindI18n?.split(" ").forEach((e2) => i18n.off(e2, boundReset));
        if (bindI18nStore && i18n) bindI18nStore.split(" ").forEach((e2) => i18n.store.off(e2, boundReset));
      };
    }, [i18n, joinedNS]);
    (0, import_react4.useEffect)(() => {
      if (isMounted.current && ready) {
        setT(getT);
      }
    }, [i18n, keyPrefix, ready]);
    const ret = [t2, i18n, ready];
    ret.t = t2;
    ret.i18n = i18n;
    ret.ready = ready;
    if (ready) return ret;
    if (!ready && !useSuspense) return ret;
    throw new Promise((resolve) => {
      if (props.lng) {
        loadLanguages2(i18n, props.lng, namespaces, () => resolve());
      } else {
        loadNamespaces2(i18n, namespaces, () => resolve());
      }
    });
  };
  var es_default = {
    app: {
      name: "Pharos",
      tagline: "Suite de gesti\xF3n de pruebas QA",
      version: "Versi\xF3n {{version}}"
    },
    dbError: {
      title: "No se pudo abrir la base de datos local",
      body: "Pharos no ha modificado ning\xFAn archivo. Cierra la app y vuelve a intentarlo; si el problema sigue, comparte este detalle con soporte.",
      newerTitle: "Estos datos son de una versi\xF3n m\xE1s nueva de Pharos",
      newerBody: "La base de datos local la guard\xF3 una versi\xF3n m\xE1s reciente que esta. Para no estropearla, Pharos no la abre ni la modifica. Instala esa versi\xF3n o una posterior.",
      keyMissingTitle: "Falta la clave de la base de datos local",
      keyMismatchTitle: "La clave guardada no abre la base de datos local",
      keyBody: "Los datos siguen cifrados en este equipo, pero la clave no est\xE1 en el almac\xE9n de credenciales del sistema (pasa en un PC nuevo o tras reinstalar Windows). Escribe la clave de recuperaci\xF3n que guardaste desde Perfil para abrirlos. Pharos no modifica ning\xFAn archivo hasta que la clave sea correcta.",
      recovery: {
        label: "Clave de recuperaci\xF3n",
        hint: "56 caracteres en grupos de 4. Da igual may\xFAsculas, espacios o guiones.",
        submit: "Abrir con la clave",
        opening: "Abriendo\u2026",
        invalid: "La clave tiene un error de escritura: revisa cada grupo y vuelve a intentarlo.",
        wrong: "La clave es v\xE1lida, pero no abre esta base de datos: es otra clave o el archivo est\xE1 da\xF1ado. Comprueba que sea la de este equipo; si lo es, una copia pharos.db.enc.bak-\u2026 puede abrirse con ella (README, Clave de recuperaci\xF3n).",
        failed: "No se pudo abrir con la clave: {{detail}}"
      }
    },
    common: {
      loading: "Cargando\u2026",
      delete: "Eliminar",
      confirmDelete: "S\xED, eliminar",
      cancel: "Cancelar",
      noData: "Sin datos",
      edit: "Editar",
      discardConfirm: "Tienes cambios sin guardar. \xBFDescartarlos?"
    },
    templates: {
      title: "Plantillas",
      subtitle: "Repositorio de plantillas de plan y caso. Las de PHAROS vienen incluidas.",
      kind: {
        plan: "Planes de prueba",
        case: "Casos de prueba"
      },
      builtin: "Incluida",
      shared: "Compartida",
      sharedHint: "Importada antes de las cuentas: la ven todas las cuentas de este equipo y es de solo lectura. Para editarla, desc\xE1rgala e imp\xF3rtala de nuevo.",
      download: "Descargar .xlsx",
      import: "Importar plantilla",
      importedToast: "Plantilla importada: \xAB{{name}}\xBB",
      updatedToast: "Plantilla actualizada",
      deleteTitle: "Eliminar plantilla",
      deleteWarning: "\xBFEliminar la plantilla \xAB{{name}}\xBB? Esta acci\xF3n no se puede deshacer.",
      form: {
        createTitle: "Importar plantilla",
        editTitle: "Editar plantilla",
        name: "Nombre",
        kind: "Tipo",
        language: "Idioma",
        version: "Versi\xF3n",
        description: "Descripci\xF3n",
        usagePrompt: "Prompt de uso (para la IA)",
        usagePromptHint: "Describe para qu\xE9 sirve y cu\xE1ndo la IA deber\xEDa sugerirla.",
        save: "Guardar"
      }
    },
    ai: {
      title: "Asistente de IA",
      subtitle: "Elige el proveedor online con tu propia clave (Gemini, OpenAI, Claude, OpenRouter o un endpoint compatible) y el offline (Ollama). La app funciona sin IA.",
      test: "Probar conexi\xF3n",
      testing: "Probando\u2026",
      mode: "Modo",
      modeOption: {
        auto: "Autom\xE1tico",
        online: "Online",
        offline: "Offline"
      },
      using: "En uso",
      provider: {
        offline: "Ollama (offline)",
        none: "Ninguno"
      },
      onlineProvider: "Proveedor",
      providerHint: {
        gemini: "Modelos Gemini de Google.",
        openai: "Modelos GPT de OpenAI.",
        anthropic: "Modelos Claude de Anthropic.",
        openrouter: "Una sola clave para modelos de muchos proveedores.",
        custom: "Cualquier servicio compatible con la API de OpenAI: Groq, DeepSeek, Mistral, Together, o un servidor local como LM Studio o vLLM."
      },
      keyWhere: "Consigue tu clave en",
      baseUrl: "URL base",
      baseUrlHint: "Ej.: https://api.groq.com/openai/v1 o http://localhost:1234/v1 (LM Studio). Debe ser https; http solo se admite para localhost.",
      endpointStatus: "Endpoint",
      endpointSet: "Configurado",
      endpointNotSet: "Falta la URL base",
      keyOptional: "API key (opcional)",
      tab: {
        online: "IA online",
        offline: "IA offline"
      },
      keyStatus: "Clave de API",
      keyConfigured: "Configurada",
      keyNotSet: "No configurada",
      keyPlaceholder: "Pega tu API key de {{provider}}",
      saveKey: "Guardar clave",
      clearKey: "Borrar clave",
      keySaved: "Clave guardada en el keychain",
      keyCleared: "Clave eliminada",
      model: "Modelo",
      modelPlaceholder: "Escribe un modelo o pulsa \xABListar modelos\xBB",
      listModels: "Listar modelos",
      listingModels: "Consultando\u2026",
      modelsFound: "{{count}} modelos disponibles: elige uno en el campo Modelo",
      modelsNone: "El proveedor no devolvi\xF3 modelos",
      modelsFailed: "No se pudieron listar los modelos: {{error}}",
      temperature: "Temperatura",
      temperatureIgnored: "La API de Claude no admite ajustar la temperatura, as\xED que este valor no se env\xEDa.",
      ollamaStatus: "Ollama",
      ollamaOffline: "No detectado (\xBFest\xE1 en ejecuci\xF3n?)",
      modelInstalled: "Modelo instalado",
      modelMissing: "Falta el modelo",
      endpoint: "Endpoint",
      downloadModel: "Descargar \xAB{{model}}\xBB",
      refresh: "Actualizar estado",
      dontClose: "No cierres la app mientras se descarga el modelo. Si se cierra, la descarga se reanuda al volver a abrirla (no se pierde el progreso).",
      modelReady: "Modelo descargado y listo",
      ollamaError: "No se pudo contactar con Ollama",
      testPrompt: "Responde solo con: OK",
      testOk: "Conexi\xF3n correcta",
      testEmpty: "El proveedor respondi\xF3 vac\xEDo",
      testNoProvider: "No hay IA disponible: configura un proveedor online (clave y modelo) u Ollama",
      testFailedWith: "Fall\xF3 la conexi\xF3n con la IA: {{error}}",
      neverBlocks: "La ausencia de IA nunca bloquea la app: los botones de asistencia se deshabilitan con aviso.",
      assist: {
        button: "\u2728 Asistir con IA",
        drafting: "Redactando\u2026",
        previewTitle: "Borrador de la IA",
        use: "Usar",
        discard: "Descartar",
        unavailable: "Configura la IA (un proveedor online u Ollama) para usar esto",
        empty: "La IA no devolvi\xF3 texto.",
        error: "No se pudo redactar con la IA"
      },
      structured: {
        thinking: "Pensando\u2026",
        proposals: "Propuestas de la IA",
        addSelected: "A\xF1adir {{count}}",
        nothingApplied: "No se aplic\xF3 nada.",
        error: {
          empty: "La IA respondi\xF3 vac\xEDo.",
          refusal: "La IA no hizo propuestas.",
          "invalid-json": "La respuesta de la IA no es un JSON v\xE1lido.",
          "invalid-schema": "La respuesta de la IA no tiene el formato esperado.",
          "no-provider": "No hay IA disponible: configura un proveedor online u Ollama.",
          timeout: "La IA no respondi\xF3 a tiempo.",
          provider: "El proveedor de IA devolvi\xF3 un error."
        }
      },
      provenance: {
        pending: "IA \xB7 pendiente de revisi\xF3n",
        short: "IA \xB7 sin revisar",
        markReviewed: "Marcar revisado",
        destination: "Se enviar\xE1 a {{source}}",
        provider: {
          gemini: "Gemini",
          openai: "OpenAI",
          anthropic: "Claude",
          openrouter: "OpenRouter",
          custom: "Compatible con OpenAI",
          ollama: "Ollama (local)"
        }
      }
    },
    sync: {
      synced: "Sincronizado",
      pending: "Cambios pendientes ({{count}})",
      offline: "Sin conexi\xF3n",
      now: "Sincronizar ahora",
      syncing: "Sincronizando\u2026",
      doneToast: "Sincronizado (\u2191{{pushed}} \xB7 \u2193{{pulled}})",
      needsAuth: "Inicia sesi\xF3n para sincronizar",
      failed: "No se pudo sincronizar (\xBFservidor no disponible?)",
      conflicts: "Conflictos ({{count}})",
      conflictToast: "Sincronizado con {{count}} conflicto(s) por revisar",
      unsupportedVersion: "Esta versi\xF3n de Pharos ya no es compatible con el servidor. Actualiza la app para sincronizar; tus cambios se conservan.",
      webConflictToast: "Otro dispositivo guard\xF3 una versi\xF3n m\xE1s reciente de {{count}} elemento(s). Tu edici\xF3n se conserva: rev\xEDsala en Conflictos.",
      skippedToast: "El servidor rechaz\xF3 {{count}} cambio(s) (demasiado grandes o no v\xE1lidos). Siguen pendientes y el resto se sincroniz\xF3.",
      orphans: "{{count}} cambio(s) sin proyecto conocido todav\xEDa; se enviar\xE1n cuando llegue su proyecto",
      web: {
        staleWrite: "Este elemento se cambi\xF3 en otro sitio desde que lo abriste. Tu edici\xF3n sigue en el formulario: guarda de nuevo para reemplazar esa versi\xF3n, o cierra sin guardar para conservarla.",
        deletedElsewhere: "Este elemento se elimin\xF3 en otro sitio desde que lo abriste. Tu edici\xF3n sigue en el formulario: copia lo que necesites antes de cerrarlo.",
        keyTaken: "Ese ID ya lo usa otro elemento del proyecto. Elige otro o d\xE9jalo vac\xEDo para numerarlo autom\xE1ticamente.",
        keyRetired: "Ese ID era de un elemento eliminado y no se reutiliza nunca. Elige otro o d\xE9jalo vac\xEDo.",
        invalidKey: "Ese ID no es v\xE1lido. Usa solo letras, d\xEDgitos y - _ . :",
        desktopOnly: "Por ahora solo est\xE1 disponible en la app de escritorio.",
        legacyLeftovers: "{{count}} elemento(s) de una versi\xF3n web anterior no se pudieron enviar al servidor. Desc\xE1rgalos desde el aviso de arriba.",
        legacyNotice: "{{count}} elemento(s) de una versi\xF3n web anterior sin enviar",
        legacyDownload: "Descargar",
        legacyDiscard: "Descartar",
        legacySaved: "Ya guard\xE9 el archivo",
        legacyDiscardTitle: "Elementos de una versi\xF3n web anterior",
        legacyDiscardConfirm: "\xBFDescartar los {{count}} elemento(s) sin descargarlos? No se podr\xE1n recuperar.",
        legacySavedConfirm: "\xBFQuitar los {{count}} elemento(s) de este navegador? Comprueba antes que el archivo descargado est\xE1 en tus descargas."
      },
      conflict: {
        review: "Revisar conflictos",
        title: "Conflictos de sincronizaci\xF3n",
        intro: "Estos elementos se editaron en este equipo y en otro dispositivo desde la \xFAltima sincronizaci\xF3n. Elige qu\xE9 versi\xF3n conservar; la otra se descarta.",
        onlyChanged: "Mostrar solo los campos distintos",
        empty: "No hay conflictos pendientes.",
        close: "Cerrar",
        field: "Campo",
        local: "Mi versi\xF3n (este equipo)",
        remote: "Versi\xF3n del servidor",
        state: "Estado",
        deleted: "Eliminado",
        exists: "Existe",
        keepLocal: "Conservar la m\xEDa",
        keepRemote: "Usar la del servidor",
        resolved: "Conflicto resuelto",
        failed: "No se pudo resolver el conflicto",
        entity: {
          project: "Proyecto",
          test_plan: "Plan de pruebas",
          test_case: "Caso de prueba",
          requirement: "Requisito",
          planner_card: "Tarjeta del planificador"
        },
        fields: {
          title: "T\xEDtulo",
          name: "Nombre",
          version: "Versi\xF3n",
          status: "Estado",
          priority: "Prioridad",
          author: "Autor",
          scenarioId: "ID de escenario",
          projectId: "Proyecto",
          ownerId: "Propietario",
          planDate: "Fecha del plan",
          caseIdPrefix: "Prefijo de IDs",
          caseIdDigits: "D\xEDgitos de IDs",
          requirementKey: "Clave del requisito",
          cardKey: "Clave del defecto",
          description: "Descripci\xF3n",
          kind: "Tipo",
          position: "Posici\xF3n"
        },
        key: {
          title: "Claves repetidas",
          intro: "Otro elemento del proyecto ya tiene esta clave en el servidor. Mientras eliges otra, este lleva una clave provisional y no se sincroniza. Si alg\xFAn caso enlazaba la clave antigua, rev\xEDsalo.",
          lost: "Quer\xEDa {{key}}",
          current: "Ahora: {{key}}",
          placeholder: "Nueva clave",
          use: "Usar esta clave",
          next: "Asignar la siguiente",
          assigned: "Clave asignada: {{key}}",
          noBlock: "Sincroniza antes para obtener n\xFAmeros nuevos, o escribe una clave.",
          failed: "No se pudo usar esa clave: {{reason}}"
        }
      }
    },
    admin: {
      title: "Administraci\xF3n",
      subtitle: "Plantillas, motor de IA y ajustes de la aplicaci\xF3n.",
      section: {
        templates: {
          title: "Plantillas",
          desc: "Repositorio de plantillas de plan y caso."
        },
        ai: {
          title: "Motor de IA",
          desc: "Proveedor online con tu clave (Gemini, OpenAI, Claude, OpenRouter\u2026) y offline (Ollama)."
        }
      },
      saved: "Ajustes guardados",
      settings: {
        title: "Ajustes",
        background: "Fondo personalizado",
        bgChoose: "Elegir imagen\u2026",
        bgClear: "Quitar",
        opacity: "Opacidad del fondo",
        opacityHint: "M\xE1s bajo = m\xE1s transparente. Solo afecta al fondo, no al contenido.",
        retention: "Retenci\xF3n de elementos borrados (d\xEDas)",
        retentionHint: "Lo que borras se elimina definitivamente de este equipo tras estos d\xEDas. Un borrado a\xFAn sin sincronizar espera al siguiente sync. El servidor tiene su propio plazo y conserva una marca de lo borrado.",
        download: "Carpeta de descarga",
        downloadCurrent: "Carpeta actual",
        downloadDefault: "Descargas del sistema",
        downloadChoose: "Elegir carpeta\u2026",
        downloadReset: "Usar Descargas",
        downloadError: "No se pudo leer ni cambiar la carpeta de descarga.",
        downloadMissing: "La carpeta elegida ya no existe; mientras tanto se guarda en Descargas. Elige otra.",
        downloadHint: "Aqu\xED se guardan todas las exportaciones y el diagn\xF3stico. Nunca se sobrescribe un archivo: se a\xF1ade \xAB (2)\xBB.",
        downloadWebHint: "En la vista web el navegador decide d\xF3nde se guardan las descargas. La carpeta se elige en la app de escritorio.",
        save: "Guardar ajustes"
      },
      diagnostics: {
        title: "Diagn\xF3stico",
        version: "Versi\xF3n instalada",
        desc: "Genera un .zip para informar de un fallo: versi\xF3n de la app, sistema operativo, WebView2, migraciones aplicadas y los registros recientes.",
        excludes: "Nunca incluye tus datos: ni proyectos, planes, casos o requisitos, ni tu perfil, ni la base de datos, claves, tokens o claves de IA. Correos, tokens y rutas con tu usuario se enmascaran."
      }
    },
    importReport: {
      detecting: "Detectando\u2026 ({{done}}/{{total}})",
      doneMsg: "Detecci\xF3n completa. Revisa y aplica.",
      rows: "{{count}} fila(s)",
      notFound: "no detectado",
      blank: "en blanco",
      apply: "Aplicar al formulario"
    },
    auth: {
      loginTitle: "Iniciar sesi\xF3n",
      registerTitle: "Crear cuenta",
      email: "Correo electr\xF3nico",
      password: "Contrase\xF1a",
      displayName: "Alias (nombre para mostrar)",
      firstName: "Nombre",
      lastName: "Apellidos",
      login: "Entrar",
      register: "Registrarme",
      toRegister: "\xBFNo tienes cuenta? Reg\xEDstrate",
      toLogin: "\xBFYa tienes cuenta? Inicia sesi\xF3n",
      loggingIn: "Entrando\u2026",
      logout: "Cerrar sesi\xF3n",
      offline: "Sin conexi\xF3n",
      error: {
        invalid_credentials: "Correo o contrase\xF1a incorrectos.",
        email_in_use: "Ese correo ya est\xE1 registrado.",
        validation_error: "Revisa los datos introducidos.",
        rate_limited: "Demasiados intentos. Espera un momento y vuelve a intentarlo.",
        network: "No se pudo conectar con el servidor.",
        generic: "Algo sali\xF3 mal. Int\xE9ntalo de nuevo."
      }
    },
    topbar: {
      toggleTheme: "Cambiar tema claro u oscuro",
      language: "Idioma"
    },
    theme: {
      light: "Claro",
      dark: "Oscuro"
    },
    language: {
      es: "Espa\xF1ol",
      en: "English"
    },
    nav: {
      dashboard: "Inicio",
      projects: "Proyectos",
      testPlan: "Plan de pruebas",
      testCases: "Casos de prueba",
      planner: "Planificador",
      templates: "Plantillas",
      ai: "Motor de IA",
      admin: "Administraci\xF3n",
      profile: "Perfil"
    },
    projects: {
      title: "Proyectos",
      subtitle: "Cada proyecto es una carpeta con su plan de pruebas y sus casos.",
      new: "Nuevo proyecto",
      create: "Crear",
      exportAll: "Exportar todo",
      exporting: "Exportando\u2026",
      exportProject: "Exportar proyecto (ZIP)",
      exportedAllToast: "Exportados {{count}} archivos en {{path}}",
      exportedProjectToast: "\xAB{{name}}\xBB: {{count}} archivos exportados en {{path}}",
      pdfSkippedToast: "{{count}} PDF no se pudieron generar y no est\xE1n en el ZIP: {{names}}",
      exportBuilding: "Generando archivos\u2026 ({{done}}/{{total}})",
      exportZipping: "Comprimiendo el ZIP\u2026",
      exportFinishing: "Finalizando\u2026",
      empty: "A\xFAn no hay proyectos. Crea el primero.",
      namePlaceholder: "Nombre del proyecto",
      prefixMeta: "IDs",
      back: "Proyectos",
      name: "Nombre del proyecto",
      caseIdPrefix: "Prefijo de ID de caso",
      caseIdDigits: "D\xEDgitos del n\xFAmero",
      prefixHint: "Los casos se numerar\xE1n as\xED:",
      save: "Guardar",
      saving: "Guardando\u2026",
      tab: {
        plan: "Plan de pruebas",
        cases: "Casos de prueba",
        settings: "Ajustes",
        planner: "Planificador",
        traceability: "Trazabilidad"
      },
      deleteTitle: "Eliminar proyecto",
      deleteWarning: "Se eliminar\xE1 \xAB{{name}}\xBB y TODO su contenido: el plan de pruebas, los casos de prueba y el planificador. Esta acci\xF3n no se puede deshacer f\xE1cilmente.",
      deleteConfirm: "S\xED, eliminar todo",
      savedToast: "Ajustes actualizados"
    },
    profile: {
      title: "Perfil",
      subtitle: "Tu alias y tu nombre oficial (usado en los documentos).",
      displayName: "Alias (nombre para mostrar)",
      firstName: "Nombre",
      lastName: "Apellidos",
      save: "Guardar",
      saving: "Guardando\u2026",
      saved: "Guardado",
      error: "No se pudo guardar",
      auditTitle: "Auditor\xEDa",
      createdAt: "Creado",
      updatedAt: "Actualizado",
      revision: "Revisi\xF3n"
    },
    testPlan: {
      title: "Planes de prueba",
      subtitle: "Crea, edita y versiona tus planes de prueba.",
      new: "Nuevo plan",
      empty: "A\xFAn no hay planes. Crea el primero.",
      delete: "Eliminar",
      defaultTitle: "Nuevo plan de pruebas",
      newTitle: "Nuevo plan",
      editTitle: "Editar plan",
      back: "Volver",
      revShort: "rev.",
      fieldTitle: "T\xEDtulo",
      version: "Versi\xF3n",
      date: "Fecha",
      status: "Estado",
      summary: "Resumen (introducci\xF3n)",
      purpose: "Prop\xF3sito",
      conclusion: "Conclusi\xF3n",
      save: "Guardar",
      exportXlsx: "Exportar .xlsx",
      exportPdf: "Exportar .pdf",
      pdfKind: "Plan de Pruebas",
      rangeCol: "Rango",
      import: {
        button: "Importar .xlsx",
        title: "Importar plan desde .xlsx",
        applied: "Plan importado. Revisa y guarda para confirmar.",
        error: "No se pudo leer el archivo. Prueba con un .xlsx sin comentarios de celda."
      },
      exportedToast: "Plan exportado: \xAB{{name}}\xBB",
      saving: "Guardando\u2026",
      author: "Elaborado por",
      scopeIn: "Elementos dentro del alcance",
      scopeOut: "Fuera del alcance",
      methodology: "Metodolog\xEDa",
      agile: "\xC1gil",
      traditional: "Tradicional / V-model",
      sprintWeeks: "Duraci\xF3n de sprint (semanas)",
      ceremonies: "Reuniones del equipo",
      phases: "Fases",
      environmentConfig: "Configuraci\xF3n del entorno",
      environmentRequirements: "Requisitos de hardware y software",
      tools: "Herramientas",
      automationStrategy: "Estrategia de automatizaci\xF3n",
      suggestRisks: "\u2728 Sugerir riesgos con IA",
      testDataManagement: "Gesti\xF3n de datos de prueba",
      defectManagement: "Gesti\xF3n de defectos",
      roleCol: "Rol",
      responsibilityCol: "Responsabilidad",
      sprints: "Sprints",
      milestones: "Hitos",
      sprintName: "Nombre del sprint",
      milestoneName: "Hito",
      riskCol: "Riesgo",
      mitigationCol: "Mitigaci\xF3n",
      communicationPlan: "Plan de comunicaci\xF3n",
      criterionCol: "Criterio",
      metricCol: "M\xE9trica",
      purposeHint: "En una versi\xF3n futura se generar\xE1 autom\xE1ticamente con IA.",
      addItem: "A\xF1adir",
      removeItem: "Quitar",
      addRow: "A\xF1adir fila",
      other: "Otro",
      otherPlaceholder: "Especifica otro\u2026",
      steps: "Pasos",
      prev: "Anterior",
      next: "Siguiente",
      addSprintFromRange: "A\xF1adir sprint del rango",
      revisions: "Revisiones",
      noRevisions: "Sin revisiones anteriores.",
      step: {
        title: "T\xEDtulo",
        meta: "Versi\xF3n, fecha y autor",
        summary: "Resumen",
        scope: "Alcance",
        types: "Tipos de prueba",
        methodology: "Metodolog\xEDa",
        levels: "Niveles de prueba",
        deliverables: "Entregables",
        environment: "Entorno de pruebas",
        tools: "Herramientas y automatizaci\xF3n",
        testData: "Datos de prueba",
        defects: "Gesti\xF3n de defectos",
        roles: "Roles y responsabilidades",
        schedule: "Cronograma",
        risks: "Riesgos y mitigaci\xF3n",
        communication: "Plan de comunicaci\xF3n",
        closure: "Criterios de cierre",
        purpose: "Prop\xF3sito",
        conclusion: "Conclusi\xF3n"
      },
      typeGroup: {
        functional: "Cobertura funcional",
        nonFunctional: "Cobertura no funcional"
      },
      typeLabel: {
        functional: "Funcionales",
        performance: "Rendimiento",
        load: "Carga",
        stress: "Estr\xE9s",
        security: "Seguridad",
        usability: "Usabilidad",
        compatibility: "Compatibilidad",
        accessibility: "Accesibilidad",
        regression: "Regresi\xF3n",
        smoke: "Humo",
        sanity: "Sanidad",
        exploratory: "Exploratorias",
        uat: "UAT (aceptaci\xF3n de usuario)"
      },
      levelLabel: {
        unit: "Unitarias",
        integration: "Integraci\xF3n",
        system: "Sistema",
        acceptance: "Aceptaci\xF3n"
      },
      toolLabel: {
        selenium: "Selenium",
        playwright: "Playwright",
        cypress: "Cypress",
        appium: "Appium",
        postman: "Postman",
        jmeter: "JMeter",
        jira: "JIRA"
      },
      frequencyFor: "Frecuencia de {{ceremony}}",
      frequencyLabel: {
        daily: "a diario",
        twiceWeekly: "dos veces por semana",
        weekly: "semanal",
        biweekly: "cada dos semanas",
        perSprint: "una vez por sprint",
        monthly: "mensual"
      },
      ceremonyLabel: {
        daily: "Diaria",
        review: "Revisi\xF3n",
        retrospective: "Retrospectiva",
        planning: "Planificaci\xF3n"
      },
      deliverableLabel: {
        testPlan: "Documento de plan de pruebas",
        testCasesScripts: "Casos y scripts de prueba",
        statusReports: "Informes de estado",
        summaryReports: "Informes de resumen/finalizaci\xF3n",
        defectReports: "Informes de defectos",
        uatSignoff: "Sign-off de UAT",
        testData: "Datos de prueba",
        incidentReports: "Informes de incidentes"
      },
      roleName: {
        testManager: "Responsable de Pruebas",
        tester: "Analista de Pruebas / Tester",
        automation: "Automation Engineer",
        productOwner: "Product Owner"
      },
      statusLabel: {
        draft: "Borrador",
        reviewed: "Revisado",
        approved: "Aprobado",
        obsolete: "Obsoleto"
      },
      sprintDateError: "La fecha de fin es anterior a la de inicio.",
      sprintOverlap: "Este sprint se solapa con otro.",
      restore: "Restaurar",
      restoreConfirm: "\xBFRestaurar el contenido de esta revisi\xF3n? Reemplazar\xE1 lo que tienes ahora sin guardar.",
      discardConfirm: "Tienes cambios sin guardar. \xBFSalir y descartarlos?",
      closureDefault: {
        executed: "% de casos ejecutados",
        executedMetric: "\u2265 95%",
        defects: "Defectos cr\xEDticos abiertos",
        defectsMetric: "0",
        coverage: "Cobertura de requisitos",
        coverageMetric: "\u2265 90%"
      },
      savedToast: "Plan de pruebas guardado"
    },
    testCase: {
      title: "Casos de prueba",
      subtitle: "Crea casos con vistas Editor y Gherkin sincronizadas.",
      new: "Nuevo caso",
      empty: "A\xFAn no hay casos. Crea el primero.",
      defaultTitle: "Nuevo caso de prueba",
      newTitle: "Nuevo caso",
      editTitle: "Editar caso",
      back: "Volver",
      save: "Guardar",
      saving: "Guardando\u2026",
      revShort: "rev.",
      revisions: "Revisiones",
      noRevisions: "Sin revisiones anteriores.",
      exportFeature: "Exportar .feature",
      exportXlsx: "Exportar .xlsx",
      exportPdf: "Exportar .pdf",
      pdfKind: "Caso de Prueba",
      author: "Elaborado por",
      caseDate: "Fecha",
      import: {
        button: "Importar .xlsx",
        title: "Importar caso desde .xlsx"
      },
      suggestPreconditions: "\u2728 Sugerir precondiciones",
      suggest: {
        button: "\u2728 Sugerir pruebas",
        disabled: "Necesitas IA configurada y un plan en el proyecto",
        title: "Sugerir pruebas con IA",
        loading: "Generando sugerencias a partir del plan\u2026",
        empty: "No se generaron sugerencias. Revisa que el plan tenga tipos/niveles y que la IA responda.",
        create: "Crear {{count}}",
        creating: "Creando\u2026"
      },
      exportDone: "Guardado en {{name}}",
      keywords: "Palabras clave de Gherkin",
      insertKeyword: "Insertar en el cursor",
      scenarioId: "ID de escenario",
      scenarioIdAuto: "Auto (ATS_001)",
      scenarioIdFixed: "El ID no cambia una vez asignado: viaja como tag @ATS_001 en la automatizaci\xF3n.",
      priority: "Prioridad",
      status: "Estado",
      version: "Versi\xF3n",
      fieldTitle: "T\xEDtulo",
      mappedUseCase: "Caso de uso mapeado",
      traceability: "Trazabilidad (requisito / historia)",
      description: "Descripci\xF3n",
      preconditions: "Precondiciones",
      steps: "Pasos de prueba",
      addStep: "A\xF1adir paso",
      dragStep: "Arrastrar para reordenar",
      expectedResult: "Resultado esperado",
      postconditions: "Postcondiciones",
      acceptanceCriteria: "Criterios de aceptaci\xF3n",
      testData: "Datos de prueba",
      notes: "Notas",
      tab: {
        editor: "Editor",
        gherkin: "Gherkin",
        split: "Vista dividida"
      },
      level: {
        label: "Nivel",
        locked: "El c\xF3digo Gherkin requiere al menos \xAB{{level}}\xBB; no puedes bajar de ah\xED.",
        pickTitle: "Elige el tipo de escenario",
        pickSubtitle: "Determina qu\xE9 palabras clave de Gherkin y qu\xE9 formulario usar\xE1s. Podr\xE1s cambiarlo luego.",
        basic: {
          name: "B\xE1sico",
          keywords: "Feature \xB7 Scenario \xB7 Given / When / Then",
          desc: "Un escenario simple. Ideal para un caso concreto con un solo flujo."
        },
        outline: {
          name: "B\xE1sico avanzado",
          keywords: "Scenario Outline \xB7 Examples",
          desc: "Un escenario parametrizado con una tabla de datos. Cada fila es una variante (partici\xF3n de equivalencia)."
        },
        advanced: {
          name: "Avanzado",
          keywords: "Background \xB7 Rule \xB7 varios Scenario",
          desc: "Un Feature completo con varios escenarios. Se escribe directamente en el editor Gherkin."
        },
        includes: "Incluye"
      },
      examples: {
        title: "Examples (tabla de datos)",
        hint: "Cada columna es un <placeholder> que puedes usar en los pasos; cada fila es una ejecuci\xF3n.",
        emptyHint: "A\xFAn no hay columnas. A\xF1ade la primera para empezar la tabla.",
        columnName: "nombre_columna",
        addColumn: "+ Columna",
        addRow: "+ Fila",
        removeColumn: "Quitar columna",
        removeRow: "Quitar fila",
        placeholders: "Placeholders detectados en los pasos",
        orphanColumns: "Columnas sin placeholder en los pasos: {{cols}}",
        columnN: "Columna {{n}}",
        actions: "Acciones"
      },
      derived: {
        examples: "Examples",
        comments: "Comentarios"
      },
      outline: {
        title: "Estructura del Feature",
        hint: "En el nivel Avanzado, el comportamiento se edita en la pesta\xF1a Gherkin. Aqu\xED ves un resumen.",
        none: "A\xFAn no hay escenarios. Escr\xEDbelos en la pesta\xF1a Gherkin.",
        unnamed: "(sin nombre)"
      },
      priorityLabel: {
        low: "Baja",
        medium: "Media",
        high: "Alta",
        critical: "Cr\xEDtica"
      },
      statusLabel: {
        draft: "Borrador",
        reviewed: "Revisado",
        approved: "Aprobado",
        obsolete: "Obsoleto"
      },
      flow: {
        mainName: "Flujo principal",
        altName: "Flujo alterno",
        main: "Principal",
        alt: "Alterno",
        background: "Precondiciones compartidas (Background)",
        backgroundHint: "Se aplican a todos los flujos. Se traducen a Background en Gherkin.",
        namePlaceholder: "Nombre del flujo (ej. Cup\xF3n expirado)",
        preconditions: "Precondiciones del flujo",
        steps: "Pasos",
        expected: "Resultado esperado",
        examples: "Examples (opcional)",
        examplesHint: "Si el flujo se ejecuta con varias filas de datos, a\xF1ade columnas y filas.",
        add: "A\xF1adir flujo alterno",
        remove: "Quitar flujo",
        altUpper: "FLUJO ALTERNO"
      },
      savedToast: "Caso de prueba guardado",
      otherReferences: "Otras referencias (texto libre)",
      requirements: {
        label: "Requisitos vinculados",
        unknown: "Requisito desconocido",
        remove: "Quitar {{key}}",
        none: "Este proyecto a\xFAn no tiene requisitos (pesta\xF1a Trazabilidad).",
        add: "Vincular un requisito\u2026"
      },
      exportFeatures: "Exportar .feature (todos)",
      exportFeaturesToast: "{{count}} archivos .feature exportados en {{path}}",
      exportProvisionalToast: "{{count}} caso(s) a\xFAn tienen una clave provisional: sus archivos van sin tag de ID. Sincroniza y vuelve a exportar.",
      aiPendingCase: "Caso generado por IA",
      stepN: "Paso {{n}}",
      drag: {
        help: "Para reordenar un paso, pulsa Espacio o Intro en su asa, mu\xE9velo con las flechas arriba y abajo, y pulsa Espacio o Intro para soltarlo. Escape cancela.",
        start: "Paso {{n}} seleccionado para mover.",
        over: "Paso {{n}} sobre la posici\xF3n {{to}}.",
        end: "Paso {{n}} movido a la posici\xF3n {{to}}.",
        cancel: "Movimiento cancelado; el paso {{n}} vuelve a su sitio."
      },
      gherkinEditor: "Editor Gherkin",
      gherkinKeys: "Tab sangra. Para salir del editor con el teclado, pulsa Escape y despu\xE9s Tab."
    },
    dashboard: {
      title: "Bienvenido a Pharos",
      greeting: "Hola, {{name}}",
      subtitle: "El faro que gu\xEDa tus proyectos de pruebas a puerto seguro.",
      newProject: "Iniciar nuevo proyecto de pruebas",
      newProjectDesc: "Crea el proyecto y redacta su plan con el asistente.",
      continue: "Continuar proyecto existente",
      continueDesc: "Busca un proyecto en la lista y ret\xF3malo donde lo dejaste.",
      projectsTitle: "Tus proyectos",
      searchLabel: "Buscar proyecto",
      searchPlaceholder: "Buscar por nombre\u2026",
      empty: "A\xFAn no tienes proyectos. Empieza con \xABIniciar nuevo proyecto de pruebas\xBB.",
      noMatch: "Ning\xFAn proyecto coincide con \xAB{{query}}\xBB.",
      lastAccess: "\xDAltimo acceso: {{date}}",
      neverOpened: "Sin abrir en este equipo \xB7 actualizado {{date}}",
      noPlan: "Sin plan",
      progressLabel: "Progreso de {{name}}",
      progress: "{{approved}} de {{total}} casos aprobados",
      noCases: "Sin casos todav\xEDa"
    },
    section: {
      comingInPhase: "Se implementar\xE1 en la Fase {{phase}}",
      emptyBody: "Esta secci\xF3n todav\xEDa no tiene contenido. Forma parte del alcance de una fase posterior del plan de implementaci\xF3n."
    },
    page: {
      projects: {
        title: "Proyectos",
        subtitle: "Inicia un nuevo proyecto de pruebas o contin\xFAa uno existente."
      },
      testPlan: {
        title: "Plan de pruebas",
        subtitle: "Asistente de 21 pasos conforme a ISO/IEC/IEEE 29119."
      },
      testCases: {
        title: "Casos de prueba",
        subtitle: "Editor de plantilla y vista Gherkin sincronizados en tiempo real."
      },
      planner: {
        title: "Planificador",
        subtitle: "Tablero kanban local para tareas, datos de prueba y defectos."
      },
      templates: {
        title: "Plantillas",
        subtitle: "Espacio de plantillas y exportaci\xF3n a .xlsx y .pdf."
      },
      ai: {
        title: "Motor de IA",
        subtitle: "Asistencia en l\xEDnea con Gemini y sin conexi\xF3n con Ollama."
      },
      admin: {
        title: "Administraci\xF3n",
        subtitle: "Plantillas, motor de IA y perfiles de prueba."
      }
    },
    planner: {
      column: {
        backlog: "Backlog",
        in_progress: "En progreso",
        in_review: "En revisi\xF3n",
        done: "Hecho"
      },
      newCard: "Nueva tarjeta",
      editCard: "Editar tarjeta",
      back: "Volver",
      save: "Guardar",
      saving: "Guardando\u2026",
      kind: "Tipo",
      cardTitle: "T\xEDtulo",
      description: "Descripci\xF3n",
      priority: "Prioridad",
      labels: "Etiquetas",
      attachments: "Adjuntos",
      attachAfterSave: "Guarda la tarjeta para poder a\xF1adir adjuntos.",
      attachTooLarge: "\xAB{{name}}\xBB supera el l\xEDmite de 10 MB.",
      kindLabel: {
        task: "Tarea",
        defect: "Defecto",
        test_data: "Datos de prueba"
      },
      priorityLabel: {
        low: "Baja",
        medium: "Media",
        high: "Alta",
        critical: "Cr\xEDtica"
      },
      savedToast: "Tarjeta guardada",
      linkedCases: "Casos de prueba vinculados",
      noCasesToLink: "Este proyecto a\xFAn no tiene casos de prueba.",
      drag: {
        handle: "Mover la tarjeta \xAB{{card}}\xBB",
        help: "Para mover una tarjeta, pulsa Espacio o Intro en su asa, mu\xE9vela con las flechas (arriba y abajo en la columna, izquierda y derecha entre columnas) y pulsa Espacio o Intro para soltarla. Escape cancela.",
        start: "Tarjeta \xAB{{card}}\xBB seleccionada para mover.",
        over: "Tarjeta \xAB{{card}}\xBB sobre la columna {{column}}.",
        end: "Tarjeta \xAB{{card}}\xBB movida a {{column}}.",
        cancel: "Movimiento cancelado; la tarjeta \xAB{{card}}\xBB vuelve a su sitio."
      }
    },
    traceability: {
      title: "Trazabilidad",
      priorityLabel: {
        low: "Baja",
        medium: "Media",
        high: "Alta"
      },
      generate: {
        button: "Generar casos con IA desde {{key}}",
        title: "Generar casos desde {{key}}",
        intro: "La IA propondr\xE1 escenarios Gherkin y casos de prueba para este requisito. Los revisas y solo se crean los que aceptes, como borradores vinculados al requisito y marcados \xABIA \xB7 pendiente de revisi\xF3n\xBB.",
        run: "Generar",
        loading: "Generando escenarios a partir del requisito\u2026",
        retry: "Reintentar",
        gherkin: "Ver Gherkin",
        accept_one: "Crear 1 caso",
        accept_other: "Crear {{count}} casos",
        creating: "Creando\u2026",
        doneToast_one: "1 caso creado y vinculado a {{key}}",
        doneToast_other: "{{count}} casos creados y vinculados a {{key}}",
        saveFailed_one: "No se pudo guardar 1 caso. Sigue seleccionado: vuelve a crearlo o cancela.",
        saveFailed_other: "No se pudieron guardar {{count}} casos. Siguen seleccionados: vuelve a crearlos o cancela."
      },
      requirement: {
        listTitle: "Requisitos",
        listSubtitle: "La base de pruebas del proyecto. Cada requisito tiene un ID estable que los casos enlazan y que viaja como tag @REQ-xxx en el .feature.",
        new: "Nuevo requisito",
        newTitle: "Nuevo requisito",
        editTitle: "Editar requisito",
        empty: "A\xFAn no hay requisitos. Crea uno o importa un CSV.",
        key: "ID de requisito",
        keyAuto: "Autom\xE1tico (REQ-001\u2026)",
        keyHint: "D\xE9jalo vac\xEDo para numerarlo solo. No se puede cambiar despu\xE9s.",
        keyLocked: "El ID es estable y no se puede cambiar.",
        keyInvalid: "Solo letras, n\xFAmeros y - _ . : (sin espacios).",
        keyDuplicate: "Ya existe un requisito con este ID.",
        title: "T\xEDtulo",
        description: "Descripci\xF3n",
        priority: "Prioridad",
        save: "Guardar",
        saving: "Guardando\u2026",
        savedToast: "Requisito guardado",
        saveError: "No se pudo guardar el requisito",
        delete: "Eliminar {{key}}",
        deleteTitle: "Eliminar requisito",
        deleteWarning: "Se eliminar\xE1 {{key}}. Su ID no se reutilizar\xE1: los casos que lo enlazan lo mostrar\xE1n como requisito desconocido.",
        deleteConfirm: "Eliminar",
        deletedToast: "{{key}} eliminado"
      },
      import: {
        button: "Importar CSV",
        title: "Importar requisitos desde CSV",
        noTitleColumn: "No se encontr\xF3 una columna de t\xEDtulo (T\xEDtulo, Requisito, Descripci\xF3n\u2026).",
        columns: "Columnas detectadas",
        column: {
          requirementKey: "ID",
          title: "T\xEDtulo",
          description: "Descripci\xF3n",
          priority: "Prioridad"
        },
        more: "\u2026y {{count}} filas m\xE1s",
        summary: "Se crear\xE1n {{creates}} requisitos y se actualizar\xE1n {{updates}} con el mismo ID.",
        issue: {
          noTitle: "L\xEDnea {{line}}: sin t\xEDtulo, se omite.",
          invalidKey: "L\xEDnea {{line}}: el ID \xAB{{value}}\xBB no es v\xE1lido como tag, se omite.",
          duplicateKey: "L\xEDnea {{line}}: el ID \xAB{{value}}\xBB se repite en el archivo, se omite."
        },
        confirm: "Importar {{count}}",
        importing: "Importando\u2026",
        doneToast: "Importados: {{created}} nuevos, {{updated}} actualizados",
        skippedToast: "No importados (son de requisitos borrados y no se reutilizan): {{keys}}",
        error: "No se pudo importar el CSV",
        preview: "Vista previa de los requisitos",
        skipped: "Filas que se omitir\xE1n ({{count}})"
      },
      view: {
        requirements: "Requisitos",
        matrix: "Matriz"
      },
      matrix: {
        title: "Matriz de trazabilidad",
        subtitle: "Requisito \u2194 caso de prueba \u2194 defecto, con los huecos de cobertura a la vista.",
        exportXlsx: "Exportar .xlsx",
        exporting: "Exportando\u2026",
        exportedToast: "Matriz exportada: {{name}}",
        total: "Requisitos",
        covered: "Cubiertos",
        uncovered: "Sin cubrir",
        coverage: "Cobertura",
        onlyGaps: "Mostrar solo huecos",
        empty: "A\xFAn no hay requisitos. Cr\xE9alos en la vista Requisitos.",
        col: {
          requirement: "ID requisito",
          requirementTitle: "Requisito",
          priority: "Prioridad",
          case: "ID caso",
          caseTitle: "Caso de prueba",
          execution: "Estado de prueba",
          defects: "Defectos",
          coverage: "Cobertura",
          notes: "Comentarios"
        }
      },
      execution: {
        passed: "Pasa",
        failed: "Falla",
        blocked: "Bloqueado",
        not_run: "No ejecutado"
      },
      coverage: {
        covered: "Cubierto",
        not_covered: "No cubierto"
      },
      note: {
        obsoleteCase: "Caso obsoleto (no cubre)",
        openDefect: "Defecto abierto"
      },
      gaps: {
        title: "Huecos de trazabilidad",
        casesWithoutRequirement: "Casos sin requisito",
        unknownLinks: "Casos que enlazan un requisito inexistente",
        defectsWithoutCase: "Defectos sin caso vinculado"
      },
      migrate: {
        button: "Migrar trazabilidad ({{count}})",
        title: "Migrar el campo Trazabilidad a v\xEDnculos",
        intro: "Estos IDs aparecen en el texto libre de Trazabilidad de tus casos. Elige cu\xE1les convertir en v\xEDnculos con requisitos. El texto libre se conserva.",
        include: "Incluir",
        found: "Encontrado",
        willCreate: "se crear\xE1",
        summary: "Se crear\xE1n {{links}} v\xEDnculos y {{creates}} requisitos nuevos.",
        apply: "Aplicar",
        applying: "Aplicando\u2026",
        doneToast: "Migraci\xF3n aplicada: {{links}} v\xEDnculos, {{creates}} requisitos nuevos"
      }
    },
    downloads: {
      saved: "Guardado en {{path}}",
      fallback: "No se pudo usar tu carpeta de descarga (no existe o no se puede escribir en ella). Se guard\xF3 en Descargas: {{path}}",
      failed: "No se pudo guardar \xAB{{name}}\xBB: {{reason}}",
      pdfFailed: "No se pudo generar el PDF \xAB{{name}}\xBB: {{reason}}"
    },
    diagnostics: {
      export: "Exportar diagn\xF3stico",
      exporting: "Exportando\u2026",
      exported: "Diagn\xF3stico guardado en {{file}}",
      failed: "No se pudo exportar el diagn\xF3stico."
    },
    errorBoundary: {
      title: "Algo sali\xF3 mal",
      message: "Esta vista ha fallado. Tus datos no se han perdido: puedes reintentar, recargar la aplicaci\xF3n o exportar un diagn\xF3stico para informar del fallo.",
      retry: "Reintentar",
      reload: "Recargar",
      details: "Detalles t\xE9cnicos"
    },
    recoveryKey: {
      title: "Clave de recuperaci\xF3n",
      intro: "La base de datos local est\xE1 cifrada y su clave vive solo en el almac\xE9n de credenciales de este equipo. Si lo pierdes (PC nuevo, Windows reinstalado), solo la clave de recuperaci\xF3n junto con tu copia de pharos.db.enc devuelve tus datos.",
      lastShown: "Mostrada por \xFAltima vez: {{date}}",
      desktopOnly: "Disponible solo en la app de escritorio.",
      show: "Mostrar clave de recuperaci\xF3n",
      failed: "No se pudo leer la clave de recuperaci\xF3n.",
      confirmTitle: "\xBFMostrar la clave de recuperaci\xF3n?",
      confirmBody: "Quien tenga esta clave y una copia de tus datos puede leerlos. Mu\xE9strala solo cuando nadie mire tu pantalla.",
      confirm: "Mostrar",
      shownTitle: "Guarda esta clave ahora",
      guidePaper: "Escr\xEDbela en papel y gu\xE1rdala en un lugar seguro, o",
      guideManager: "gu\xE1rdala en un gestor de contrase\xF1as.",
      guideRisk: "No la env\xEDes por correo ni chat y no la guardes junto a la copia de tus datos.",
      guideBackup: "Para restaurar en otro equipo necesitas esta clave y una copia de pharos.db.enc (y de la carpeta evidence/ cuando exista). Pharos no puede recuperarla por ti.",
      copy: "Copiar al portapapeles",
      copied: "Copiada",
      copiedHint: "P\xE9gala en tu gestor de contrase\xF1as y despu\xE9s copia otra cosa para vaciar el portapapeles.",
      savedCheck: "Ya la he guardado en un lugar seguro",
      close: "Cerrar"
    },
    a11y: {
      skipToContent: "Saltar al contenido",
      close: "Cerrar",
      currentStep: "paso actual",
      row: "Fila {{n}}",
      mainNav: "Navegaci\xF3n principal",
      start: "Inicio",
      end: "Fin",
      date: "Fecha"
    },
    validation: {
      severity: {
        error: "Error",
        warning: "Aviso"
      },
      required: "Este campo es obligatorio.",
      number: "Escribe un n\xFAmero.",
      integer: "Escribe un n\xFAmero entero.",
      min: "El m\xEDnimo es {{min}}.",
      max: "El m\xE1ximo es {{max}}.",
      dateOrder: "La fecha de fin es anterior a la de inicio.",
      format: "Formato no v\xE1lido. Ejemplo: {{example}}.",
      duplicateRow: "Fila repetida: ya hay otra igual.",
      duplicateKey: "Ese ID ya existe.",
      summary: "No se puede guardar: revisa {{count}} campo(s).",
      savedWithWarnings: "Guardado con {{count}} aviso(s) por revisar."
    }
  };
  var en_default = {
    app: {
      name: "Pharos",
      tagline: "QA test management suite",
      version: "Version {{version}}"
    },
    dbError: {
      title: "The local database could not be opened",
      body: "Pharos has not modified any file. Close the app and try again; if it keeps happening, share this detail with support.",
      newerTitle: "This data comes from a newer version of Pharos",
      newerBody: "The local database was saved by a more recent version than this one. To avoid damaging it, Pharos neither opens nor modifies it. Install that version or a later one.",
      keyMissingTitle: "The local database key is missing",
      keyMismatchTitle: "The stored key does not open the local database",
      keyBody: "Your data is still encrypted on this computer, but its key is not in the system credential store (this happens on a new PC or after reinstalling Windows). Enter the recovery key you saved from Profile to open it. Pharos changes no file until the key is right.",
      recovery: {
        label: "Recovery key",
        hint: "56 characters in groups of 4. Case, spaces and hyphens do not matter.",
        submit: "Open with the key",
        opening: "Opening\u2026",
        invalid: "The key has a typo: check each group and try again.",
        wrong: "The key is valid, but it does not open this database: it is another key, or the file is damaged. Make sure it is the one for this computer; if it is, a pharos.db.enc.bak-\u2026 copy may open with it (README, Recovery key).",
        failed: "Could not open with the key: {{detail}}"
      }
    },
    common: {
      loading: "Loading\u2026",
      delete: "Delete",
      confirmDelete: "Yes, delete",
      cancel: "Cancel",
      noData: "No data",
      edit: "Edit",
      discardConfirm: "You have unsaved changes. Discard them?"
    },
    templates: {
      title: "Templates",
      subtitle: "Repository of plan and case templates. The PHAROS ones are included.",
      kind: {
        plan: "Test plans",
        case: "Test cases"
      },
      builtin: "Included",
      shared: "Shared",
      sharedHint: "Imported before accounts: every account on this device sees it and it is read-only. To edit it, download it and import it again.",
      download: "Download .xlsx",
      import: "Import template",
      importedToast: "Template imported: \u201C{{name}}\u201D",
      updatedToast: "Template updated",
      deleteTitle: "Delete template",
      deleteWarning: "Delete the template \u201C{{name}}\u201D? This cannot be undone.",
      form: {
        createTitle: "Import template",
        editTitle: "Edit template",
        name: "Name",
        kind: "Kind",
        language: "Language",
        version: "Version",
        description: "Description",
        usagePrompt: "Usage prompt (for the AI)",
        usagePromptHint: "Describe what it is for and when the AI should suggest it.",
        save: "Save"
      }
    },
    ai: {
      title: "AI assistant",
      subtitle: "Pick the online provider with your own key (Gemini, OpenAI, Claude, OpenRouter or a compatible endpoint) and the offline one (Ollama). The app works without AI.",
      test: "Test connection",
      testing: "Testing\u2026",
      mode: "Mode",
      modeOption: {
        auto: "Automatic",
        online: "Online",
        offline: "Offline"
      },
      using: "Using",
      provider: {
        offline: "Ollama (offline)",
        none: "None"
      },
      onlineProvider: "Provider",
      providerHint: {
        gemini: "Google's Gemini models.",
        openai: "OpenAI's GPT models.",
        anthropic: "Anthropic's Claude models.",
        openrouter: "One key for models from many providers.",
        custom: "Any service compatible with the OpenAI API: Groq, DeepSeek, Mistral, Together, or a local server such as LM Studio or vLLM."
      },
      keyWhere: "Get your key at",
      baseUrl: "Base URL",
      baseUrlHint: "E.g. https://api.groq.com/openai/v1 or http://localhost:1234/v1 (LM Studio). Must be https; http is only allowed for localhost.",
      endpointStatus: "Endpoint",
      endpointSet: "Configured",
      endpointNotSet: "Base URL missing",
      keyOptional: "API key (optional)",
      tab: {
        online: "Online AI",
        offline: "Offline AI"
      },
      keyStatus: "API key",
      keyConfigured: "Configured",
      keyNotSet: "Not set",
      keyPlaceholder: "Paste your {{provider}} API key",
      saveKey: "Save key",
      clearKey: "Clear key",
      keySaved: "Key saved to the keychain",
      keyCleared: "Key removed",
      model: "Model",
      modelPlaceholder: "Type a model or press \u201CList models\u201D",
      listModels: "List models",
      listingModels: "Checking\u2026",
      modelsFound: "{{count}} models available: pick one in the Model field",
      modelsNone: "The provider returned no models",
      modelsFailed: "Could not list models: {{error}}",
      temperature: "Temperature",
      temperatureIgnored: "Claude's API does not accept a temperature setting, so this value is not sent.",
      ollamaStatus: "Ollama",
      ollamaOffline: "Not detected (is it running?)",
      modelInstalled: "Model installed",
      modelMissing: "Model missing",
      endpoint: "Endpoint",
      downloadModel: "Download \u201C{{model}}\u201D",
      refresh: "Refresh status",
      dontClose: "Don't close the app while the model downloads. If it closes, the download resumes when you reopen it (progress is not lost).",
      modelReady: "Model downloaded and ready",
      ollamaError: "Could not reach Ollama",
      testPrompt: "Reply only with: OK",
      testOk: "Connection OK",
      testEmpty: "The provider returned an empty reply",
      testNoProvider: "No AI available: configure an online provider (key and model) or Ollama",
      testFailedWith: "AI connection failed: {{error}}",
      neverBlocks: "Missing AI never blocks the app: assist buttons are disabled with a notice.",
      assist: {
        button: "\u2728 Assist with AI",
        drafting: "Drafting\u2026",
        previewTitle: "AI draft",
        use: "Use",
        discard: "Discard",
        unavailable: "Configure AI (an online provider or Ollama) to use this",
        empty: "The AI returned no text.",
        error: "Could not draft with AI"
      },
      structured: {
        thinking: "Thinking\u2026",
        proposals: "AI proposals",
        addSelected: "Add {{count}}",
        nothingApplied: "Nothing was applied.",
        error: {
          empty: "The AI replied with nothing.",
          refusal: "The AI made no proposals.",
          "invalid-json": "The AI's answer is not valid JSON.",
          "invalid-schema": "The AI's answer does not have the expected format.",
          "no-provider": "No AI available: set up an online provider or Ollama.",
          timeout: "The AI did not answer in time.",
          provider: "The AI provider returned an error."
        }
      },
      provenance: {
        pending: "AI \xB7 pending review",
        short: "AI \xB7 not reviewed",
        markReviewed: "Mark reviewed",
        destination: "Will be sent to {{source}}",
        provider: {
          gemini: "Gemini",
          openai: "OpenAI",
          anthropic: "Claude",
          openrouter: "OpenRouter",
          custom: "OpenAI-compatible",
          ollama: "Ollama (local)"
        }
      }
    },
    sync: {
      synced: "Synced",
      pending: "Pending changes ({{count}})",
      offline: "Offline",
      now: "Sync now",
      syncing: "Syncing\u2026",
      doneToast: "Synced (\u2191{{pushed}} \xB7 \u2193{{pulled}})",
      needsAuth: "Sign in to sync",
      failed: "Could not sync (server unavailable?)",
      conflicts: "Conflicts ({{count}})",
      conflictToast: "Synced with {{count}} conflict(s) to review",
      unsupportedVersion: "This Pharos version is no longer supported by the server. Update the app to sync; your changes are kept.",
      webConflictToast: "Another device saved a newer version of {{count}} item(s). Your edit is kept: review it in Conflicts.",
      skippedToast: "The server refused {{count}} change(s) (too large or invalid). They stay pending; everything else synced.",
      orphans: "{{count}} change(s) without a known project yet; they will be sent once it arrives",
      web: {
        staleWrite: "This item was changed elsewhere since you opened it. Your edit is still in the form: save again to replace that version, or close without saving to keep it.",
        deletedElsewhere: "This item was deleted elsewhere since you opened it. Your edit is still in the form: copy what you need before closing it.",
        keyTaken: "That ID is already used by another item of the project. Choose another one or leave it empty to number it automatically.",
        keyRetired: "That ID belonged to a deleted item and is never reused. Choose another one or leave it empty.",
        invalidKey: "That ID is not valid. Use letters, digits and - _ . : only.",
        desktopOnly: "Only available in the desktop app for now.",
        legacyLeftovers: "{{count}} item(s) from an older web version could not be sent to the server. Download them from the notice at the top.",
        legacyNotice: "{{count}} item(s) from an older web version not sent",
        legacyDownload: "Download",
        legacyDiscard: "Discard",
        legacySaved: "I saved the file",
        legacyDiscardTitle: "Items from an older web version",
        legacyDiscardConfirm: "Discard the {{count}} item(s) without downloading them? They cannot be recovered.",
        legacySavedConfirm: "Remove the {{count}} item(s) from this browser? Check first that the downloaded file is in your downloads."
      },
      conflict: {
        review: "Review conflicts",
        title: "Sync conflicts",
        intro: "These items were edited on this computer and on another device since the last sync. Choose which version to keep; the other one is discarded.",
        onlyChanged: "Show only the fields that differ",
        empty: "No pending conflicts.",
        close: "Close",
        field: "Field",
        local: "My version (this computer)",
        remote: "Server version",
        state: "State",
        deleted: "Deleted",
        exists: "Exists",
        keepLocal: "Keep mine",
        keepRemote: "Use the server's",
        resolved: "Conflict resolved",
        failed: "Could not resolve the conflict",
        entity: {
          project: "Project",
          test_plan: "Test plan",
          test_case: "Test case",
          requirement: "Requirement",
          planner_card: "Planner card"
        },
        fields: {
          title: "Title",
          name: "Name",
          version: "Version",
          status: "Status",
          priority: "Priority",
          author: "Author",
          scenarioId: "Scenario ID",
          projectId: "Project",
          ownerId: "Owner",
          planDate: "Plan date",
          caseIdPrefix: "ID prefix",
          caseIdDigits: "ID digits",
          requirementKey: "Requirement key",
          cardKey: "Defect key",
          description: "Description",
          kind: "Kind",
          position: "Position"
        },
        key: {
          title: "Repeated keys",
          intro: "Another item of the project already has this key on the server. Until you pick another one, this item has a provisional key and does not sync. If a case linked the old key, review it.",
          lost: "Wanted {{key}}",
          current: "Now: {{key}}",
          placeholder: "New key",
          use: "Use this key",
          next: "Assign the next one",
          assigned: "Key assigned: {{key}}",
          noBlock: "Sync first to get new numbers, or type a key.",
          failed: "That key could not be used: {{reason}}"
        }
      }
    },
    admin: {
      title: "Administration",
      subtitle: "Templates, AI engine and application settings.",
      section: {
        templates: {
          title: "Templates",
          desc: "Repository of plan and case templates."
        },
        ai: {
          title: "AI engine",
          desc: "Online provider with your key (Gemini, OpenAI, Claude, OpenRouter\u2026) and offline (Ollama)."
        }
      },
      saved: "Settings saved",
      settings: {
        title: "Settings",
        background: "Custom background",
        bgChoose: "Choose image\u2026",
        bgClear: "Remove",
        opacity: "Background opacity",
        opacityHint: "Lower = more transparent. Affects only the background, not the content.",
        retention: "Retention of deleted items (days)",
        retentionHint: "What you delete is removed for good from this device after this many days. A deletion not yet synced waits for the next sync. The server has its own period and keeps a marker of what was deleted.",
        download: "Download folder",
        downloadCurrent: "Current folder",
        downloadDefault: "system Downloads",
        downloadChoose: "Choose folder\u2026",
        downloadReset: "Use Downloads",
        downloadError: "Could not read or change the download folder.",
        downloadMissing: "The chosen folder no longer exists; files go to Downloads until you choose another.",
        downloadHint: "Every export and the diagnostics bundle are saved here. A file is never overwritten: \u201C (2)\u201D is added.",
        downloadWebHint: "In the web preview the browser decides where downloads go. Choose the folder in the desktop app.",
        save: "Save settings"
      },
      diagnostics: {
        title: "Diagnostics",
        version: "Installed version",
        desc: "Creates a .zip to report a problem: app version, operating system, WebView2, applied migrations and the recent logs.",
        excludes: "It never includes your data: no projects, plans, cases or requirements, no profile, no database, keys, tokens or AI keys. Emails, tokens and paths with your user name are masked."
      }
    },
    importReport: {
      detecting: "Detecting\u2026 ({{done}}/{{total}})",
      doneMsg: "Detection complete. Review and apply.",
      rows: "{{count}} row(s)",
      notFound: "not detected",
      blank: "blank",
      apply: "Apply to form"
    },
    auth: {
      loginTitle: "Sign in",
      registerTitle: "Create account",
      email: "Email",
      password: "Password",
      displayName: "Alias (display name)",
      firstName: "First name",
      lastName: "Last name",
      login: "Sign in",
      register: "Sign up",
      toRegister: "No account? Sign up",
      toLogin: "Already have an account? Sign in",
      loggingIn: "Signing in\u2026",
      logout: "Sign out",
      offline: "Offline",
      error: {
        invalid_credentials: "Incorrect email or password.",
        email_in_use: "That email is already registered.",
        validation_error: "Please check the details you entered.",
        rate_limited: "Too many attempts. Wait a moment and try again.",
        network: "Could not reach the server.",
        generic: "Something went wrong. Please try again."
      }
    },
    topbar: {
      toggleTheme: "Toggle light or dark theme",
      language: "Language"
    },
    theme: {
      light: "Light",
      dark: "Dark"
    },
    language: {
      es: "Espa\xF1ol",
      en: "English"
    },
    nav: {
      dashboard: "Home",
      projects: "Projects",
      testPlan: "Test plan",
      testCases: "Test cases",
      planner: "Planner",
      templates: "Templates",
      ai: "AI engine",
      admin: "Administration",
      profile: "Profile"
    },
    projects: {
      title: "Projects",
      subtitle: "Each project is a folder with its test plan and its test cases.",
      new: "New project",
      create: "Create",
      exportAll: "Export all",
      exporting: "Exporting\u2026",
      exportProject: "Export project (ZIP)",
      exportedAllToast: "Exported {{count}} files to {{path}}",
      exportedProjectToast: "\u201C{{name}}\u201D: {{count}} files exported to {{path}}",
      pdfSkippedToast: "{{count}} PDFs could not be created and are not in the ZIP: {{names}}",
      exportBuilding: "Generating files\u2026 ({{done}}/{{total}})",
      exportZipping: "Compressing the ZIP\u2026",
      exportFinishing: "Finishing\u2026",
      empty: "No projects yet. Create the first one.",
      namePlaceholder: "Project name",
      prefixMeta: "IDs",
      back: "Projects",
      name: "Project name",
      caseIdPrefix: "Case id prefix",
      caseIdDigits: "Number digits",
      prefixHint: "Cases will be numbered like:",
      save: "Save",
      saving: "Saving\u2026",
      tab: {
        plan: "Test plan",
        cases: "Test cases",
        settings: "Settings",
        planner: "Planner",
        traceability: "Traceability"
      },
      deleteTitle: "Delete project",
      deleteWarning: "\u201C{{name}}\u201D and ALL its content will be deleted: the test plan, the test cases and the planner. This can't be easily undone.",
      deleteConfirm: "Yes, delete everything",
      savedToast: "Settings updated"
    },
    profile: {
      title: "Profile",
      subtitle: "Your alias and official name (used in documents).",
      displayName: "Alias (display name)",
      firstName: "First name",
      lastName: "Last name",
      save: "Save",
      saving: "Saving\u2026",
      saved: "Saved",
      error: "Could not save",
      auditTitle: "Audit",
      createdAt: "Created",
      updatedAt: "Updated",
      revision: "Revision"
    },
    testPlan: {
      title: "Test plans",
      subtitle: "Create, edit and version your test plans.",
      new: "New plan",
      empty: "No plans yet. Create the first one.",
      delete: "Delete",
      defaultTitle: "New test plan",
      newTitle: "New plan",
      editTitle: "Edit plan",
      back: "Back",
      revShort: "rev.",
      fieldTitle: "Title",
      version: "Version",
      date: "Date",
      status: "Status",
      summary: "Summary (introduction)",
      purpose: "Purpose",
      conclusion: "Conclusion",
      save: "Save",
      exportXlsx: "Export .xlsx",
      exportPdf: "Export .pdf",
      pdfKind: "Test Plan",
      rangeCol: "Range",
      import: {
        button: "Import .xlsx",
        title: "Import plan from .xlsx",
        applied: "Plan imported. Review and save to confirm.",
        error: "Could not read the file. Try a .xlsx without cell comments."
      },
      exportedToast: "Plan exported: \u201C{{name}}\u201D",
      saving: "Saving\u2026",
      author: "Prepared by",
      scopeIn: "In scope",
      scopeOut: "Out of scope",
      methodology: "Methodology",
      agile: "Agile",
      traditional: "Traditional / V-model",
      sprintWeeks: "Sprint length (weeks)",
      ceremonies: "Agile events",
      phases: "Phases",
      environmentConfig: "Environment configuration",
      environmentRequirements: "Hardware and software requirements",
      tools: "Tools",
      automationStrategy: "Automation strategy",
      suggestRisks: "\u2728 Suggest risks with AI",
      testDataManagement: "Test data management",
      defectManagement: "Defect management",
      roleCol: "Role",
      responsibilityCol: "Responsibility",
      sprints: "Sprints",
      milestones: "Milestones",
      sprintName: "Sprint name",
      milestoneName: "Milestone",
      riskCol: "Risk",
      mitigationCol: "Mitigation",
      communicationPlan: "Communication plan",
      criterionCol: "Criterion",
      metricCol: "Metric",
      purposeHint: "A future version will generate this automatically with AI.",
      addItem: "Add",
      removeItem: "Remove",
      addRow: "Add row",
      other: "Other",
      otherPlaceholder: "Specify other\u2026",
      steps: "Steps",
      prev: "Previous",
      next: "Next",
      addSprintFromRange: "Add sprint from range",
      revisions: "Revisions",
      noRevisions: "No previous revisions.",
      step: {
        title: "Title",
        meta: "Version, date and author",
        summary: "Summary",
        scope: "Scope",
        types: "Test types",
        methodology: "Methodology",
        levels: "Test levels",
        deliverables: "Deliverables",
        environment: "Test environment",
        tools: "Tools and automation",
        testData: "Test data",
        defects: "Defect management",
        roles: "Roles and responsibilities",
        schedule: "Schedule",
        risks: "Risks and mitigation",
        communication: "Communication plan",
        closure: "Closure criteria",
        purpose: "Purpose",
        conclusion: "Conclusion"
      },
      typeGroup: {
        functional: "Functional coverage",
        nonFunctional: "Non-functional coverage"
      },
      typeLabel: {
        functional: "Functional",
        performance: "Performance",
        load: "Load",
        stress: "Stress",
        security: "Security",
        usability: "Usability",
        compatibility: "Compatibility",
        accessibility: "Accessibility",
        regression: "Regression",
        smoke: "Smoke",
        sanity: "Sanity",
        exploratory: "Exploratory",
        uat: "UAT (user acceptance)"
      },
      levelLabel: {
        unit: "Unit",
        integration: "Integration",
        system: "System",
        acceptance: "Acceptance"
      },
      toolLabel: {
        selenium: "Selenium",
        playwright: "Playwright",
        cypress: "Cypress",
        appium: "Appium",
        postman: "Postman",
        jmeter: "JMeter",
        jira: "JIRA"
      },
      frequencyFor: "{{ceremony}} frequency",
      frequencyLabel: {
        daily: "every day",
        twiceWeekly: "twice a week",
        weekly: "weekly",
        biweekly: "every two weeks",
        perSprint: "once per sprint",
        monthly: "monthly"
      },
      ceremonyLabel: {
        daily: "Daily",
        review: "Review",
        retrospective: "Retrospective",
        planning: "Planning"
      },
      deliverableLabel: {
        testPlan: "Test plan document",
        testCasesScripts: "Test cases and scripts",
        statusReports: "Status reports",
        summaryReports: "Summary/completion reports",
        defectReports: "Defect reports",
        uatSignoff: "UAT sign-off",
        testData: "Test data",
        incidentReports: "Incident reports"
      },
      roleName: {
        testManager: "Test Manager",
        tester: "Test Analyst / Tester",
        automation: "Automation Engineer",
        productOwner: "Product Owner"
      },
      statusLabel: {
        draft: "Draft",
        reviewed: "Reviewed",
        approved: "Approved",
        obsolete: "Obsolete"
      },
      sprintDateError: "The end date is before the start date.",
      sprintOverlap: "This sprint overlaps another one.",
      restore: "Restore",
      restoreConfirm: "Restore this revision's content? It will replace what you have now, unsaved.",
      discardConfirm: "You have unsaved changes. Leave and discard them?",
      closureDefault: {
        executed: "% of cases executed",
        executedMetric: "\u2265 95%",
        defects: "Open critical defects",
        defectsMetric: "0",
        coverage: "Requirements coverage",
        coverageMetric: "\u2265 90%"
      },
      savedToast: "Test plan saved"
    },
    testCase: {
      title: "Test cases",
      subtitle: "Create cases with synced Editor and Gherkin views.",
      new: "New case",
      empty: "No cases yet. Create the first one.",
      defaultTitle: "New test case",
      newTitle: "New case",
      editTitle: "Edit case",
      back: "Back",
      save: "Save",
      saving: "Saving\u2026",
      revShort: "rev.",
      revisions: "Revisions",
      noRevisions: "No previous revisions.",
      exportFeature: "Export .feature",
      exportXlsx: "Export .xlsx",
      exportPdf: "Export .pdf",
      pdfKind: "Test Case",
      author: "Prepared by",
      caseDate: "Date",
      import: {
        button: "Import .xlsx",
        title: "Import case from .xlsx"
      },
      suggestPreconditions: "\u2728 Suggest preconditions",
      suggest: {
        button: "\u2728 Suggest tests",
        disabled: "You need AI configured and a plan in the project",
        title: "Suggest tests with AI",
        loading: "Generating suggestions from the plan\u2026",
        empty: "No suggestions were generated. Check the plan has types/levels and the AI responds.",
        create: "Create {{count}}",
        creating: "Creating\u2026"
      },
      exportDone: "Saved to {{name}}",
      keywords: "Gherkin keywords",
      insertKeyword: "Insert at cursor",
      scenarioId: "Scenario id",
      scenarioIdAuto: "Auto (ATS_001)",
      scenarioIdFixed: "The ID never changes once assigned: it travels as the @ATS_001 tag in automation.",
      priority: "Priority",
      status: "Status",
      version: "Version",
      fieldTitle: "Title",
      mappedUseCase: "Mapped use case",
      traceability: "Traceability (requirement / story)",
      description: "Description",
      preconditions: "Preconditions",
      steps: "Test steps",
      addStep: "Add step",
      dragStep: "Drag to reorder",
      expectedResult: "Expected result",
      postconditions: "Postconditions",
      acceptanceCriteria: "Acceptance criteria",
      testData: "Test data",
      notes: "Notes",
      tab: {
        editor: "Editor",
        gherkin: "Gherkin",
        split: "Split view"
      },
      level: {
        label: "Level",
        locked: "The Gherkin code needs at least \u201C{{level}}\u201D; you can't go below it.",
        pickTitle: "Choose the scenario type",
        pickSubtitle: "It determines which Gherkin keywords and which form you use. You can change it later.",
        basic: {
          name: "Basic",
          keywords: "Feature \xB7 Scenario \xB7 Given / When / Then",
          desc: "A single simple scenario. Ideal for one concrete case with a single flow."
        },
        outline: {
          name: "Basic advanced",
          keywords: "Scenario Outline \xB7 Examples",
          desc: "A parametrized scenario with a data table. Each row is a variant (equivalence partition)."
        },
        advanced: {
          name: "Advanced",
          keywords: "Background \xB7 Rule \xB7 multiple Scenario",
          desc: "A full Feature with several scenarios. Authored directly in the Gherkin editor."
        },
        includes: "Includes"
      },
      examples: {
        title: "Examples (data table)",
        hint: "Each column is a <placeholder> you can use in steps; each row is one run.",
        emptyHint: "No columns yet. Add the first one to start the table.",
        columnName: "column_name",
        addColumn: "+ Column",
        addRow: "+ Row",
        removeColumn: "Remove column",
        removeRow: "Remove row",
        placeholders: "Placeholders detected in the steps",
        orphanColumns: "Columns without a placeholder in the steps: {{cols}}",
        columnN: "Column {{n}}",
        actions: "Actions"
      },
      derived: {
        examples: "Examples",
        comments: "Comments"
      },
      outline: {
        title: "Feature structure",
        hint: "At the Advanced level the behavior is edited in the Gherkin tab. This is a summary.",
        none: "No scenarios yet. Write them in the Gherkin tab.",
        unnamed: "(unnamed)"
      },
      priorityLabel: {
        low: "Low",
        medium: "Medium",
        high: "High",
        critical: "Critical"
      },
      statusLabel: {
        draft: "Draft",
        reviewed: "Reviewed",
        approved: "Approved",
        obsolete: "Obsolete"
      },
      flow: {
        mainName: "Main flow",
        altName: "Alternative flow",
        main: "Main",
        alt: "Alt",
        background: "Shared preconditions (Background)",
        backgroundHint: "Apply to every flow. They become the Background in Gherkin.",
        namePlaceholder: "Flow name (e.g. Coupon expired)",
        preconditions: "Flow preconditions",
        steps: "Steps",
        expected: "Expected result",
        examples: "Examples (optional)",
        examplesHint: "If the flow runs with several data rows, add columns and rows.",
        add: "Add alternative flow",
        remove: "Remove flow",
        altUpper: "ALTERNATIVE FLOW"
      },
      savedToast: "Test case saved",
      otherReferences: "Other references (free text)",
      requirements: {
        label: "Linked requirements",
        unknown: "Unknown requirement",
        remove: "Remove {{key}}",
        none: "This project has no requirements yet (Traceability tab).",
        add: "Link a requirement\u2026"
      },
      exportFeatures: "Export .feature (all)",
      exportFeaturesToast: "{{count}} .feature files exported to {{path}}",
      exportProvisionalToast: "{{count}} case(s) still have a provisional key: their files have no ID tag yet. Sync and export again.",
      aiPendingCase: "AI-generated case",
      stepN: "Step {{n}}",
      drag: {
        help: "To reorder a step, press Space or Enter on its handle, move it with the up and down arrows, and press Space or Enter to drop it. Escape cancels.",
        start: "Picked up step {{n}}.",
        over: "Step {{n}} is over position {{to}}.",
        end: "Step {{n}} moved to position {{to}}.",
        cancel: "Move cancelled; step {{n}} is back in place."
      },
      gherkinEditor: "Gherkin editor",
      gherkinKeys: "Tab indents. To leave the editor from the keyboard, press Escape and then Tab."
    },
    dashboard: {
      title: "Welcome to Pharos",
      greeting: "Hello, {{name}}",
      subtitle: "The lighthouse that guides your testing projects safely to port.",
      newProject: "Start a new test project",
      newProjectDesc: "Create the project and write its plan with the wizard.",
      continue: "Continue an existing project",
      continueDesc: "Find a project in the list and pick it up where you left it.",
      projectsTitle: "Your projects",
      searchLabel: "Search projects",
      searchPlaceholder: "Search by name\u2026",
      empty: "You have no projects yet. Begin with \u201CStart a new test project\u201D.",
      noMatch: "No project matches \u201C{{query}}\u201D.",
      lastAccess: "Last opened: {{date}}",
      neverOpened: "Not opened on this device \xB7 updated {{date}}",
      noPlan: "No plan",
      progressLabel: "Progress of {{name}}",
      progress: "{{approved}} of {{total}} cases approved",
      noCases: "No cases yet"
    },
    section: {
      comingInPhase: "Coming in Phase {{phase}}",
      emptyBody: "This section has no content yet. It is part of the scope of a later phase of the implementation plan."
    },
    page: {
      projects: {
        title: "Projects",
        subtitle: "Start a new testing project or continue an existing one."
      },
      testPlan: {
        title: "Test plan",
        subtitle: "21-step wizard aligned with ISO/IEC/IEEE 29119."
      },
      testCases: {
        title: "Test cases",
        subtitle: "Template editor and Gherkin view synchronized in real time."
      },
      planner: {
        title: "Planner",
        subtitle: "Local kanban board for tasks, test data and defects."
      },
      templates: {
        title: "Templates",
        subtitle: "Template space and export to .xlsx and .pdf."
      },
      ai: {
        title: "AI engine",
        subtitle: "Online assistance with Gemini and offline with Ollama."
      },
      admin: {
        title: "Administration",
        subtitle: "Templates, AI engine and test profiles."
      }
    },
    planner: {
      column: {
        backlog: "Backlog",
        in_progress: "In progress",
        in_review: "In review",
        done: "Done"
      },
      newCard: "New card",
      editCard: "Edit card",
      back: "Back",
      save: "Save",
      saving: "Saving\u2026",
      kind: "Kind",
      cardTitle: "Title",
      description: "Description",
      priority: "Priority",
      labels: "Labels",
      attachments: "Attachments",
      attachAfterSave: "Save the card first to add attachments.",
      attachTooLarge: "\u201C{{name}}\u201D exceeds the 10 MB limit.",
      kindLabel: {
        task: "Task",
        defect: "Defect",
        test_data: "Test data"
      },
      priorityLabel: {
        low: "Low",
        medium: "Medium",
        high: "High",
        critical: "Critical"
      },
      savedToast: "Card saved",
      linkedCases: "Linked test cases",
      noCasesToLink: "This project has no test cases yet.",
      drag: {
        handle: "Move card \u201C{{card}}\u201D",
        help: "To move a card, press Space or Enter on its handle, move it with the arrows (up and down in a column, left and right between columns) and press Space or Enter to drop it. Escape cancels.",
        start: "Picked up card \u201C{{card}}\u201D.",
        over: "Card \u201C{{card}}\u201D is over the {{column}} column.",
        end: "Card \u201C{{card}}\u201D moved to {{column}}.",
        cancel: "Move cancelled; card \u201C{{card}}\u201D is back in place."
      }
    },
    traceability: {
      title: "Traceability",
      priorityLabel: {
        low: "Low",
        medium: "Medium",
        high: "High"
      },
      generate: {
        button: "Generate cases with AI from {{key}}",
        title: "Generate cases from {{key}}",
        intro: "The AI will propose Gherkin scenarios and test cases for this requirement. You review them and only the ones you accept are created, as drafts linked to the requirement and marked \u201CAI \xB7 pending review\u201D.",
        run: "Generate",
        loading: "Generating scenarios from the requirement\u2026",
        retry: "Retry",
        gherkin: "Show Gherkin",
        accept_one: "Create 1 case",
        accept_other: "Create {{count}} cases",
        creating: "Creating\u2026",
        doneToast_one: "1 case created and linked to {{key}}",
        doneToast_other: "{{count}} cases created and linked to {{key}}",
        saveFailed_one: "1 case could not be saved. It is still selected: create it again or cancel.",
        saveFailed_other: "{{count}} cases could not be saved. They are still selected: create them again or cancel."
      },
      requirement: {
        listTitle: "Requirements",
        listSubtitle: "The project test basis. Each requirement has a stable ID that cases link to and that travels as an @REQ-xxx tag in the .feature.",
        new: "New requirement",
        newTitle: "New requirement",
        editTitle: "Edit requirement",
        empty: "No requirements yet. Create one or import a CSV.",
        key: "Requirement ID",
        keyAuto: "Automatic (REQ-001\u2026)",
        keyHint: "Leave it empty to number it automatically. It cannot be changed later.",
        keyLocked: "The ID is stable and cannot be changed.",
        keyInvalid: "Only letters, digits and - _ . : (no spaces).",
        keyDuplicate: "A requirement with this ID already exists.",
        title: "Title",
        description: "Description",
        priority: "Priority",
        save: "Save",
        saving: "Saving\u2026",
        savedToast: "Requirement saved",
        saveError: "The requirement could not be saved",
        delete: "Delete {{key}}",
        deleteTitle: "Delete requirement",
        deleteWarning: "{{key}} will be deleted. Its ID will not be reused: cases linking it will show it as an unknown requirement.",
        deleteConfirm: "Delete",
        deletedToast: "{{key}} deleted"
      },
      import: {
        button: "Import CSV",
        title: "Import requirements from CSV",
        noTitleColumn: "No title column found (Title, Requirement, Description\u2026).",
        columns: "Detected columns",
        column: {
          requirementKey: "ID",
          title: "Title",
          description: "Description",
          priority: "Priority"
        },
        more: "\u2026and {{count}} more rows",
        summary: "{{creates}} requirements will be created and {{updates}} with the same ID updated.",
        issue: {
          noTitle: "Line {{line}}: no title, skipped.",
          invalidKey: "Line {{line}}: ID \u201C{{value}}\u201D is not valid as a tag, skipped.",
          duplicateKey: "Line {{line}}: ID \u201C{{value}}\u201D repeats in the file, skipped."
        },
        confirm: "Import {{count}}",
        importing: "Importing\u2026",
        doneToast: "Imported: {{created}} new, {{updated}} updated",
        skippedToast: "Not imported (they belong to deleted requirements and are never reused): {{keys}}",
        error: "The CSV could not be imported",
        preview: "Requirements preview",
        skipped: "Rows that will be skipped ({{count}})"
      },
      view: {
        requirements: "Requirements",
        matrix: "Matrix"
      },
      matrix: {
        title: "Traceability matrix",
        subtitle: "Requirement \u2194 test case \u2194 defect, with coverage gaps in plain sight.",
        exportXlsx: "Export .xlsx",
        exporting: "Exporting\u2026",
        exportedToast: "Matrix exported: {{name}}",
        total: "Requirements",
        covered: "Covered",
        uncovered: "Not covered",
        coverage: "Coverage",
        onlyGaps: "Show gaps only",
        empty: "No requirements yet. Create them in the Requirements view.",
        col: {
          requirement: "Requirement ID",
          requirementTitle: "Requirement",
          priority: "Priority",
          case: "Case ID",
          caseTitle: "Test case",
          execution: "Test status",
          defects: "Defects",
          coverage: "Coverage",
          notes: "Comments"
        }
      },
      execution: {
        passed: "Pass",
        failed: "Fail",
        blocked: "Blocked",
        not_run: "Not run"
      },
      coverage: {
        covered: "Covered",
        not_covered: "Not covered"
      },
      note: {
        obsoleteCase: "Obsolete case (does not cover)",
        openDefect: "Open defect"
      },
      gaps: {
        title: "Traceability gaps",
        casesWithoutRequirement: "Cases without a requirement",
        unknownLinks: "Cases linking a requirement that does not exist",
        defectsWithoutCase: "Defects without a linked case"
      },
      migrate: {
        button: "Migrate traceability ({{count}})",
        title: "Migrate the Traceability field to links",
        intro: "These IDs appear in the free-text Traceability of your cases. Choose which become links to requirements. The free text is kept.",
        include: "Include",
        found: "Found",
        willCreate: "will be created",
        summary: "{{links}} links and {{creates}} new requirements will be created.",
        apply: "Apply",
        applying: "Applying\u2026",
        doneToast: "Migration applied: {{links}} links, {{creates}} new requirements"
      }
    },
    downloads: {
      saved: "Saved to {{path}}",
      fallback: "Your download folder could not be used (missing or not writable). Saved to Downloads: {{path}}",
      failed: "Could not save \u201C{{name}}\u201D: {{reason}}",
      pdfFailed: "Could not create the PDF \u201C{{name}}\u201D: {{reason}}"
    },
    diagnostics: {
      export: "Export diagnostics",
      exporting: "Exporting\u2026",
      exported: "Diagnostics saved to {{file}}",
      failed: "The diagnostics could not be exported."
    },
    errorBoundary: {
      title: "Something went wrong",
      message: "This view failed. Your data is not lost: you can retry, reload the app or export diagnostics to report the problem.",
      retry: "Retry",
      reload: "Reload",
      details: "Technical details"
    },
    recoveryKey: {
      title: "Recovery key",
      intro: "The local database is encrypted and its key lives only in this computer's credential store. If you lose it (new PC, reinstalled Windows), only the recovery key together with your copy of pharos.db.enc brings your data back.",
      lastShown: "Last shown: {{date}}",
      desktopOnly: "Only available in the desktop app.",
      show: "Show recovery key",
      failed: "Could not read the recovery key.",
      confirmTitle: "Show the recovery key?",
      confirmBody: "Anyone with this key and a copy of your data can read it. Show it only when nobody is looking at your screen.",
      confirm: "Show",
      shownTitle: "Save this key now",
      guidePaper: "Write it on paper and keep it somewhere safe, or",
      guideManager: "store it in a password manager.",
      guideRisk: "Do not send it by email or chat, and do not keep it next to the copy of your data.",
      guideBackup: "To restore on another computer you need this key and a copy of pharos.db.enc (and of the evidence/ folder once it exists). Pharos cannot recover it for you.",
      copy: "Copy to clipboard",
      copied: "Copied",
      copiedHint: "Paste it into your password manager, then copy something else to clear the clipboard.",
      savedCheck: "I have saved it somewhere safe",
      close: "Close"
    },
    a11y: {
      skipToContent: "Skip to content",
      close: "Close",
      currentStep: "current step",
      row: "Row {{n}}",
      mainNav: "Main navigation",
      start: "Start",
      end: "End",
      date: "Date"
    },
    validation: {
      severity: {
        error: "Error",
        warning: "Warning"
      },
      required: "This field is required.",
      number: "Enter a number.",
      integer: "Enter a whole number.",
      min: "The minimum is {{min}}.",
      max: "The maximum is {{max}}.",
      dateOrder: "The end date is before the start date.",
      format: "Invalid format. Example: {{example}}.",
      duplicateRow: "Duplicate row: there is already one like it.",
      duplicateKey: "That ID already exists.",
      summary: "Cannot save: check {{count}} field(s).",
      savedWithWarnings: "Saved with {{count}} warning(s) to review."
    }
  };
  var SUPPORTED_LANGUAGES = ["es", "en"];
  var LANGUAGE_STORAGE_KEY = "pharos.language";
  var DEFAULT_LANGUAGE = "es";
  function getInitialLanguage() {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === "es" || stored === "en") return stored;
    return DEFAULT_LANGUAGE;
  }
  void instance.use(initReactI18next).init({
    resources: {
      es: { translation: es_default },
      en: { translation: en_default }
    },
    lng: getInitialLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: { escapeValue: false }
  });
  document.documentElement.setAttribute("lang", instance.resolvedLanguage ?? DEFAULT_LANGUAGE);
  instance.on("languageChanged", (lng) => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
    document.documentElement.setAttribute("lang", lng);
  });
  var i18n_default = instance;
  function LanguageToggle() {
    const { i18n, t: t2 } = useTranslation();
    const current = i18n.resolvedLanguage ?? "es";
    const [open, setOpen] = (0, import_react9.useState)(false);
    const ref = (0, import_react9.useRef)(null);
    const triggerRef = (0, import_react9.useRef)(null);
    (0, import_react9.useEffect)(() => {
      if (!open) return;
      const onDown = (e2) => {
        if (ref.current && !ref.current.contains(e2.target)) setOpen(false);
      };
      const onKey = (e2) => {
        if (e2.key !== "Escape") return;
        setOpen(false);
        triggerRef.current?.focus();
      };
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onDown);
        document.removeEventListener("keydown", onKey);
      };
    }, [open]);
    const pick = (lng) => {
      void i18n.changeLanguage(lng);
      setOpen(false);
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lang-dd", ref, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "button",
        {
          ref: triggerRef,
          type: "button",
          className: "lang-dd__trigger",
          "aria-expanded": open,
          "aria-controls": "lang-dd-menu",
          "aria-label": `${current.toUpperCase()}, ${t2("topbar.language")}`,
          "data-testid": "lang-trigger",
          onClick: () => setOpen((o) => !o),
          children: [
            current.toUpperCase(),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lang-dd__chev", "aria-hidden": "true", children: "\u25BE" })
          ]
        }
      ),
      open && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { id: "lang-dd-menu", className: "lang-dd__menu", "aria-label": t2("topbar.language"), children: SUPPORTED_LANGUAGES.map((lng) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "lang-dd__item",
          "data-active": current === lng,
          "aria-pressed": current === lng,
          "data-testid": `lang-${lng}`,
          onClick: () => pick(lng),
          children: t2(`language.${lng}`)
        }
      ) }, lng)) })
    ] });
  }
  var THEME_STORAGE_KEY = "pharos.theme";
  var ThemeContext = (0, import_react11.createContext)(
    void 0
  );
  function getInitialTheme() {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    const prefersDark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  }
  function ThemeProvider({ children }) {
    const [theme, setTheme] = (0, import_react10.useState)(getInitialTheme);
    (0, import_react10.useEffect)(() => {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }, [theme]);
    const toggleTheme = (0, import_react10.useCallback)(
      () => setTheme((prev) => prev === "light" ? "dark" : "light"),
      []
    );
    const value = (0, import_react10.useMemo)(
      () => ({ theme, toggleTheme, setTheme }),
      [theme, toggleTheme]
    );
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ThemeContext.Provider, { value, children });
  }
  function useTheme() {
    const context = (0, import_react12.useContext)(ThemeContext);
    if (!context) {
      throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
  }
  var MODES = [
    { mode: "light", glyph: "\u2600", labelKey: "theme.light" },
    { mode: "dark", glyph: "\u263E", labelKey: "theme.dark" }
  ];
  function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const { t: t2 } = useTranslation();
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "theme-seg", role: "group", "aria-label": t2("topbar.toggleTheme"), children: MODES.map(({ mode, glyph, labelKey }) => {
      const active = theme === mode;
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "button",
        {
          type: "button",
          className: "theme-seg__btn",
          "data-active": active,
          "aria-pressed": active,
          "aria-label": t2(labelKey),
          title: t2(labelKey),
          "data-testid": active ? `theme-${mode}` : "theme-toggle",
          onClick: () => setTheme(mode),
          children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { "aria-hidden": "true", children: glyph })
        },
        mode
      );
    }) });
  }
  var FOCUSABLE = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");
  var stack = [];
  function isTop(el) {
    const open = stack.filter((d) => !d.querySelector("[aria-modal='true']"));
    return open[open.length - 1] === el;
  }
  function focusables(root) {
    return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
      (el) => !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true"
    );
  }
  function Dialog({
    labelledBy,
    label,
    describedBy,
    onClose,
    confirmClose,
    dismissable = true,
    initialFocus,
    role = "dialog",
    className = "cd",
    overlayClassName = "cd-overlay",
    children
  }) {
    const ref = (0, import_react13.useRef)(null);
    const closeRef = (0, import_react13.useRef)(void 0);
    closeRef.current = dismissable ? onClose : void 0;
    const confirmRef = (0, import_react13.useRef)(confirmClose);
    confirmRef.current = confirmClose;
    const dismiss = () => {
      if (!closeRef.current) return;
      if (confirmRef.current && !confirmRef.current()) return;
      closeRef.current();
    };
    const dismissRef = (0, import_react13.useRef)(dismiss);
    dismissRef.current = dismiss;
    const [opener] = (0, import_react13.useState)(() => {
      const focused = document.activeElement;
      return focused instanceof HTMLElement && focused !== document.body ? focused : null;
    });
    (0, import_react13.useEffect)(() => {
      const root = ref.current;
      if (!root) return;
      stack.push(root);
      if (!root.contains(document.activeElement)) {
        const target = initialFocus?.current ?? focusables(root)[0] ?? root;
        target.focus();
      }
      const onKey = (e2) => {
        if (!isTop(root)) return;
        if (e2.key === "Escape") {
          if (!closeRef.current) return;
          e2.preventDefault();
          e2.stopPropagation();
          dismissRef.current();
          return;
        }
        if (e2.key !== "Tab") return;
        const items = focusables(root);
        if (items.length === 0) {
          e2.preventDefault();
          root.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e2.shiftKey && (active === first || !root.contains(active))) {
          e2.preventDefault();
          last.focus();
        } else if (!e2.shiftKey && (active === last || !root.contains(active))) {
          e2.preventDefault();
          first.focus();
        }
      };
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("keydown", onKey);
        stack.splice(stack.indexOf(root), 1);
        if (opener?.isConnected) opener.focus();
        else document.getElementById("main-content")?.focus();
      };
    }, []);
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "div",
      {
        className: overlayClassName,
        onMouseDown: (e2) => {
          if (e2.target === e2.currentTarget) dismiss();
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "div",
          {
            ref,
            className,
            role,
            "aria-modal": "true",
            "aria-labelledby": labelledBy,
            "aria-label": labelledBy ? void 0 : label,
            "aria-describedby": describedBy,
            tabIndex: -1,
            children
          }
        )
      }
    );
  }
  function ConfirmDialog({
    title,
    message,
    confirmLabel,
    danger,
    onConfirm,
    onCancel
  }) {
    const { t: t2 } = useTranslation();
    const id = (0, import_react14.useId)();
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
      Dialog,
      {
        role: "alertdialog",
        labelledBy: `${id}-title`,
        describedBy: `${id}-msg`,
        onClose: onCancel,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { id: `${id}-title`, className: "cd__title", children: title }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { id: `${id}-msg`, className: "cd__msg", children: message }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "cd__actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "cd__cancel", onClick: onCancel, children: t2("common.cancel") }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              "button",
              {
                type: "button",
                className: `cd__confirm${danger ? " cd__confirm--danger" : ""}`,
                onClick: onConfirm,
                children: confirmLabel
              }
            )
          ] })
        ]
      }
    );
  }
  function ImportReportModal({
    title,
    parsing,
    done,
    total,
    rows,
    onApply,
    onCancel
  }) {
    const { t: t2 } = useTranslation();
    const id = (0, import_react15.useId)();
    const ratio = total > 0 ? Math.round(done / total * 100) : 0;
    const icon = {
      filled: "\u2713",
      empty: "\u25CB",
      notFound: "\u2014"
    };
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(Dialog, { className: "cd imp", labelledBy: `${id}-title`, onClose: onCancel, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { id: `${id}-title`, className: "cd__title", children: title }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        "div",
        {
          className: "imp__progress",
          role: "progressbar",
          "aria-labelledby": `${id}-title`,
          "aria-valuemin": 0,
          "aria-valuemax": 100,
          "aria-valuenow": ratio,
          children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "imp__bar", style: { width: `${ratio}%` } })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "imp__status", role: "status", children: parsing ? t2("importReport.detecting", { done, total }) : t2("importReport.doneMsg") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("ul", { className: "imp__list", children: rows.map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { className: "imp__row", "data-status": r.status, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "imp__icon", "aria-hidden": "true", children: icon[r.status] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "imp__label", children: t2(r.labelKey) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "imp__value", children: r.status === "notFound" ? t2("importReport.notFound") : r.count != null ? t2("importReport.rows", { count: r.count }) : r.preview ?? t2("importReport.blank") })
      ] }, i)) }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "cd__actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: "cd__cancel", onClick: onCancel, children: t2("common.cancel") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "button",
          {
            type: "button",
            className: "cd__confirm",
            onClick: onApply,
            disabled: parsing,
            children: t2("importReport.apply")
          }
        )
      ] })
    ] });
  }
  function EmptySection({ title, subtitle, phase }) {
    const { t: t2 } = useTranslation();
    return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("section", { className: "empty-section", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("header", { className: "empty-section__header", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h1", { children: title }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "empty-section__subtitle", children: subtitle })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "empty-section__card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "empty-section__beacon", "aria-hidden": "true", children: "\u2316" }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "empty-section__body", children: t2("section.emptyBody") }),
        phase !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "empty-section__badge", children: t2("section.comingInPhase", { phase }) })
      ] })
    ] });
  }
  init_core();
  init_core();
  var TOAST_EVENT = "pharos:toast";
  function notify(message, kind = "success") {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent(TOAST_EVENT, { detail: { message, kind } })
    );
  }
  var ReportedError = class extends Error {
    constructor(message) {
      super(message);
      __publicField(this, "reported", true);
      this.name = "ReportedError";
    }
  };
  function isTauri() {
    return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
  }
  async function toBytes(data) {
    if (typeof data === "string") return new TextEncoder().encode(data);
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    return new Uint8Array(await data.arrayBuffer());
  }
  function browserDownload(name, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], {
      type: mime ?? "application/octet-stream"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 6e4);
  }
  async function saveFile(name, data, options = {}) {
    const { mime, untrusted } = typeof options === "string" ? { mime: options } : options;
    if (!isTauri()) {
      browserDownload(name, data, mime);
      return name;
    }
    let saved;
    try {
      const headers = {
        "x-pharos-filename": encodeURIComponent(name)
      };
      if (untrusted) headers["x-pharos-untrusted"] = "1";
      saved = await invoke("download_save", await toBytes(data), {
        headers
      });
    } catch (e2) {
      const reason = e2 instanceof Error ? e2.message : String(e2);
      notify(instance.t("downloads.failed", { name, reason }), "error");
      throw new ReportedError(reason);
    }
    if (saved.fallback)
      notify(instance.t("downloads.fallback", { path: saved.path }), "warning");
    return saved.path;
  }
  var APP_VERSION = "0.1.0-beta.1";
  var RULES = [
    [/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, "<token>"],
    [/\bbearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <token>"],
    [/\b(?:sk-(?:ant-|or-)?[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{30,})/g, "<key>"],
    [
      /((?:api[_-]?key|x-goog-api-key|x-api-key|access[_-]?token|refresh[_-]?token|token|password|secret|authorization)["']?\s*[:=]\s*["']?)[^\s"',&}]+/gi,
      "$1<redacted>"
    ],
    [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>"],
    [/\b([A-Z]:[\\/]+Users[\\/]+)[^\\/\s"']+/gi, "$1<user>"]
  ];
  var RECOVERY_KEY = /\b[0-9A-Z]{4}(?:[ -][0-9A-Z]{4}){13}\b/gi;
  var OPAQUE_RUN = /[A-Za-z0-9+_=-]{32,}/g;
  var UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  var mixed = (run) => /\d/.test(run) && /[A-Za-z]/.test(run);
  function redact(text) {
    let out = text;
    for (const [re, with_] of RULES) out = out.replace(re, with_);
    out = out.replace(
      RECOVERY_KEY,
      (run) => mixed(run) ? "<recovery-key>" : run
    );
    return out.replace(
      OPAQUE_RUN,
      (run) => mixed(run) && !UUID.test(run) ? "<redacted>" : run
    );
  }
  var MAX_MESSAGE = 2e3;
  var MAX_BUFFERED = 50;
  var recentErrors = [];
  function describeError(error, context) {
    const base = error instanceof Error ? `${error.name}: ${error.message}${error.stack ? `
${error.stack}` : ""}` : `Non-Error value (${error === null ? "null" : typeof error})`;
    const text = context ? `${base}
${context}` : base;
    return redact(text).slice(0, MAX_MESSAGE);
  }
  function logClientError(error, context) {
    const message = describeError(error, context);
    recentErrors.push(message);
    if (recentErrors.length > MAX_BUFFERED) recentErrors.shift();
    if (isTauri()) {
      invoke("diag_log", { level: "error", message }).catch(() => void 0);
    }
  }
  function uiFacts() {
    return {
      language: instance.language ?? "",
      theme: document.documentElement.getAttribute("data-theme") ?? "light"
    };
  }
  function stamp(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  }
  function diagnosticFileName(when) {
    return `pharos-diagnostic-${APP_VERSION}-${stamp(when)}.zip`;
  }
  async function buildDiagnosticZip(when = /* @__PURE__ */ new Date()) {
    const { default: JSZip } = await Promise.resolve().then(() => __toESM2(require_jszip_min(), 1));
    const zip = new JSZip();
    const header = {
      format: "pharos-diagnostic/1",
      generatedAt: when.toISOString()
    };
    if (isTauri()) {
      const bundle = await invoke("diag_export", {
        client: uiFacts()
      });
      zip.file(
        "diagnostic.json",
        JSON.stringify(
          { ...header, platform: "desktop", ...bundle.manifest },
          null,
          2
        )
      );
      for (const log of bundle.logs) zip.file(`logs/${log.name}`, log.content);
    } else {
      const web = {
        ...header,
        platform: "web",
        app: { name: "Pharos", version: APP_VERSION },
        ui: uiFacts(),
        userAgent: navigator.userAgent,
        note: "Web preview: no native logs, database or OS facts.",
        clientErrors: recentErrors
      };
      zip.file("diagnostic.json", JSON.stringify(web, null, 2));
    }
    return zip.generateAsync({ type: "blob" });
  }
  async function exportDiagnostics() {
    const when = /* @__PURE__ */ new Date();
    const blob = await buildDiagnosticZip(when);
    return saveFile(diagnosticFileName(when), blob, "application/zip");
  }
  function ErrorFallback({
    error,
    variant,
    onRetry
  }) {
    const { t: t2 } = useTranslation();
    const [status, setStatus] = (0, import_react17.useState)({ kind: "idle" });
    async function onExport() {
      setStatus({ kind: "busy" });
      try {
        setStatus({ kind: "done", file: await exportDiagnostics() });
      } catch (e2) {
        logClientError(e2, "diagnostic export");
        setStatus({ kind: "failed" });
      }
    }
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: `err-boundary err-boundary--${variant}`, role: "alert", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "err-boundary__card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h1", { className: "err-boundary__title", children: t2("errorBoundary.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "err-boundary__message", children: t2("errorBoundary.message") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "err-boundary__actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          "button",
          {
            type: "button",
            className: "err-boundary__primary",
            onClick: onRetry,
            children: t2("errorBoundary.retry")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          "button",
          {
            type: "button",
            className: "err-boundary__btn",
            onClick: () => window.location.reload(),
            children: t2("errorBoundary.reload")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          "button",
          {
            type: "button",
            className: "err-boundary__btn",
            onClick: () => void onExport(),
            disabled: status.kind === "busy",
            children: status.kind === "busy" ? t2("diagnostics.exporting") : t2("diagnostics.export")
          }
        )
      ] }),
      status.kind === "done" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "err-boundary__status", children: t2("diagnostics.exported", { file: status.file }) }),
      status.kind === "failed" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "err-boundary__status err-boundary__status--error", children: t2("diagnostics.failed") }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("details", { className: "err-boundary__details", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("summary", { children: t2("errorBoundary.details") }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("pre", { children: `${error.name}: ${error.message}` })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "err-boundary__version", children: t2("app.version", { version: APP_VERSION }) })
    ] }) });
  }
  var ErrorBoundary = class extends import_react16.Component {
    constructor() {
      super(...arguments);
      __publicField(this, "state", { error: null });
    }
    static getDerivedStateFromError(error) {
      return { error };
    }
    componentDidCatch(error, info) {
      logClientError(error, info.componentStack ?? void 0);
    }
    componentDidUpdate(prev) {
      if (this.state.error && prev.resetKey !== this.props.resetKey) {
        this.setState({ error: null });
      }
    }
    render() {
      const { error } = this.state;
      if (!error) return this.props.children;
      return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        ErrorFallback,
        {
          error,
          variant: this.props.variant ?? "page",
          onRetry: () => this.setState({ error: null })
        }
      );
    }
  };
  function Logo({ size = 32 }) {
    return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
      "svg",
      {
        width: size,
        height: size,
        viewBox: "0 0 32 32",
        role: "img",
        "aria-label": "Pharos",
        className: "app-logo",
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "path",
            {
              d: "M16 5 L7 12 M16 5 L25 12",
              stroke: "var(--color-accent)",
              strokeWidth: "1.5",
              strokeLinecap: "round",
              opacity: "0.7"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "path",
            {
              d: "M12 27 L13 13 H19 L20 27 Z",
              fill: "var(--color-navy-100)",
              stroke: "var(--color-navy-300)",
              strokeWidth: "1"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            "rect",
            {
              x: "13",
              y: "8",
              width: "6",
              height: "5",
              rx: "1",
              fill: "var(--color-accent)"
            }
          )
        ]
      }
    );
  }
  var ToastContext = (0, import_react18.createContext)(null);
  var ICON = {
    success: "\u2713",
    warning: "!",
    error: "\u2715"
  };
  var seq = 0;
  function ToastProvider({ children }) {
    const [items, setItems] = (0, import_react18.useState)([]);
    const toast = (0, import_react18.useCallback)((message, kind = "success") => {
      const id = ++seq;
      setItems((s) => [...s, { id, message, kind }]);
      window.setTimeout(
        () => setItems((s) => s.filter((t2) => t2.id !== id)),
        kind === "success" ? 3e3 : 8e3
      );
    }, []);
    (0, import_react18.useEffect)(() => {
      const onToast = (e2) => {
        const { message, kind } = e2.detail;
        toast(message, kind);
      };
      window.addEventListener(TOAST_EVENT, onToast);
      return () => window.removeEventListener(TOAST_EVENT, onToast);
    }, [toast]);
    const polite = items.filter((t2) => t2.kind === "success");
    const urgent = items.filter((t2) => t2.kind !== "success");
    return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(ToastContext.Provider, { value: toast, children: [
      children,
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "toast-stack", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { "aria-live": "assertive", role: "alert", children: urgent.map((t2) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: `toast toast--${t2.kind}`, children: [
          ICON[t2.kind],
          " ",
          t2.message
        ] }, t2.id)) }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { "aria-live": "polite", children: polite.map((t2) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "toast", children: [
          ICON.success,
          " ",
          t2.message
        ] }, t2.id)) })
      ] })
    ] });
  }
  function useToast() {
    return (0, import_react18.useContext)(ToastContext) ?? (() => {
    });
  }
  function issueKey(issue2) {
    return issue2.code.includes(".") ? issue2.code : `validation.${issue2.code}`;
  }
  function controlProps(id, issue2, describedBy) {
    const ids = [describedBy, issue2 ? `${id}-msg` : void 0].filter(Boolean).join(" ");
    return {
      id,
      ...issue2?.severity === "error" ? { "aria-invalid": true } : {},
      ...ids ? { "aria-describedby": ids } : {}
    };
  }
  function useSaveGuard(blocking) {
    const [attempt, setAttempt] = (0, import_react20.useState)(0);
    const summaryRef = (0, import_react20.useRef)(null);
    (0, import_react20.useEffect)(() => {
      if (attempt > 0) summaryRef.current?.focus();
    }, [attempt]);
    return {
      showSummary: attempt > 0 && blocking,
      attempted: attempt > 0,
      summaryRef,
      guard(save) {
        if (blocking) setAttempt((n) => n + 1);
        else {
          setAttempt(0);
          save();
        }
      }
    };
  }
  function FieldMessage({ id, issue: issue2 }) {
    const { t: t2 } = useTranslation();
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { id, className: `field-msg field-msg--${issue2.severity}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { "aria-hidden": "true", children: issue2.severity === "error" ? "\u2715 " : "\u26A0 " }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "sr-only", children: [
        t2(`validation.severity.${issue2.severity}`),
        ": "
      ] }),
      t2(issueKey(issue2), issue2.params)
    ] });
  }
  function FormField({
    id: fixedId,
    label,
    hint,
    issue: issue2,
    required: required2,
    className = "tp-field",
    children
  }) {
    const autoId = (0, import_react19.useId)();
    const id = fixedId ?? autoId;
    const hintId = hint ? `${id}-hint` : void 0;
    const control = controlProps(id, issue2, hintId);
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className, "data-severity": issue2?.severity, children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("label", { htmlFor: id, className: "tp-field__label", children: [
        label,
        required2 && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "tp-field__req", "aria-hidden": "true", children: " *" })
      ] }),
      hint && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { id: hintId, className: "tp-field__hint", children: hint }),
      children(required2 ? { ...control, "aria-required": true } : control),
      issue2 && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(FieldMessage, { id: `${id}-msg`, issue: issue2 })
    ] });
  }
  var ErrorSummary = (0, import_react19.forwardRef)(
    function ErrorSummary2({ items }, ref) {
      const { t: t2 } = useTranslation();
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { ref, className: "field-summary", role: "alert", tabIndex: -1, children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "field-summary__title", children: t2("validation.summary", { count: items.length }) }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("ul", { children: items.map((item, i) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("li", { children: [
          item.fieldId ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
            "button",
            {
              type: "button",
              className: "field-summary__link",
              onClick: () => document.getElementById(item.fieldId)?.focus(),
              children: item.label
            }
          ) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("strong", { children: item.label }),
          ": ",
          t2(issueKey(item.issue), item.issue.params)
        ] }, i)) })
      ] });
    }
  );
  var issue = (code, severity, params) => ({
    code,
    severity,
    ...params ? { params } : {}
  });
  function required(value, severity = "error") {
    return (value ?? "").trim() === "" ? issue("required", severity) : null;
  }
  function numberInRange(raw, { min, max, integer = false }, severity = "error") {
    const text = String(raw).trim();
    const n = Number(text);
    if (text === "" || !Number.isFinite(n)) return issue("number", severity);
    if (integer && !Number.isInteger(n)) return issue("integer", severity);
    if (min !== void 0 && n < min) return issue("min", severity, { min });
    if (max !== void 0 && n > max) return issue("max", severity, { max });
    return null;
  }
  function dateOrder(start, end, severity = "warning") {
    return start && end && end < start ? issue("dateOrder", severity) : null;
  }
  function format(value, pattern, example, severity = "error") {
    const v = value.trim();
    return v !== "" && !pattern.test(v) ? issue("format", severity, { example }) : null;
  }
  function duplicateRows(rows, keyOf) {
    const seen = /* @__PURE__ */ new Set();
    const dupes = /* @__PURE__ */ new Set();
    rows.forEach((row, i) => {
      const key = keyOf(row).trim().toLocaleLowerCase();
      if (key === "") return;
      if (seen.has(key)) dupes.add(i);
      else seen.add(key);
    });
    return dupes;
  }
  function duplicateRow(dupes, index, severity = "warning") {
    return dupes.has(index) ? issue("duplicateRow", severity) : null;
  }
  function hasBlocking(issues) {
    return issues.some((i) => i?.severity === "error");
  }
  function compact(issues) {
    return issues.filter((i) => i != null);
  }
  function DeleteButton({
    onDelete,
    needsConfirm,
    itemLabel
  }) {
    const { t: t2 } = useTranslation();
    const [confirming, setConfirming] = (0, import_react21.useState)(false);
    const name = itemLabel ? `${t2("common.delete")}: ${itemLabel}` : t2("common.delete");
    if (!needsConfirm) {
      return /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        "button",
        {
          type: "button",
          className: "tp-list-field__del",
          "aria-label": name,
          onClick: onDelete,
          children: "\u2715"
        }
      );
    }
    if (confirming) {
      return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: "tp-confirm", role: "group", "aria-label": name, children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
          "button",
          {
            type: "button",
            className: "tp-confirm__yes",
            onClick: () => {
              setConfirming(false);
              onDelete();
            },
            children: t2("common.confirmDelete")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
          "button",
          {
            type: "button",
            className: "tp-confirm__no",
            onClick: () => setConfirming(false),
            children: t2("common.cancel")
          }
        )
      ] });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
      "button",
      {
        type: "button",
        className: "tp-list-field__del",
        "aria-label": name,
        onClick: () => setConfirming(true),
        children: "\u2715"
      }
    );
  }
  function ListField({
    items,
    onChange,
    placeholder,
    label
  }) {
    const { t: t2 } = useTranslation();
    const baseId = (0, import_react21.useId)();
    const dupes = duplicateRows(items, (v) => v);
    return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "tp-list-field", role: "group", "aria-label": label, children: [
      items.map((value, i) => {
        const id = `${baseId}-${i}`;
        const issue2 = duplicateRow(dupes, i);
        const rowLabel = `${label} \xB7 ${t2("a11y.row", { n: i + 1 })}`;
        return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "tp-list-field__item", children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "tp-list-field__row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
              "input",
              {
                ...controlProps(id, issue2),
                "aria-label": rowLabel,
                value,
                placeholder,
                onChange: (e2) => {
                  const next = [...items];
                  next[i] = e2.target.value;
                  onChange(next);
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
              DeleteButton,
              {
                itemLabel: rowLabel,
                needsConfirm: value.trim() !== "",
                onDelete: () => onChange(items.filter((_, j) => j !== i))
              }
            )
          ] }),
          issue2 && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(FieldMessage, { id: `${id}-msg`, issue: issue2 })
        ] }, i);
      }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(
        "button",
        {
          type: "button",
          className: "tp-list-field__add",
          onClick: () => onChange([...items, ""]),
          children: [
            "+ ",
            t2("testPlan.addItem")
          ]
        }
      )
    ] });
  }
  function PairListField({
    items,
    keys,
    labels,
    onChange,
    label
  }) {
    const { t: t2 } = useTranslation();
    const baseId = (0, import_react21.useId)();
    const [ka, kb] = keys;
    const cell = (item, k) => String(item[k] ?? "").trim();
    const dupes = duplicateRows(
      items,
      (item) => cell(item, ka) || cell(item, kb) ? `${cell(item, ka)} | ${cell(item, kb)}` : ""
    );
    return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "tp-pair-field", role: "group", "aria-label": label, children: [
      items.map((item, i) => {
        const hasContent = cell(item, ka) !== "" || cell(item, kb) !== "";
        const id = `${baseId}-${i}`;
        const issue2 = duplicateRow(dupes, i);
        const row = t2("a11y.row", { n: i + 1 });
        return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "tp-list-field__item", children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "tp-pair-field__row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
              "input",
              {
                ...controlProps(id, issue2),
                "aria-label": `${labels[0]} \xB7 ${row}`,
                value: String(item[ka] ?? ""),
                placeholder: labels[0],
                onChange: (e2) => {
                  const next = [...items];
                  next[i] = { ...item, [ka]: e2.target.value };
                  onChange(next);
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
              "input",
              {
                "aria-label": `${labels[1]} \xB7 ${row}`,
                value: String(item[kb] ?? ""),
                placeholder: labels[1],
                onChange: (e2) => {
                  const next = [...items];
                  next[i] = { ...item, [kb]: e2.target.value };
                  onChange(next);
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
              DeleteButton,
              {
                itemLabel: `${label} \xB7 ${row}`,
                needsConfirm: hasContent,
                onDelete: () => onChange(items.filter((_, j) => j !== i))
              }
            )
          ] }),
          issue2 && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(FieldMessage, { id: `${id}-msg`, issue: issue2 })
        ] }, i);
      }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(
        "button",
        {
          type: "button",
          className: "tp-list-field__add",
          onClick: () => onChange([...items, { [ka]: "", [kb]: "" }]),
          children: [
            "+ ",
            t2("testPlan.addRow")
          ]
        }
      )
    ] });
  }
  function CheckboxGroup({
    options,
    selected,
    onChange,
    labelFor,
    allowCustom,
    variant = "checkbox",
    groups,
    label
  }) {
    const { t: t2 } = useTranslation();
    const [draft, setDraft] = (0, import_react21.useState)("");
    const custom = selected.filter((s) => !options.includes(s));
    const toggle = (opt) => onChange(
      selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]
    );
    const addDraft = () => {
      const v = draft.trim();
      if (v && !selected.includes(v)) onChange([...selected, v]);
      setDraft("");
    };
    const customField = allowCustom ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "tp-checks__custom", children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        "input",
        {
          value: draft,
          "aria-label": `${label} \xB7 ${t2("testPlan.otherPlaceholder")}`,
          placeholder: t2("testPlan.otherPlaceholder"),
          onChange: (e2) => setDraft(e2.target.value),
          onKeyDown: (e2) => {
            if (e2.key === "Enter") {
              e2.preventDefault();
              addDraft();
            }
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("button", { type: "button", className: "tp-list-field__add", onClick: addDraft, children: [
        "+ ",
        t2("testPlan.other")
      ] })
    ] }) : null;
    if (variant === "pills") {
      const groupList = groups ?? [{ title: "", options }];
      const pill = (opt, label2) => /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        "button",
        {
          type: "button",
          className: "tp-pill",
          "data-active": selected.includes(opt),
          "aria-pressed": selected.includes(opt),
          onClick: () => toggle(opt),
          children: label2
        },
        opt
      );
      return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "tp-pills-groups", role: "group", "aria-label": label, children: [
        groupList.map((g, gi) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "tp-pills-group", children: [
          g.title && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "tp-pills-group__title", children: g.title }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "tp-pills", children: g.options.map((opt) => pill(opt, labelFor(opt))) })
        ] }, gi)),
        custom.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "tp-pills", children: custom.map((v) => pill(v, v)) }),
        customField
      ] });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "tp-checks", role: "group", "aria-label": label, children: [
      options.map((opt) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("label", { className: "tp-checks__item", children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
          "input",
          {
            type: "checkbox",
            checked: selected.includes(opt),
            onChange: () => toggle(opt)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { children: labelFor(opt) })
      ] }, opt)),
      custom.map((value) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("label", { className: "tp-checks__item", children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("input", { type: "checkbox", checked: true, onChange: () => toggle(value) }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { children: value })
      ] }, value)),
      customField
    ] });
  }
  return __toCommonJS(index_exports);
})();
/*! Bundled license information:

jszip/dist/jszip.min.js:
  (*!
  
  JSZip v3.10.1 - A JavaScript class for generating and reading zip files
  <http://stuartk.com/jszip>
  
  (c) 2009-2016 Stuart Knightley <stuart [at] stuartk.com>
  Dual licenced under the MIT license or GPLv3. See https://raw.github.com/Stuk/jszip/main/LICENSE.markdown.
  
  JSZip uses the library pako released under the MIT license :
  https://github.com/nodeca/pako/blob/main/LICENSE
  *)
*/
window.Pharos=Pharos.__dsMainNs?Object.assign({},Pharos,Pharos.__dsMainNs,{__dsMainNs:undefined}):Pharos;
