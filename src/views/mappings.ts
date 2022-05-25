
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { BootApp } from "../BootApp";
import { LiveProcess } from "../models/liveProcess";
import { getContextPath, getPort } from "../models/stsApi";
import { LocalLiveProcess } from "../types/sts-api";

interface Endpoint {
    // raw
    processKey: string;
    details?: any;
    handler: string;
    predicate: string;

    // parsed
    label: string;
    method?: string;
    pattern?: string;
}

interface StaticEndpoint {
    name: string;
    location: vscode.Location;

    // parsed
    label: string;
    method?: string;
    pattern?: string;
}

type TreeData = Endpoint | StaticEndpoint | LiveProcess | BootApp;
class MappingsDataProvider implements vscode.TreeDataProvider<TreeData> {
    private store: Map<LiveProcess, Endpoint[]> = new Map();
    private staticData: Map<BootApp, StaticEndpoint[]> = new Map();

    private onDidRefreshMappings: vscode.EventEmitter<TreeData | undefined> = new vscode.EventEmitter<TreeData | undefined>();

    constructor() {

    }

    onDidChangeTreeData = this.onDidRefreshMappings.event;

    getTreeItem(element: TreeData): vscode.TreeItem | Thenable<vscode.TreeItem> {
        if (element instanceof LiveProcess) {
            const item = new vscode.TreeItem(element.appName);
            item.description = `pid: ${element.pid}`;
            item.iconPath = new vscode.ThemeIcon("pulse", new vscode.ThemeColor("charts.green"));
            item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            item.contextValue = "liveProcess";
            return item;
        } else if (element instanceof BootApp) {
            const item = new vscode.TreeItem(element.name);
            item.iconPath = new vscode.ThemeIcon("pulse");
            item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            item.contextValue = "bootApp";
            return item;
        } else {
            const isLive = !!(element as Endpoint).processKey;
            const label = element.label;
            const item = new vscode.TreeItem(label);

            item.tooltip = (element as Endpoint).handler;
            item.collapsibleState = vscode.TreeItemCollapsibleState.None;
            const themeColor = isLive ? new vscode.ThemeColor("charts.green") : undefined;
            item.iconPath = new vscode.ThemeIcon("link", themeColor);

            item.contextValue = isLive ? "spring:endpoint" : "spring:staticEndpoint";
            if (element.method) {
                item.contextValue += `+${element.method}`;
            }

            item.command = {
                command: "spring.dashboard.endpoint.navigate",
                title: "Go to definition",
                arguments: [element]
            };

            return item;
        }
    }

    async getChildren(element?: TreeData): Promise<TreeData[] | undefined> {
        // top-level
        if (!element) {
            const liveProcesses = Array.from(this.store.keys());
            if (liveProcesses.length > 0) {
                return liveProcesses;
            } else {
                return Array.from(this.staticData.keys());
            }
        }

        // all mappings
        if (element instanceof LiveProcess) {
            return this.store.get(element);
        } else if (element instanceof BootApp) {
            return this.staticData.get(element);
        }

        return undefined;
    }

    public refresh(liveProcess: LocalLiveProcess, mappingsRaw: any[] | undefined) {
        if (mappingsRaw === undefined) {
            // remove
            const targetLiveProcess = Array.from(this.store.keys()).find(lp => lp.processKey === liveProcess.processKey);
            if (targetLiveProcess) {
                this.store.delete(targetLiveProcess);
            }
        } else {
            // add / update
            const targetLiveProcess = Array.from(this.store.keys()).find(lp => lp.processKey === liveProcess.processKey) ?? new LiveProcess(liveProcess);
            const mappings = mappingsRaw.map(raw => parseMapping(raw, liveProcess.processKey)).sort((a, b) => a.label.localeCompare(b.label));
            this.store.set(targetLiveProcess, mappings);
        }
        this.onDidRefreshMappings.fire(undefined);
    }

    public refreshStatic(app: BootApp, mappingsRaw: StaticEndpoint[]) {
        const mappings = mappingsRaw.map(raw => parseStaticMapping(raw)).sort((a, b) => a.label.localeCompare(b.label));
        this.staticData.set(app, mappings);
        this.onDidRefreshMappings.fire(undefined);
    }
}

function parseMapping(raw:any, processKey: string): Endpoint {
    const pattern = raw.data.map?.details?.map.requestMappingConditions?.map.patterns?.myArrayList?.[0];
    const method = raw.data.map?.details?.map.requestMappingConditions?.map.methods?.myArrayList?.[0];

    let label = pattern ?? raw.data.map?.predicate ?? "unknown";
    if (method) {
        label += ` [${method}]`;
    }
    return {
        processKey,
        label,
        method,
        pattern,
        ...raw.data.map
    };
}

function parseStaticMapping(raw:any): StaticEndpoint {
    const [pattern, method] = raw.name.replace(/^@/, "").split(" -- ");
    let label = pattern ?? "unknown";
    if (method) {
        label += ` [${method}]`;
    }
    return {
        label,
        method,
        pattern,
        ...raw
    };
}

export const mappingsProvider = new MappingsDataProvider();

export async function openEndpointHandler(endpoint: Endpoint) {
    const port = await getPort(endpoint.processKey);
    const contextPath = await getContextPath(endpoint.processKey) ?? "";
    const url = `http://localhost:${port}${contextPath}${endpoint.pattern}`;

    const openWithExternalBrowser: boolean = vscode.workspace.getConfiguration("spring.dashboard").get("openWith") === "external";
    const browserCommand: string = openWithExternalBrowser ? "vscode.open" : "simpleBrowser.api.open";
    vscode.commands.executeCommand(browserCommand, vscode.Uri.parse(url));
}
