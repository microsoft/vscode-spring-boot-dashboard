
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import {
    Uri,
    CancellationToken,
    Webview,
    WebviewView,
    WebviewViewProvider,
    WebviewViewResolveContext
} from "vscode";
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
    time: string;
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

class MemoryProvider implements WebviewViewProvider {
    public static readonly viewType = "memory.memoryView";
    private storeGcPausesMetrics: Map<LiveProcess, Metrics[][]> = new Map();
    private storeHeapMemoryMetrics: Map<LiveProcess, Metrics[][]> = new Map();
    private storeNonHeapMemoryMetrics: Map<LiveProcess, Metrics[][]> = new Map();
    private liveProcessList: Map<string, LiveProcess> = new Map();
    private _view?: vscode.WebviewView;

    private _extensionUrl: vscode.Uri;
    private _interval: number;
    private _maxDataPoints: number;

    constructor() {
        vscode.commands.executeCommand("setContext", "spring.memoryGraphs:showMode", "defined");
    }

    public get extensionUrl() {
        return this._extensionUrl;
    }

    public set extensionUrl(value) {
        this._extensionUrl = value;
    }

    public get interval() {
        return this._interval;
    }

    public set interval(value) {
        this._interval = value;
    }

    public get maxDataPoints() {
        return this._maxDataPoints;
    }

    public set maxDataPoints(value) {
        this._maxDataPoints = value;
    }

    public resolveWebviewView(
        webviewView: WebviewView,
        _context: WebviewViewResolveContext,
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

        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("spring.dashboard.memory-view.fetch-data.delay-in-milliseconds")) {
                this.interval = vscode.workspace.getConfiguration("spring.dashboard").get("memory-view.fetch-data.delay-in-milliseconds") ?? 5000;
            }
            if (e.affectsConfiguration("spring.dashboard.memory-view.display-data.max-datapoints")) {
                this.maxDataPoints = vscode.workspace.getConfiguration("spring.dashboard").get("memory-view.display-data.max-datapoints") ?? 10;
            }
            this.updateSettings();
        });

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
        const mainUri = getUri(webview, extensionUri, ["resources", "webview-ui", "main.js"]);
        const stylesUri = getUri(webview, extensionUri, ["resources", "webview-ui", "styles.css"]);
        const chartLibPath = getUri(webview, extensionUri, ["node_modules", "chart.js", "dist", "chart.min.js"]);
        const chartjsPath = getUri(webview, extensionUri, ["node_modules", "chartjs", "chart.js"]);
        const chartjsAdapterPath = getUri(webview, extensionUri, ["node_modules", "chartjs-adapter-moment", "dist", "chartjs-adapter-moment.min.js"]);
        const chartjsAdapterScipt = getUri(webview, extensionUri, ["node_modules", "chartjs-adapter-moment", "dist", "chartjs-adapter-moment.js"]);
        const momentLibPath = getUri(webview, extensionUri, ["node_modules", "moment", "moment.js"]);

        this.interval = vscode.workspace.getConfiguration("spring.dashboard").get("memory-view.fetch-data.delay-in-milliseconds") ?? 5000;
        this.maxDataPoints = vscode.workspace.getConfiguration("spring.dashboard").get("memory-view.display-data.max-datapoints") ?? 10;

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
                        <script type="text/javascript"> var interval = ${this.interval}; </script>
                        <script type="text/javascript"> var maxDataPoints = ${this.maxDataPoints}; </script>
                        <link rel="stylesheet" href="${stylesUri}">
                        <title>Weather Checker</title>
                    </head>
              <body style="padding: 10px">
              <div class="chart-container" style="position: relative;" height="350">
                <canvas id="chart" height="350"></canvas>
              </div>
              <section class="search-container">
                <vscode-dropdown id="process">
                </vscode-dropdown>
              </section>
              <br>
              <section class="search-container">
                <vscode-dropdown id="graphType">
                  <vscode-option value="memory">Heap Memory</vscode-option>
                  <vscode-option value="memory">Non Heap Memory</vscode-option>
                  <vscode-option value="gcPauses">Gc Pauses</vscode-option>
                  <vscode-option value="gcPauses">Garbage Collections</vscode-option>
                </vscode-dropdown>
              <br>
               </body>
            </html>
            `;
    }

    private _setWebviewMessageListener(webviewView: WebviewView) {
        webviewView.webview.onDidReceiveMessage(async (message) => {
            const command = message.command;
            let processKey = message.processKey;
            switch (command) {
                case "LoadMetrics":
                    if (processKey !== '' && processKey !== undefined) {
                        await stsApi?.refreshLiveProcessMetricsData({
                            processKey: processKey,
                            endpoint: "metrics",
                            metricName: "memory",
                        });

                        await stsApi?.refreshLiveProcessMetricsData({
                            processKey: processKey,
                            endpoint: "metrics",
                            metricName: "gcPauses",
                            tags: ""
                        });
                    }
                    break;
                case "LoadProcess":
                    this.addLiveProcess(Array.from(this.liveProcessList.values()));
                    this.updateSettings();
                    break;
                case "FetchData": {
                    const type = message.type;
                    if (processKey === '') {
                        processKey = this.liveProcessList.values().next().value.liveProcess.processKey;
                    }
                    if (type !== '' && type === "Heap Memory" && processKey !== undefined && processKey !== '') {
                        const targetLiveProcess = Array.from(this.storeHeapMemoryMetrics.keys()).find(lp => lp.processKey === processKey) ?? new LiveProcess(processKey);
                        this.updateGraph(this.storeHeapMemoryMetrics.get(targetLiveProcess));
                    } else if (type !== '' && type === "Non Heap Memory" && processKey !== undefined && processKey !== '') {
                        const targetLiveProcess = Array.from(this.storeNonHeapMemoryMetrics.keys()).find(lp => lp.processKey === processKey) ?? new LiveProcess(processKey);
                        this.updateGraph(this.storeNonHeapMemoryMetrics.get(targetLiveProcess));
                    } else if (type !== '' && processKey !== '' && processKey !== undefined && (type === "Gc Pauses" || type === "Garbage Collections")) {
                        const targetLiveProcess = Array.from(this.storeGcPausesMetrics.keys()).find(lp => lp.processKey === processKey) ?? new LiveProcess(processKey);
                        this.updateGraph(this.storeGcPausesMetrics.get(targetLiveProcess));
                    }
                    break;
                }
                default:
            }
        });
    }

    public updateGraph(result: any) {
        if (this._view && result !== undefined) {
            this._view.webview.postMessage({
                command: "displayGraph",
                payload: JSON.stringify(result),
                interval: this.interval,
                maxDataPoints: this.maxDataPoints
            });
        }
    }

    public updateSettings() {
        if (this._view) {
            this._view.webview.postMessage({
                command: "updateSettings",
                interval: this.interval,
                maxDataPoints: this.maxDataPoints
            });
        }
    }

    public addLiveProcess(liveProcess: any) {
        const processList = [];
        if (liveProcess !== '' && liveProcess !== undefined && Array.isArray(liveProcess)) {
            for (const proc of liveProcess) {
                processList.push({
                    processKey: proc.liveProcess.processKey,
                    pid: proc.liveProcess.pid,
                    appName: proc.appName
                });
            }
        } else if (liveProcess !== '' && liveProcess !== undefined) {
            processList.push({
                processKey: liveProcess.processKey,
                pid: liveProcess.pid,
                appName: liveProcess.appName
            });
        }
        if (this._view) {
            this._view.webview.postMessage({
                command: "displayProcess",
                process: processList,
            });
        }
    }

    public addLiveProcessInfo(process: LiveProcess) {
        if (!this.liveProcessList.get(process.processKey)) {
            this.liveProcessList.set(process.processKey, process);
            this.addLiveProcess(process);
        }
    }

    public removeLiveProcessInfo(process: LiveProcess) {
        if (this.liveProcessList.get(process.processKey)) {
            this.liveProcessList.delete(process.processKey);
            if (this._view) {
                this._view.webview.postMessage({
                    command: "removeProcess",
                    process: JSON.stringify(process),
                });
            }
        }
    }

    private removeOldData(metrics: any, latestMetrics: Metrics[]) {
        if (metrics !== undefined) {
            metrics.push(latestMetrics);
        }
        while (metrics !== undefined && metrics.length > this.maxDataPoints) {
            metrics.shift();
        }
    }

    public refreshLiveGcPausesMetrics(liveProcess: LocalLiveProcess, gcPausesMetricsDataRaw: Metrics[] | undefined) {
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
            if (this.storeGcPausesMetrics.get(targetLiveProcess) === undefined) {
                this.addLiveProcessInfo(targetLiveProcess);
                this.storeGcPausesMetrics.set(targetLiveProcess, [gcPausesMetrics]);
            } else {
                const metrics = this.storeGcPausesMetrics.get(targetLiveProcess);
                this.removeOldData(metrics, gcPausesMetrics);
            }
        }
    }

    public refreshLiveHeapMemoryMetrics(liveProcess: LocalLiveProcess, memoryMetricsDataRaw: Metrics[] | undefined) {
        if (memoryMetricsDataRaw === undefined) {
            // remove
            const targetLiveProcess = Array.from(this.storeHeapMemoryMetrics.keys()).find(lp => lp.processKey === liveProcess.processKey);
            if (targetLiveProcess) {
                this.storeHeapMemoryMetrics.delete(targetLiveProcess);
                this.removeLiveProcessInfo(targetLiveProcess);
            }
        } else if (memoryMetricsDataRaw.length !== null) {
            // add/update
            const targetLiveProcess = Array.from(this.storeHeapMemoryMetrics.keys()).find(lp => lp.processKey === liveProcess.processKey) ?? new LiveProcess(liveProcess);
            const memoryMetrics = memoryMetricsDataRaw.map(raw => parseMetrticsData(liveProcess.processKey, raw));
            if (this.storeHeapMemoryMetrics.get(targetLiveProcess) === undefined) {
                this.addLiveProcessInfo(targetLiveProcess);
                this.storeHeapMemoryMetrics.set(targetLiveProcess, [memoryMetrics]);
            } else {
                const metrics = this.storeHeapMemoryMetrics.get(targetLiveProcess);
                this.removeOldData(metrics, memoryMetrics);
            }
        }
    }

    public refreshLiveNonHeapMemoryMetrics(liveProcess: LocalLiveProcess, memoryMetricsDataRaw: Metrics[] | undefined) {
        if (memoryMetricsDataRaw === undefined) {
            // remove
            const targetLiveProcess = Array.from(this.storeNonHeapMemoryMetrics.keys()).find(lp => lp.processKey === liveProcess.processKey);
            if (targetLiveProcess) {
                this.storeNonHeapMemoryMetrics.delete(targetLiveProcess);
                this.removeLiveProcessInfo(targetLiveProcess);
            }
        } else if (memoryMetricsDataRaw.length !== null) {
            // add/update
            const targetLiveProcess = Array.from(this.storeNonHeapMemoryMetrics.keys()).find(lp => lp.processKey === liveProcess.processKey) ?? new LiveProcess(liveProcess);
            const memoryMetrics = memoryMetricsDataRaw.map(raw => parseMetrticsData(liveProcess.processKey, raw));
            if (this.storeNonHeapMemoryMetrics.get(targetLiveProcess) === undefined) {
                this.addLiveProcessInfo(targetLiveProcess);
                this.storeNonHeapMemoryMetrics.set(targetLiveProcess, [memoryMetrics]);
            } else {
                const metrics = this.storeNonHeapMemoryMetrics.get(targetLiveProcess);
                this.removeOldData(metrics, memoryMetrics);
            }
        }
    }
}
export const memoryProvider = new MemoryProvider();

function parseMetrticsData(processKey: string, raw: any): Metrics {
    const label = raw.name;
    const description = raw.description;
    const baseUnit = raw.baseUnit;
    const measurements = raw.measurements;
    const availableTags = raw.availableTags;
    const time = timestamp();
    return {
        processKey,
        time,
        label,
        description,
        baseUnit,
        measurements,
        availableTags,
        ...raw
    };
}

function timestamp() {
    const date = new Date().toTimeString();
    const chop = date.indexOf(' ');
    return date.substr(0, chop);
}

export function getUri(webview: Webview, extensionUri: Uri, pathList: string[]) {
    return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList));
}
