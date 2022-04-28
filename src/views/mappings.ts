
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import {  } from "../models/stsApi";


interface Mapping {
    processKey: string;
    label: string;
    details?: any;
    handler: string;
    predicate: string;
}

class LiveProcess {
    constructor(public processKey: string) { }
}

class MappingsDataProvider implements vscode.TreeDataProvider<Mapping | LiveProcess> {
    private store: Map<LiveProcess, Mapping[]> = new Map();

    private onDidRefreshMappings: vscode.EventEmitter<Mapping | LiveProcess | undefined> = new vscode.EventEmitter<Mapping | LiveProcess | undefined>();

    constructor() {

    }

    onDidChangeTreeData = this.onDidRefreshMappings.event;

    getTreeItem(element: Mapping | LiveProcess): vscode.TreeItem | Thenable<vscode.TreeItem> {
        if (element instanceof LiveProcess) {
            const item = new vscode.TreeItem(element.processKey);
            item.iconPath = new vscode.ThemeIcon("pulse");
            item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            item.contextValue = "liveProcess";
            return item;
        } else {
            const label = getLabel(element);
            const item = new vscode.TreeItem(label);

            item.tooltip = element.handler;
            item.collapsibleState = vscode.TreeItemCollapsibleState.None;
            item.iconPath = new vscode.ThemeIcon("link");

            // for debug use
            item.command = {
                command: "_spring.console.log",
                title: "console.log",
                arguments: [element]
            };

            return item;
        }
    }

    async getChildren(element?: Mapping | LiveProcess): Promise<LiveProcess[] | Mapping[] | undefined> {
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

    public refresh(processKey: string, mappingsRaw: any[] | undefined) {
        if (mappingsRaw === undefined) {
            // remove
            const targetLiveProcess = Array.from(this.store.keys()).find(lp => lp.processKey === processKey);
            if (targetLiveProcess) {
                this.store.delete(targetLiveProcess);
            }
        } else {
            // add / update
            const targetLiveProcess = Array.from(this.store.keys()).find(lp => lp.processKey === processKey) ?? new LiveProcess(processKey);
            const mappings = mappingsRaw.map(m => { return { processKey, label: getLabel(m.data.map), ...m.data.map } }).sort((a, b) => a.label.localeCompare(b.label));
            this.store.set(targetLiveProcess, mappings);
        }
        this.onDidRefreshMappings.fire(undefined);
    }

}

function getLabel(mapping: Mapping): string {
    const pattern = mapping.details?.map.requestMappingConditions?.map.patterns?.myArrayList?.[0];
    const method = mapping.details?.map.requestMappingConditions?.map.methods?.myArrayList?.[0];
    let label = pattern ?? mapping.predicate;
    if (method) {
        label += ` [${method}]`;
    }
    return label;
}

export const mappingsProvider = new MappingsDataProvider();
