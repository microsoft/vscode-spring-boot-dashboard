// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { BootApp } from "../BootApp";
import { LiveProcess } from "../models/liveProcess";
import { StaticBean } from "../models/StaticSymbolTypes";
import { getBeanDetail, getUrlOfBeanType } from "../models/stsApi";
import { LocalLiveProcess } from "../types/sts-api";

export class Bean {
    dependencies?: string[];
    scope?: string;
    type?: string;
    resource?: string;
    defined?: boolean; // whether it's defined in workspace

    constructor(
        public processKey: string,
        public id: string
    ) {}
}

class BeanProperty {
    constructor(public name: string, public value: string) {}

    public toString() {
        return `${this.name}: ${this.value}`;
    }
}


type TreeData = Bean | LiveProcess | StaticBean | BootApp | BeanProperty;
const COLOR_LIVE = new vscode.ThemeColor("charts.green");

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

    async getTreeItem(element: TreeData): Promise<vscode.TreeItem> {
        if (element instanceof LiveProcess) {
            const item = new vscode.TreeItem(element.appName);
            item.description = `pid: ${element.pid}`;
            item.iconPath = new vscode.ThemeIcon("circle-filled", COLOR_LIVE);
            item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            item.contextValue = "liveProcess";
            return item;
        } else if (element instanceof BootApp) {
            const item = new vscode.TreeItem(element.name);
            item.iconPath = new vscode.ThemeIcon("circle-outline");
            item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            item.contextValue = "bootApp";
            return item;
        } else if (element instanceof BeanProperty) {
            const item = new vscode.TreeItem(element.toString());
            item.iconPath = new vscode.ThemeIcon("note", COLOR_LIVE);
            return item;
        } else if (element instanceof Bean) {
            const label = element.id;
            const item = new vscode.TreeItem(label);
            item.collapsibleState = vscode.TreeItemCollapsibleState.None;
            item.iconPath = new vscode.ThemeIcon("spring-bean", COLOR_LIVE);
            item.contextValue = "spring:bean";
            const commandOnClick = "spring.dashboard.bean.open";
            item.command = {
                command: commandOnClick,
                title: "Open",
                arguments: [element]
            };

            const desc = [];
            if (!element.scope) {
                const details = await getBeanDetail(element.processKey, element.id);
                if (details?.length) {
                    element = {...element, ...details[0]} as Bean;
                }
            }
            if (element.scope) {
                desc.push(element.scope);
            }
            // highlight defined beans in "all" mode
            if (this.showAll && element.defined) {
                desc.push("defined");
            }
            item.description = desc.join(", ");
            return item;

        } else if (element instanceof StaticBean) {
            const label = element.label;
            const item = new vscode.TreeItem(label);

            item.collapsibleState = vscode.TreeItemCollapsibleState.None;
            item.iconPath = new vscode.ThemeIcon("spring-bean");
            item.contextValue = "spring:staticBean";
            const commandOnClick = "spring.dashboard.bean.navigate";

            item.command = {
                command: commandOnClick,
                title: "Open",
                arguments: [element]
            };
            return item;
        } else {
            throw new Error("Unsupported Tree Data Item");
        }
    }

    async getChildren(element?: TreeData): Promise<TreeData[] | undefined> {
        // top-level
        if (!element) {
            const ret = [];
            const liveProcesses = Array.from(this.store.keys());
            ret.push(...liveProcesses);
            // update context key
            vscode.commands.executeCommand("setContext", "spring.beans:hasLiveProcess", liveProcesses.length > 0);

            const staticApps = Array.from(this.staticData.keys());
            const appsWithoutLiveProcess = staticApps.filter(app => !liveProcesses.find(lp => lp.appName === app.name));
            ret.push(...appsWithoutLiveProcess);
            ret.sort((a, b) => ((a as LiveProcess).appName ?? (a as BootApp).name).localeCompare((b as LiveProcess).appName ?? (b as BootApp).name));
            return ret;
        }

        // all beans
        if (element instanceof LiveProcess) {
            const liveBeans =  this.store.get(element);
            // Workaround: Mark beans defined in workspace
            // TODO: inaccurate match with project name. should use some unique identifier like path.
            const correspondingApp = Array.from(this.staticData.keys()).find(app => app.name === element.appName);
            if (correspondingApp) {
                const staticBeans = this.staticData.get(correspondingApp);
                if (staticBeans?.length) {
                    const definedBeans = liveBeans?.filter(lb => staticBeans?.find(sb => sb.id === lb.id));
                    if (definedBeans) {
                        for (const bean of definedBeans) {
                            bean.defined = true;
                        }
                    }
                }
            }

            if (this.showAll) {
                return liveBeans;
            } else {
                return liveBeans?.filter(b => b.defined);
            }
        } else if (element instanceof BootApp) {
            return this.staticData.get(element);
        } else if (element instanceof Bean) {
            return undefined;
        }

        return undefined;
    }

    public refresh(item?: TreeData) {
        this.onDidRefreshBeans.fire(item);
    }

    public refreshLive(liveProcess: LocalLiveProcess, beanIds: string[] | undefined) {
        if (beanIds === undefined) {
            // remove
            const targetLiveProcess = Array.from(this.store.keys()).find(lp => lp.processKey === liveProcess.processKey);
            if (targetLiveProcess) {
                this.store.delete(targetLiveProcess);
            }
        } else {
            // add/update
            const targetLiveProcess = Array.from(this.store.keys()).find(lp => lp.processKey === liveProcess.processKey) ?? new LiveProcess(liveProcess);
            const beans = beanIds.map(b => new Bean(liveProcess.processKey, b)).sort((a, b) => a.id.localeCompare(b.id));
            this.store.set(targetLiveProcess, beans);
        }
        this.onDidRefreshBeans.fire(undefined);
    }

    public refreshStatic(app: BootApp, beansRaw: StaticBean[]) {
        this.updateStaticData(app, beansRaw);
        this.onDidRefreshBeans.fire(undefined);
    }

    public updateStaticData(app: BootApp, beansRaw: StaticBean[]) {
        const mappings = beansRaw.map(raw => new StaticBean(raw)).sort((a, b) => a.id.localeCompare(b.id));
        this.staticData.set(app, mappings);
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
        const uriString = await getUrlOfBeanType(bean.type);
        const line = uriString.split("#")[1];
        let range;
        if (line && line.match(/^[0-9]+$/)) {
            range = new vscode.Range(Number(line), 0, Number(line), 0);
        }
        if (uriString) {
            await vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(uriString), { preserveFocus: true, selection: range });
        }
    }
}
