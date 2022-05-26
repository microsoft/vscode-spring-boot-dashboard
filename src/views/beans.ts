// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { BootApp } from "../BootApp";
import { getPathToExtensionRoot } from "../contextUtils";
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

interface StaticBean {
    name: string;
    location: vscode.Location;

    id: string;
}

type TreeData = Bean | LiveProcess | StaticBean | BootApp;

class BeansDataProvider implements vscode.TreeDataProvider<TreeData> {
    private store: Map<LiveProcess, Bean[]> = new Map();
    private staticData: Map<BootApp, StaticBean[]> = new Map();

    private _showAll: boolean = false;

    private onDidRefreshBeans: vscode.EventEmitter<TreeData | undefined> = new vscode.EventEmitter<TreeData | undefined>();

    constructor() {
        vscode.commands.executeCommand("setContext", "spring.beans:showMode", "defined");
    }

    public get showAll(): boolean {
        return this._showAll;
    }

    public set showAll(value: boolean) {
        this._showAll = value;
        vscode.commands.executeCommand("setContext", "spring.beans:showMode", this._showAll ? "all" : "defined");
        this.onDidRefreshBeans.fire(undefined);
    }

    onDidChangeTreeData = this.onDidRefreshBeans.event;

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
            const isLive = !!(element as Bean).processKey;
            const label = element.id;

            const item = new vscode.TreeItem(label);
            item.collapsibleState = vscode.TreeItemCollapsibleState.None;
            if (isLive) {
                item.iconPath = getPathToExtensionRoot("resources", "bean-live.svg");
            } else {
                item.iconPath = {
                    light: getPathToExtensionRoot("resources", "bean-light.svg"),
                    dark: getPathToExtensionRoot("resources", "bean-dark.svg")
                };
            }

            item.contextValue = isLive ? "spring:bean" : "spring:staticBean";

            item.command = {
                command: isLive ? "spring.dashboard.bean.open" : "spring.dashboard.bean.navigate",
                title: "Open",
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

        // all beans
        if (element instanceof LiveProcess) {
            const liveBeans =  this.store.get(element);
            if (this.showAll) {
                return liveBeans;
            } else {
                // TODO: inaccurate match with project name. should use some unique identifier like path.
                const correspondingApp = Array.from(this.staticData.keys()).find(app => app.name === element.appName);
                if (correspondingApp) {
                    const staticBeans = this.staticData.get(correspondingApp);
                    return liveBeans?.filter(lb => staticBeans?.find(sb => sb.id === lb.id));
                }
            }
        } else if (element instanceof BootApp) {
            return this.staticData.get(element);
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

    public refreshStatic(app: BootApp, mappingsRaw: StaticBean[]) {
        const mappings = mappingsRaw.map(raw => parseStaticBean(raw)).sort((a, b) => a.id.localeCompare(b.id));
        this.staticData.set(app, mappings);
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

function parseStaticBean(raw:any): StaticBean {
    const m = (raw.name as string).match(/^@\+ '(.+?)'/);
    let id = m ? m[1] : "unknown";

    return {
        id,
        ...raw
    };
}
