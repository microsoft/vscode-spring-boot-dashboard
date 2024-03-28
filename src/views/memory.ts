
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { LiveProcess } from "../models/liveProcess";
import { refreshMetrics } from "../models/stsApi";
import * as sts from "../types/sts-api";

interface Measurement {
    statistic: string;
    value: unknown;
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

export class MemoryViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = "spring.memoryView";
    private storeGcPausesMetrics: Map<LiveProcess, Metrics[][]> = new Map();
    private storeHeapMemoryMetrics: Map<LiveProcess, Metrics[][]> = new Map();
    private storeNonHeapMemoryMetrics: Map<LiveProcess, Metrics[][]> = new Map();
    private storeLiveProcesses: Map<string, LiveProcess> = new Map();

    private _view?: vscode.WebviewView;

    public interval: number;
    public maxDataPoints: number;

    constructor(
        private context: vscode.ExtensionContext
    ) { }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken) {

        this._view = webviewView;

        // Allow scripts in the webview
        webviewView.webview.options = {
            enableScripts: true,
        };
        // Set the HTML content that will fill the webview view
        webviewView.webview.html = this._getWebviewContent(webviewView.webview, this.context.extensionUri);
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

    private _getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
        const toolkitUri = getUri(webview, extensionUri, ["dist", "memoryViewAssets", "@vscode", "webview-ui-toolkit", "dist", "toolkit.js"]);
        const mainUri = getUri(webview, extensionUri, ["resources", "webview-ui", "main.js"]);
        const stylesUri = getUri(webview, extensionUri, ["resources", "webview-ui", "styles.css"]);
        const chartLibPath = getUri(webview, extensionUri, ["dist", "memoryViewAssets", "chart.js", "dist", "chart.min.js"]);
        const chartjsPath = getUri(webview, extensionUri, ["dist", "memoryViewAssets", "chartjs", "chart.js"]);
        const chartjsAdapterPath = getUri(webview, extensionUri, ["dist", "memoryViewAssets", "chartjs-adapter-moment", "dist", "chartjs-adapter-moment.min.js"]);
        const chartjsAdapterScipt = getUri(webview, extensionUri, ["dist", "memoryViewAssets", "chartjs-adapter-moment", "dist", "chartjs-adapter-moment.js"]);
        const momentLibPath = getUri(webview, extensionUri, ["dist", "memoryViewAssets", "moment", "moment.js"]);

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
                    <link rel="stylesheet" href="${stylesUri}" />
                    <title>Weather Checker</title>
                </head>
                <body style="padding: 10px">
                    <div class="chart-container" style="position: relative;" height="350">
                        <canvas id="chart" height="350"></canvas>
                    </div>
                    <section class="search-container">
                        <vscode-dropdown id="dropdown-processList"></vscode-dropdown>
                    </section>
                    <section class="search-container">
                        <vscode-dropdown id="graphType">
                            <vscode-option value="memory">Heap Memory</vscode-option>
                            <vscode-option value="memory">Non Heap Memory</vscode-option>
                            <vscode-option value="gcPauses">Gc Pauses</vscode-option>
                            <vscode-option value="gcPauses">Garbage Collections</vscode-option>
                        </vscode-dropdown>
                    </section>
                </body>
            </html>
            `;
    }

    private _setWebviewMessageListener(webviewView: vscode.WebviewView) {
        webviewView.webview.onDidReceiveMessage(async (message) => {
            const command = message.command;
            let processKey = message.processKey;
            switch (command) {
                case "LoadMetrics":
                    if (processKey !== '' && processKey !== undefined) {
                        await refreshMetrics(processKey, "memory");
                        await refreshMetrics(processKey, "gcPauses");
                    }
                    break;
                case "LoadProcess":
                    this.addLiveProcesses(Array.from(this.storeLiveProcesses.values()));
                    this.updateSettings();
                    break;
                case "FetchData": {
                    const type = message.type;
                    if (processKey === '') {
                        processKey = this.storeLiveProcesses.values().next().value.liveProcess?.processKey;
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

    public updateGraph(result: Metrics[][] | undefined) {
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

    private addLiveProcesses(liveProcessList: LiveProcess[]) {
        const ret = [];

        for (const proc of liveProcessList) {
            ret.push({
                processKey: proc.processKey,
                pid: proc.pid,
                appName: proc.appName,
                type: proc.type,
                remoteAppName: proc.remoteAppName
            });
        }

        if (this._view) {
            this._view.webview.postMessage({
                command: "displayProcess",
                processes: ret,
            });
        }
    }

    private addLiveProcess(process: LiveProcess) {
        if (!this.storeLiveProcesses.get(process.processKey)) {
            this.storeLiveProcesses.set(process.processKey, process);
            this.addLiveProcesses([process]);
        }
    }

    private removeLiveProcess(process: LiveProcess) {
        if (this.storeLiveProcesses.get(process.processKey)) {
            this.storeLiveProcesses.delete(process.processKey);
            if (this._view) {
                this._view.webview.postMessage({
                    command: "removeProcess",
                    process: JSON.stringify(process),
                });
            }
        }
    }

    /**
     * Keep at most `maxDataPoints` data points.
     * @param metrics
     * @param latestMetrics
     */
    private rotateMetrics(metrics: Metrics[][], latestMetrics: Metrics[]) {
        metrics.push(latestMetrics);
        while (metrics.length > this.maxDataPoints) {
            metrics.shift();
        }
    }

    /**
     *
     * @param liveProcess
     * @param category
     * @param metricsRaw value of metrics.
     * - empty array: initialize.
     * - non-empty array: valid data.
     * - undefined: remove on disconnected.
     * @returns
     */
    public refreshLiveMetrics(liveProcess: sts.LiveProcessPayload, category: "heap" | "non-heap" | "gc-pauses", metricsRaw: unknown) {
        let store;
        switch (category) {
            case "heap":
                store = this.storeHeapMemoryMetrics;
                break;
            case "non-heap":
                store = this.storeNonHeapMemoryMetrics;
                break;
            case "gc-pauses":
                store = this.storeGcPausesMetrics;
                break;
            default:
        }
        if (!store) {
            return;
        }

        if (metricsRaw === undefined || metricsRaw === null) {
            // remove
            const targetLiveProcess = Array.from(store.keys()).find(lp => lp.processKey === liveProcess.processKey);
            if (targetLiveProcess) {
                store.delete(targetLiveProcess);
                this.removeLiveProcess(targetLiveProcess);
            }
        } else if (metricsRaw instanceof Array) {
            if (metricsRaw.length === 0) {
                // add
                const targetLiveProcess = Array.from(store.keys()).find(lp => lp.processKey === liveProcess.processKey) ?? new LiveProcess(liveProcess);
                if (!store.has(targetLiveProcess)) {
                    this.addLiveProcess(targetLiveProcess);
                    store.set(targetLiveProcess, []);
                }
            } else {
                // update
                const targetLiveProcess = Array.from(store.keys()).find(lp => lp.processKey === liveProcess.processKey);
                if (targetLiveProcess) {
                    const metrics = store.get(targetLiveProcess);
                    if (metrics !== undefined) {
                        const latestMetrics = metricsRaw.map(raw => parseMetrticsData(liveProcess.processKey, raw));
                        this.rotateMetrics(metrics, latestMetrics);
                    }
                }
            }
        } else {
            console.warn("Raw metrics is of unsupported type.");
        }
    }
}

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
    return date.substring(0, chop);
}

export function getUri(webview: vscode.Webview, extensionUri: vscode.Uri, pathList: string[]) {
    return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathList));
}
