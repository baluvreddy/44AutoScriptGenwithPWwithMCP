"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var browserBackend_exports = {};
__export(browserBackend_exports, {
  runBrowserBackendAtEnd: () => runBrowserBackendAtEnd,
  runBrowserBackendOnError: () => runBrowserBackendOnError
});
module.exports = __toCommonJS(browserBackend_exports);
var mcp = __toESM(require("../sdk/exports"));
var import_globals = require("../../common/globals");
var import_util = require("../../util");
var import_config = require("../browser/config");
var import_browserServerBackend = require("../browser/browserServerBackend");
async function runBrowserBackendOnError(page, message) {
  const testInfo = (0, import_globals.currentTestInfo)();
  if (!testInfo || !testInfo._pauseOnError())
    return;
  const config = {
    ...import_config.defaultConfig,
    capabilities: ["testing"]
  };
  const snapshot = await page._snapshotForAI();
  const introMessage = `### Paused on error:
${(0, import_util.stripAnsiEscapes)(message())}

### Current page snapshot:
${snapshot}

### Task
Try recovering from the error prior to continuing`;
  await mcp.runOnPauseBackendLoop(new import_browserServerBackend.BrowserServerBackend(config, identityFactory(page.context())), introMessage);
}
async function runBrowserBackendAtEnd(context) {
  const testInfo = (0, import_globals.currentTestInfo)();
  if (!testInfo || !testInfo._pauseAtEnd())
    return;
  const page = context.pages()[0];
  if (!page)
    return;
  const snapshot = await page._snapshotForAI();
  const introMessage = `### Paused at end of test. ready for interaction

### Current page snapshot:
${snapshot}`;
  const config = {
    ...import_config.defaultConfig,
    capabilities: ["testing"]
  };
  await mcp.runOnPauseBackendLoop(new import_browserServerBackend.BrowserServerBackend(config, identityFactory(context)), introMessage);
}
function identityFactory(browserContext) {
  return {
    createContext: async (clientInfo, abortSignal, toolName) => {
      return {
        browserContext,
        close: async () => {
        }
      };
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runBrowserBackendAtEnd,
  runBrowserBackendOnError
});
