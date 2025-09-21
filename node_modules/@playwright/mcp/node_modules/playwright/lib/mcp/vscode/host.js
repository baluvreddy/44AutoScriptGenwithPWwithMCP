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
var host_exports = {};
__export(host_exports, {
  runVSCodeTools: () => runVSCodeTools
});
module.exports = __toCommonJS(host_exports);
var import_path = __toESM(require("path"));
var mcpBundle = __toESM(require("../sdk/bundle"));
var mcpServer = __toESM(require("../sdk/server"));
var import_log = require("../log");
var import_browserServerBackend = require("../browser/browserServerBackend");
var import_browserContextFactory = require("../browser/browserContextFactory");
const packageJSON = require("../../../package.json");
const { z, zodToJsonSchema } = mcpBundle;
const contextSwitchOptions = z.object({
  connectionString: z.string().optional().describe("The connection string to use to connect to the browser"),
  lib: z.string().optional().describe("The library to use for the connection"),
  debugController: z.boolean().optional().describe("Enable the debug controller")
});
class VSCodeProxyBackend {
  constructor(_config, _defaultTransportFactory) {
    this._config = _config;
    this._defaultTransportFactory = _defaultTransportFactory;
    this.name = "Playwright MCP Client Switcher";
    this.version = packageJSON.version;
    this._contextSwitchTool = this._defineContextSwitchTool();
  }
  async initialize(server, clientInfo) {
    this._clientInfo = clientInfo;
    const transport = await this._defaultTransportFactory(this);
    await this._setCurrentClient(transport);
  }
  async listTools() {
    const response = await this._currentClient.listTools();
    return [
      ...response.tools,
      this._contextSwitchTool
    ];
  }
  async callTool(name, args) {
    if (name === this._contextSwitchTool.name)
      return this._callContextSwitchTool(args);
    return await this._currentClient.callTool({
      name,
      arguments: args
    });
  }
  serverClosed(server) {
    void this._currentClient?.close().catch(import_log.logUnhandledError);
  }
  onContext(context) {
    this._context = context;
    context.on("close", () => {
      this._context = void 0;
    });
  }
  async _getDebugControllerURL() {
    if (!this._context)
      return;
    const browser = this._context.browser();
    if (!browser || !browser._launchServer)
      return;
    if (this._browser !== browser)
      this._browserServer = void 0;
    if (!this._browserServer)
      this._browserServer = await browser._launchServer({ _debugController: true });
    const url = new URL(this._browserServer.wsEndpoint());
    url.searchParams.set("debug-controller", "1");
    return url.toString();
  }
  async _callContextSwitchTool(params) {
    if (params.debugController) {
      const url = await this._getDebugControllerURL();
      const lines = [`### Result`];
      if (url) {
        lines.push(`URL: ${url}`);
        lines.push(`Version: ${packageJSON.version}`);
      } else {
        lines.push(`No open browsers.`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
    if (!params.connectionString || !params.lib) {
      const transport = await this._defaultTransportFactory(this);
      await this._setCurrentClient(transport);
      return {
        content: [{ type: "text", text: "### Result\nSuccessfully disconnected.\n" }]
      };
    }
    await this._setCurrentClient(
      new mcpBundle.StdioClientTransport({
        command: process.execPath,
        cwd: process.cwd(),
        args: [
          import_path.default.join(__dirname, "main.js"),
          JSON.stringify(this._config),
          params.connectionString,
          params.lib
        ]
      })
    );
    return {
      content: [{ type: "text", text: "### Result\nSuccessfully connected.\n" }]
    };
  }
  _defineContextSwitchTool() {
    return {
      name: "browser_connect",
      description: "Do not call, this tool is used in the integration with the Playwright VS Code Extension and meant for programmatic usage only.",
      inputSchema: zodToJsonSchema(contextSwitchOptions, { strictUnions: true }),
      annotations: {
        title: "Connect to a browser running in VS Code.",
        readOnlyHint: true,
        openWorldHint: false
      }
    };
  }
  async _setCurrentClient(transport) {
    await this._currentClient?.close();
    this._currentClient = void 0;
    const client = new mcpBundle.Client({ name: this._clientInfo.name, version: this._clientInfo.version });
    client.registerCapabilities({
      roots: {
        listRoots: true
      }
    });
    client.setRequestHandler(mcpBundle.ListRootsRequestSchema, () => ({ roots: this._clientInfo.roots }));
    client.setRequestHandler(mcpBundle.PingRequestSchema, () => ({}));
    await client.connect(transport);
    this._currentClient = client;
  }
}
async function runVSCodeTools(config) {
  const serverBackendFactory = {
    name: "Playwright w/ vscode",
    nameInConfig: "playwright-vscode",
    version: packageJSON.version,
    create: () => new VSCodeProxyBackend(
      config,
      (delegate) => mcpServer.wrapInProcess(
        new import_browserServerBackend.BrowserServerBackend(
          config,
          {
            async createContext(clientInfo, abortSignal, toolName) {
              const context = await (0, import_browserContextFactory.contextFactory)(config).createContext(clientInfo, abortSignal, toolName);
              delegate.onContext(context.browserContext);
              return context;
            }
          }
        )
      )
    )
  };
  await mcpServer.start(serverBackendFactory, config.server);
  return;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runVSCodeTools
});
