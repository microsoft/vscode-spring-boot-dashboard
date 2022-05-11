
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
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

class MappingsDataProvider implements vscode.TreeDataProvider<Endpoint | LiveProcess> {
    private store: Map<LiveProcess, Endpoint[]> = new Map();

    private onDidRefreshMappings: vscode.EventEmitter<Endpoint | LiveProcess | undefined> = new vscode.EventEmitter<Endpoint | LiveProcess | undefined>();

    constructor() {

    }

    onDidChangeTreeData = this.onDidRefreshMappings.event;

    getTreeItem(element: Endpoint | LiveProcess): vscode.TreeItem | Thenable<vscode.TreeItem> {
        if (element instanceof LiveProcess) {
            const item = new vscode.TreeItem(element.appName);
            item.description = `pid: ${element.pid}`;
            item.iconPath = new vscode.ThemeIcon("pulse", new vscode.ThemeColor("charts.green"));
            item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            item.contextValue = "liveProcess";
            return item;
        } else {
            const label = element.label;
            const item = new vscode.TreeItem(label);

            item.tooltip = element.handler;
            item.collapsibleState = vscode.TreeItemCollapsibleState.None;
            item.iconPath = new vscode.ThemeIcon("link");

            item.contextValue = "spring:endpoint";
            if (element.method) {
                item.contextValue += `+${element.method}`;
            }

            // for debug use
            // item.command = {
            //     command: "_spring.console.log",
            //     title: "console.log",
            //     arguments: [element]
            // };

            return item;
        }
    }

    async getChildren(element?: Endpoint | LiveProcess): Promise<LiveProcess[] | Endpoint[] | undefined> {
        // top-level
        if (!element) {
            return Array.from(this.store.keys());
        }

        // all mappings
        if (element instanceof LiveProcess) {
            return this.store.get(element);
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

export const mappingsProvider = new MappingsDataProvider();

export async function openEndpointHandler(endpoint: Endpoint) {
    const port = await getPort(endpoint.processKey);
    const contextPath = await getContextPath(endpoint.processKey);
    const url = `http://localhost:${port}${contextPath}${endpoint.pattern}`;

    const openWithExternalBrowser: boolean = vscode.workspace.getConfiguration("spring.dashboard").get("openWith") === "external";
    const browserCommand: string = openWithExternalBrowser ? "vscode.open" : "simpleBrowser.api.open";
    vscode.commands.executeCommand(browserCommand, vscode.Uri.parse(url));
}
