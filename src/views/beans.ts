// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { LiveProcess } from "../models/liveProcess";
import { getBeanDetail } from "../models/stsApi";
import { LocalLiveProcess } from "../types/sts-api";

interface Bean {
    processKey: string;
    id: string;
    dependents?: Bean[];
    scope?: string;
    type?: string;
    resource?: string;
}

class BeansDataProvider implements vscode.TreeDataProvider<Bean | LiveProcess> {
    private store: Map<LiveProcess, Bean[]> = new Map();

    private onDidRefreshBeans: vscode.EventEmitter<Bean | LiveProcess | undefined> = new vscode.EventEmitter<Bean | LiveProcess | undefined>();

    constructor() {

    }

    onDidChangeTreeData = this.onDidRefreshBeans.event;

    getTreeItem(element: Bean | LiveProcess): vscode.TreeItem | Thenable<vscode.TreeItem> {
        if (element instanceof LiveProcess) {
            const item = new vscode.TreeItem(element.appName);
            item.description = `pid: ${element.pid}`;
            item.iconPath = new vscode.ThemeIcon("pulse", new vscode.ThemeColor("charts.green"));
            item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            item.contextValue = "liveProcess";
            return item;
        } else {
            const item = new vscode.TreeItem(element.id);
            item.collapsibleState = vscode.TreeItemCollapsibleState.None;
            item.iconPath = new vscode.ThemeIcon("symbol-class");

            item.contextValue = "spring:bean";
            // for debug use
            // item.command = {
            //     command: "_spring.console.log",
            //     title: "console.log",
            //     arguments: [element]
            // };
            return item;
        }
    }

    async getChildren(element?: Bean | LiveProcess): Promise<LiveProcess[] | Bean[] | undefined> {
        // top-level
        if (!element) {
            return Array.from(this.store.keys());
        }

        // all beans
        if (element instanceof LiveProcess) {
            return this.store.get(element);
        }

        /*
        TODO: should move to reference view
            // dependencies
            const beans = await getBeansDependingOn(element.processKey, element.id);
            element.dependents = beans.map((b:any) => {return {processKey: element.processKey, ...b}});
            return element.dependents;
        */
        return undefined;
    }

    public refresh(liveProcess: LocalLiveProcess, beanIds: string[] | undefined) {
        if (beanIds === undefined) {
            // remove
            const targetLiveProcess = Array.from(this.store.keys()).find(lp => lp.processKey === liveProcess.processKey);
            if (targetLiveProcess) {
                this.store.delete(targetLiveProcess);
            }
        } else {
            // add/update
            const targetLiveProcess = Array.from(this.store.keys()).find(lp => lp.processKey === liveProcess.processKey) ?? new LiveProcess(liveProcess);
            const beans = beanIds.map(b => { return { processKey: liveProcess.processKey, id: b }; }).sort((a, b) => a.id.localeCompare(b.id));
            this.store.set(targetLiveProcess, beans);
        }
        this.onDidRefreshBeans.fire(undefined);
    }

}

export const beansProvider = new BeansDataProvider();

export async function openBeanHandler(bean: Bean) {
    // TODO: extract logic in sts.java.javadocHoverLink into jdtls as a utility
    if (!bean.type) {
        const details = await getBeanDetail(bean.processKey, bean.id);
        if (details && details.length > 0) {
            bean = { ...bean, ...details[0] };
        }
    }

    if (bean.type) {
        const bindingKey = `L${bean.type.replace(/\./g, "/")};`;
        const uriString = await vscode.commands.executeCommand<string>("sts.java.javadocHoverLink", {
            bindingKey,
            lookInOtherProjects: true
        });
        if (uriString) {
            await vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(uriString));
            return;
        }
    }

    vscode.window.showWarningMessage(`Fail to open bean. ${JSON.stringify(bean)}`);
}
