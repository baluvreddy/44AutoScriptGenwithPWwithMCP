"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var mcpBundle = __toESM(require("../sdk/bundle"));
var mcpServer = __toESM(require("../sdk/server"));
var import_browserServerBackend = require("../browser/browserServerBackend");
class VSCodeBrowserContextFactory {
  constructor(_config, _playwright, _connectionString) {
    this._config = _config;
    this._playwright = _playwright;
    this._connectionString = _connectionString;
    this.name = "vscode";
    this.description = "Connect to a browser running in the Playwright VS Code extension";
  }
  async createContext(clientInfo, abortSignal) {
    let launchOptions = this._config.browser.launchOptions;
    if (this._config.browser.userDataDir) {
      launchOptions = {
        ...launchOptions,
        ...this._config.browser.contextOptions,
        userDataDir: this._config.browser.userDataDir
      };
    }
    const connectionString = new URL(this._connectionString);
    connectionString.searchParams.set("launch-options", JSON.stringify(launchOptions));
    const browserType = this._playwright.chromium;
    const browser = await browserType.connect(connectionString.toString());
    const context = browser.contexts()[0] ?? await browser.newContext(this._config.browser.contextOptions);
    return {
      browserContext: context,
      close: async () => {
        await browser.close();
      }
    };
  }
}
async function main(config, connectionString, lib) {
  const playwright = await import(lib).then((mod) => mod.default ?? mod);
  const factory = new VSCodeBrowserContextFactory(config, playwright, connectionString);
  await mcpServer.connect(
    {
      name: "Playwright MCP",
      nameInConfig: "playwright-vscode",
      create: () => new import_browserServerBackend.BrowserServerBackend(config, factory),
      version: "unused"
    },
    new mcpBundle.StdioServerTransport(),
    false
  );
}
void (async () => {
  await main(
    JSON.parse(process.argv[2]),
    process.argv[3],
    process.argv[4]
  );
})();
