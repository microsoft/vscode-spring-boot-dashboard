
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
                        <link rel="stylesheet" href="${stylesUri}">
                        <title>Weather Checker</title>
                    </head>
                    <body>
              <section id="search-container">
                <vscode-dropdown id="graphType">
                  <vscode-option value="memory">Heap Memory</vscode-option>
                  <vscode-option value="memory">Non Heap Memory</vscode-option>
                  <vscode-option value="gcPauses">Gc Pauses</vscode-option>
                  <vscode-option value="gcPauses">Garbage Collections</vscode-option>
                </vscode-dropdown>
              </section>
              <h2>Current Graph</h2>
                <section id="results-container">
                    <p id="icon"></p>
                    <p id="summary"></p>
                </section>
               </body>
            </html>
            `;
      }
    
      private _setWebviewMessageListener(webviewView: WebviewView) {
        webviewView.webview.onDidReceiveMessage(async (message) => {
          const command = message.command;
          let result;
          switch (command) {
            case "Heap Memory":
              const heapMem = Array.from(this.storeMemoryMetrics.keys());
              result = this.storeMemoryMetrics.get(heapMem[0]);
              break;
            case "Non Heap Memory":
              const nonHeapMem = Array.from(this.storeMemoryMetrics.keys());
              result = this.storeMemoryMetrics.get(nonHeapMem[0]);
              break;
            case "Gc Pauses":
              const gcPauses = Array.from(this.storeGcPausesMetrics.keys());
              result = this.storeGcPausesMetrics.get(gcPauses[0]);
              break;
            case "refresh":
              const type = message.type;
              const liveProcesses = Array.from(this.storeMemoryMetrics.keys());
              result = await stsApi.refreshLiveProcessMetricsData({
                processKey: liveProcesses[0].processKey,
                endpoint: "metrics",
                metricName: type
              });
              break;
          }
          if(result !== null) {
            webviewView.webview.postMessage({
              command: "displayGraph",
              payload: JSON.stringify(result),
            });
          }
        });
      }


    public update(result: any) {
      if (this._view) {
        this._view.show?.(true); // `show` is not implemented in 1.49 but is for 1.50 insiders
        this._view.webview.postMessage({
          command: "displayGraph",
          payload: JSON.stringify(result),
        });
      }
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

    public refreshLiveGcPausesMetrics(liveProcess: LocalLiveProcess, gcPausesMetricsDataRaw : Metrics[] | undefined) {
        if (gcPausesMetricsDataRaw === undefined) {
            // remove
            const targetLiveProcess = Array.from(this.storeGcPausesMetrics.keys()).find(lp => lp.processKey === liveProcess.processKey);
            if (targetLiveProcess) {
                this.storeGcPausesMetrics.delete(targetLiveProcess);
            }
        } else if (gcPausesMetricsDataRaw !== null) {
          // add/update
          const targetLiveProcess = Array.from(this.storeGcPausesMetrics.keys()).find(lp => lp.processKey === liveProcess.processKey) ?? new LiveProcess(liveProcess);
          const gcPausesMetrics = gcPausesMetricsDataRaw.map(raw => parseMetrticsData(liveProcess.processKey, raw));
          if(this.storeGcPausesMetrics.get(targetLiveProcess) !== undefined) {
            this.update(gcPausesMetrics);
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
          }
      } else if(memoryMetricsDataRaw.length !== null) {
          // add/update
          const targetLiveProcess = Array.from(this.storeMemoryMetrics.keys()).find(lp => lp.processKey === liveProcess.processKey) ?? new LiveProcess(liveProcess);
          const memoryMetrics = memoryMetricsDataRaw.map(raw => parseMetrticsData(liveProcess.processKey, raw));
          if(this.storeMemoryMetrics.get(targetLiveProcess) !== undefined) {
            this.update(memoryMetrics);
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