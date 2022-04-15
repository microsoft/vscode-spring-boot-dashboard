// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { beansDependingOn } from "../stsApi";


interface Bean {
    processKey: string;
    id: string;
    dependents?: Bean[];
}

export class BeansDataProvider implements vscode.TreeDataProvider<Bean> {
    private beans: Bean[] = [];

    private onDidRefreshBeans: vscode.EventEmitter<Bean | undefined> = new vscode.EventEmitter<Bean | undefined>();

    constructor() {

    }

    onDidChangeTreeData = this.onDidRefreshBeans.event;

    getTreeItem(element: Bean): vscode.TreeItem | Thenable<vscode.TreeItem> {
        const item = new vscode.TreeItem(element.id);
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        item.iconPath = new vscode.ThemeIcon("symbol-class");
        return item;
    }

    async getChildren(element?: Bean): Promise<Bean[] | undefined> {
        // top-level
        if (!element) {
            return this.beans; // all beans
        }

        const beans = await beansDependingOn(element.processKey, element.id);
        element.dependents = beans.map((b:any) => {return {processKey: element.processKey, ...b}});
        return element.dependents;

    }

    public refresh(processKey: string, beans: string[]) {
        this.beans = beans.map(b => { return { processKey, id: b } }).sort((a, b) => a.id.localeCompare(b.id));
        this.onDidRefreshBeans.fire(undefined);
    }

}