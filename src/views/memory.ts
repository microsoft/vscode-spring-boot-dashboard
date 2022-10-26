
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { Uri,
    CancellationToken,
    Webview,
    WebviewView,
    WebviewViewProvider,
    WebviewViewResolveContext} from "vscode";
import { LiveProcess } from "../models/liveProcess";
import { stsApi } from "../models/stsApi";
import { LocalLiveProcess } from "../types/sts-api";

interface Measurement {
    statistic: string;
    value: any;
}

interface Metrics {
    name: string;
    location: vscode.Location;

    // parsed
    processKey: string;
    label: string;
    description: string;
    baseUnit: string;
    measurements: Measurement[];
    availableTags: { tag: string; values: string[] }[];
}

export interface IWebviewShowOptions {
  [key: string]: boolean | number | string;

  title: string;
}

class MemoryProvider implements WebviewViewProvider{
    public static readonly viewType = "memory.memoryView";
    private storeGcPausesMetrics: Map<LiveProcess, Metrics[]> = new Map();
    private storeMemoryMetrics: Map<LiveProcess, Metrics[]> = new Map();
    private liveProcessList: Map<String,LiveProcess> = new Map();
    private _view?: vscode.WebviewView;

    private _extensionUrl: vscode.Uri;

    constructor() {
        vscode.commands.executeCommand("setContext", "spring.gcPauses:showMode", "defined");
    }

    public get extensionUrl() {
        return this._extensionUrl;
    }

    public set extensionUrl(value) {
        this._extensionUrl = value;
    }

    public resolveWebviewView(
        webviewView: WebviewView,
        context: WebviewViewResolveContext,
        _token: CancellationToken
      ) {

        this._view = webviewView;

        // Allow scripts in the webview
        webviewView.webview.options = {
          enableScripts: true,
        };
        // Set the HTML content that will fill the webview view
        webviewView.webview.html = this._getWebviewContent(webviewView.webview, this._extensionUrl);
    
        // Sets up an event listener to listen for messages passed from the webview view context
        // and executes code based on the message that is recieved
        this._setWebviewMessageListener(webviewView);

        // add live process to dropdown
        this.addLiveProcess(this.liveProcessList.values().next().value);
      }

      /**
     * Constructs the required CSP entry for webviews, which allows them to load local files.
     *
     * @returns The CSP string.
     */
     protected generateContentSecurityPolicy(): string {
      return `<meta http-equiv="Content-Security-Policy" content="default-src 'self';
          script-src vscode-resource: 'self' 'unsafe-inline' 'unsafe-eval' https:;
          style-src vscode-resource: 'self' 'unsafe-inline';
          img-src vscode-resource: 'self' "/>
      `;
     }

      private _getWebviewContent(webview: Webview, extensionUri: Uri) {
        const toolkitUri = getUri(webview, extensionUri, [
          "node_modules",
          "@vscode",
          "webview-ui-toolkit",
          "dist",
          "toolkit.js",
        ]);
        const mainUri = getUri(webview, extensionUri, ["src","webview-ui", "main.js"]);
        const stylesUri = getUri(webview, extensionUri, ["src","webview-ui", "styles.css"]);
        const chartLibPath = getUri(webview, extensionUri, ["node_modules","chart.js","dist","chart.min.js"]);
        const chartjsPath = getUri(webview, extensionUri, ["node_modules","chartjs","chart.js"]);
        const chartjsAdapterPath = getUri(webview, extensionUri, ["node_modules","chartjs-adapter-moment","dist","chartjs-adapter-moment.min.js"]);
        const chartjsAdapterScipt = getUri(webview, extensionUri, ["node_modules","chartjs-adapter-moment","dist","chartjs-adapter-moment.js"]);
        const momentLibPath = getUri(webview, extensionUri, ["node_modules","moment","moment.js"]);
    
        // Tip: Install the es6-string-html VS Code extension to enable code highlighting below
        return /*html*/ `
                <!DOCTYPE html>
                <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        ${this.generateContentSecurityPolicy()}
                        <script type="module" src="${toolkitUri}"></script>
                        <script type="module" src="${mainUri}"></script>
                        <script src="${chartLibPath}"></script>
                        <script src="${chartjsPath}"></script>
                        <script src="${chartjsAdapterPath}"></script>
                        <script src="${chartjsAdapterScipt}"></script>
                        <script src="${momentLibPath}"></script>
                        <link rel="stylesheet" href="${stylesUri}">
                        <title>Weather Checker</title>
                    </head>
                    <body>
              <br>
              <section id="search-container">
                <vscode-dropdown id="process">
                </vscode-dropdown>
              </section>
              <br>
              <section id="search-container">
                <vscode-dropdown id="graphType">
                  <vscode-option value="memory">Heap Memory</vscode-option>
                  <vscode-option value="memory">Non Heap Memory</vscode-option>
                  <vscode-option value="gcPauses">Gc Pauses</vscode-option>
                  <vscode-option value="gcPauses">Garbage Collections</vscode-option>
                </vscode-dropdown>
              </section>
                <canvas id="chart" width="400" height="350"></canvas>
               </body>
            </html>
            `;
      }
    
      private _setWebviewMessageListener(webviewView: WebviewView) {
        webviewView.webview.onDidReceiveMessage(async (message) => {
          const command = message.command;
          const processKey = message.processKey;
          switch (command) {
            case "Refresh":
              const type = message.type;
              const tag = message.tag;
              await stsApi.refreshLiveProcessMetricsData({
                processKey: processKey,
                endpoint: "metrics",
                metricName: type,
                tags: tag
              });
              break;
            default:
          }
        });
      }

    public updateGraph(result: any) {
      if (this._view) {
        this._view.webview.postMessage({
          command: "displayGraph",
          payload: JSON.stringify(result),
        });
      }
	  }

    public addLiveProcess(liveProcess: any) {
      if (this._view) {
        this._view.webview.postMessage({
          command: "displayProcess",
          process: JSON.stringify(liveProcess),
        });
      }
	  }

    public addLiveProcessInfo(process: LiveProcess) {
      if(!this.liveProcessList.get(process.processKey)) {
        this.liveProcessList.set(process.processKey, process);
        this.addLiveProcess(process);
      }
    }

    public removeLiveProcessInfo(process: LiveProcess) {
      if(this.liveProcessList.get(process.processKey)) {
        this.liveProcessList.delete(process.processKey);
        if (this._view) {
          this._view.show?.(true); // `show` is not implemented in 1.49 but is for 1.50 insiders
          this._view.webview.postMessage({
            command: "removeProcess",
            process: JSON.stringify(process),
          });
        }
      }
    }

    public refreshLiveGcPausesMetrics(liveProcess: LocalLiveProcess, gcPausesMetricsDataRaw : Metrics[] | undefined) {
        if (gcPausesMetricsDataRaw === undefined) {
            // remove
            const targetLiveProcess = Array.from(this.storeGcPausesMetrics.keys()).find(lp => lp.processKey === liveProcess.processKey);
            if (targetLiveProcess) {
                this.storeGcPausesMetrics.delete(targetLiveProcess);
                this.removeLiveProcessInfo(targetLiveProcess);
            }
        } else if (gcPausesMetricsDataRaw !== null) {
          // add/update
          const targetLiveProcess = Array.from(this.storeGcPausesMetrics.keys()).find(lp => lp.processKey === liveProcess.processKey) ?? new LiveProcess(liveProcess);
          const gcPausesMetrics = gcPausesMetricsDataRaw.map(raw => parseMetrticsData(liveProcess.processKey, raw));
          if(this.storeGcPausesMetrics.get(targetLiveProcess) !== undefined) {
            this.updateGraph(gcPausesMetrics);
          } else {
            this.addLiveProcessInfo(targetLiveProcess);
          }
          this.storeGcPausesMetrics.set(targetLiveProcess, gcPausesMetrics);
        }
    }

    public refreshLiveMemoryMetrics(liveProcess: LocalLiveProcess, memoryMetricsDataRaw: Metrics[] | undefined) {

      if (memoryMetricsDataRaw === undefined) {
          // remove
          const targetLiveProcess = Array.from(this.storeMemoryMetrics.keys()).find(lp => lp.processKey === liveProcess.processKey);
          if (targetLiveProcess) {
              this.storeMemoryMetrics.delete(targetLiveProcess);
              this.removeLiveProcessInfo(targetLiveProcess);
          }
      } else if(memoryMetricsDataRaw.length !== null) {
          // add/update
          const targetLiveProcess = Array.from(this.storeMemoryMetrics.keys()).find(lp => lp.processKey === liveProcess.processKey) ?? new LiveProcess(liveProcess);
          const memoryMetrics = memoryMetricsDataRaw.map(raw => parseMetrticsData(liveProcess.processKey, raw));
          if(this.storeMemoryMetrics.get(targetLiveProcess) !== undefined) {
            this.updateGraph(memoryMetrics);
          } else {
            this.addLiveProcessInfo(targetLiveProcess);
          }
          this.storeMemoryMetrics.set(targetLiveProcess, memoryMetricsDataRaw);
      }
  }
}
export const memoryProvider = new MemoryProvider();

function parseMetrticsData(processKey: string, raw:any): Metrics {
    const label = raw.name;
    const description = raw.description;
    const baseUnit = raw.baseUnit;
    const measurements = raw.measurements;
    const availableTags = raw.availableTags;
    return {
        processKey,
        label,
        description,
        baseUnit,
        measurements,
        availableTags,
        ...raw
    };
}

export function getUri(webview: Webview, extensionUri: Uri, pathList: string[]) {
    return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList));
  }