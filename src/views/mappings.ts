
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

class MappingsDataProvider implements vscode.TreeDataProvider<Mapping> {
    private mappings: Mapping[] = [];

    private onDidRefreshMappings: vscode.EventEmitter<Mapping | undefined> = new vscode.EventEmitter<Mapping | undefined>();

    constructor() {

    }

    onDidChangeTreeData = this.onDidRefreshMappings.event;

    getTreeItem(element: Mapping): vscode.TreeItem | Thenable<vscode.TreeItem> {
        const label = getLabel(element);
        const item = new vscode.TreeItem(label);

        item.tooltip = element.handler;
        item.collapsibleState = vscode.TreeItemCollapsibleState.None;
        item.command = {
            command: "_spring.console.log",
            title: "console.log",
            arguments: [element]
        };

        // item.iconPath = new vscode.ThemeIcon("symbol-class");
        return item;
    }

    async getChildren(element?: Mapping): Promise<Mapping[] | undefined> {
        // top-level
        if (!element) {
            return this.mappings; // all beans
        }

        return undefined;
    }

    public refresh(processKey: string, mappingsRaw: any[]) {
        this.mappings = mappingsRaw.map(m => { return { processKey, label: getLabel(m.data.map), ...m.data.map } }).sort((a, b) => a.label.localeCompare(b.label));
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
