
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { BootApp } from "../BootApp";
import { initSymbols } from "../controllers/SymbolsController";
import { LiveProcess } from "../models/liveProcess";
import { StaticEndpoint } from "../models/StaticSymbolTypes";
import { getContextPath, getPort } from "../models/stsApi";
import { locationEquals } from "../symbolUtils";
import * as sts from "../types/sts-api";
import { constructOpenUrl } from "../utils";

export class Endpoint {
    // raw
    processKey: string;
    rawDataMap: any;

    corresponding?: StaticEndpoint; // whether it's defined in workspace
    liveProcess?: LiveProcess;

    constructor(
        processKey: string,
        rawDataMap?: any
    ) {
        this.processKey = processKey;
        this.rawDataMap = rawDataMap;
    }

    get pattern(): string | undefined {
        return this.rawDataMap?.details?.map?.requestMappingConditions?.map?.patterns?.myArrayList?.[0];
    }

    get method(): string | undefined {
        return this.rawDataMap?.details?.map?.requestMappingConditions?.map?.methods?.myArrayList?.[0];
    }

    get label(): string {
        let label = this.pattern ?? this.predicate ?? "unknown";
        if (this.method) {
            label += ` [${this.method}]`;
        }
        return label;
    }

    get predicate(): string | undefined {
        return this.rawDataMap?.predicate;
    }

    get details(): any {
        return this.rawDataMap.details;
    }

    get handler(): string {
        return this.rawDataMap.handler;
    }
}


type TreeData = Endpoint | StaticEndpoint | LiveProcess | BootApp;
export class MappingsDataProvider implements vscode.TreeDataProvider<TreeData> {

    private store: Map<LiveProcess, Endpoint[]> = new Map();
    private staticData: Map<BootApp, StaticEndpoint[]> = new Map();

    private _showAll = false;

    private onDidRefreshMappings: vscode.EventEmitter<TreeData | undefined> = new vscode.EventEmitter<TreeData | undefined>();

    constructor() {
        vscode.commands.executeCommand("setContext", "spring.mappings:showMode", "defined");
    }

    public get showAll(): boolean {
        return this._showAll;
    }

    public set showAll(value: boolean) {
        this._showAll = value;
        vscode.commands.executeCommand("setContext", "spring.mappings:showMode", this._showAll ? "all" : "defined");
        this.onDidRefreshMappings.fire(undefined);
    }

    onDidChangeTreeData = this.onDidRefreshMappings.event;

    getTreeItem(element: TreeData): vscode.TreeItem | Thenable<vscode.TreeItem> {
        if (element instanceof LiveProcess) {
            return element.toTreeItem();
        } else if (element instanceof BootApp) {
            const item = new vscode.TreeItem(element.name);
            item.iconPath = element.iconPath;
            item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;

            item.contextValue = `bootApp+${element.state}`;
            if (!element.isActuatorOnClasspath){
                item.contextValue += "+noActuator";
            }
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

            // highlight defined beans in "all" mode
            if (this.showAll && (element as any).corresponding) {
                item.description = "(defined)";
            }
            return item;
        }
    }

    async getChildren(element?: TreeData): Promise<TreeData[] | undefined> {
        // top-level
        if (!element) {
            const ret = [];
            const liveProcesses = Array.from(this.store.keys());
            ret.push(...liveProcesses);
            // update context key
            vscode.commands.executeCommand("setContext", "spring.mappings:hasLiveProcess", liveProcesses.length > 0);

            // Workaround to force update symbols info in case STS previous returns broken data.
            await initSymbols(5000);

            const staticApps = Array.from(this.staticData.keys());
            const appsWithoutLiveProcess = staticApps.filter(app => !liveProcesses.find(lp => lp.appName === app.name));
            ret.push(...appsWithoutLiveProcess);
            ret.sort((a, b) => ((a as LiveProcess).appName ?? (a as BootApp).name).localeCompare((b as LiveProcess).appName ?? (b as BootApp).name));
            return ret;
        }

        // all mappings
        if (element instanceof LiveProcess) {
            const liveMappings = this.store.get(element);
            liveMappings?.forEach(lm => lm.liveProcess = element);
            // TODO: inaccurate match with project name. should use some unique identifier like path.
            const correspondingApp = Array.from(this.staticData.keys()).find(app => app.name === element.appName);
            const fullList = liveMappings;
            if (correspondingApp) {
                const staticMappings = this.staticData.get(correspondingApp);
                if (staticMappings?.length) {
                    liveMappings?.forEach(lm => lm.corresponding = staticMappings?.find(sm => sm.label === lm.label));
                }

                if (!this.showAll && staticMappings?.length) {
                    return liveMappings?.filter(lm => lm.corresponding);
                }
            }
            return fullList;

        } else if (element instanceof BootApp) {
            return this.staticData.get(element);
        }

        return undefined;
    }

    public getParent(element: TreeData): vscode.ProviderResult<TreeData> {
        if (element instanceof LiveProcess) { return undefined; }
        else if (element instanceof BootApp) { return undefined; }
        else if (element instanceof Endpoint) {
            return element.liveProcess;
        }
        else if (element instanceof StaticEndpoint) {
            return Array.from(this.staticData.keys()).find(k => this.staticData.get(k)?.includes(element));
        }
        return undefined;
    }

    public refresh(item?: TreeData) {
        this.onDidRefreshMappings.fire(item);
    }

    public refreshLive(liveProcess: sts.LiveProcess, mappingsRaw: any[] | undefined) {
        if (mappingsRaw === undefined) {
            // remove
            const targetLiveProcess = Array.from(this.store.keys()).find(lp => lp.processKey === liveProcess.processKey);
            if (targetLiveProcess) {
                this.store.delete(targetLiveProcess);
            }
        } else {
            // add / update
            const targetLiveProcess = Array.from(this.store.keys()).find(lp => lp.processKey === liveProcess.processKey) ?? new LiveProcess(liveProcess);
            const mappings = mappingsRaw.map(raw => new Endpoint(
                liveProcess.processKey,
                raw.data.map
            )).sort((a, b) => a.label.localeCompare(b.label));
            this.store.set(targetLiveProcess, mappings);
        }
        this.onDidRefreshMappings.fire(undefined);
    }

    public refreshStatic(app: BootApp, mappingsRaw: StaticEndpoint[]) {
        this.updateStaticData(app, mappingsRaw);
        this.onDidRefreshMappings.fire(undefined);
    }

    public updateStaticData(app: BootApp, mappingsRaw: StaticEndpoint[]) {
        const mappings = mappingsRaw.map(raw => new StaticEndpoint(raw)).sort((a, b) => a.label.localeCompare(b.label));
        this.staticData.set(app, mappings);
    }
    public getMappingBySymbol(symbolLike: {
        location: vscode.Location;
    }): Endpoint |  StaticEndpoint | undefined {
        const location = symbolLike.location;
        // search store for live mappings
        for (const lp of this.store.keys()) {
            const mappings = this.store.get(lp);
            const found = mappings?.filter(m => m.corresponding).find(sm => locationEquals(sm.corresponding!.location, location));
            return found;
        }
        // fallback to check static beans
        for (const app of this.staticData.keys()) {
            const staticBeans = this.staticData.get(app);
            const found = staticBeans?.find(sb => locationEquals(sb.location, location));
            return found;
        }

        return undefined;
    }
}

export async function openEndpointHandler(endpoint: Endpoint) {
    const port = await getPort(endpoint.processKey);
    const contextPath = await getContextPath(endpoint.processKey) ?? "";
    let hostname;
    if (endpoint.liveProcess?.type === "remote") {
        // TODO: should request upstream API for valid hostname
        const jmxurl = endpoint.liveProcess.remoteApp?.jmxurl;
        if (jmxurl) {
            hostname = vscode.Uri.parse(jmxurl).authority;
        }
    }
    let url: string | undefined = constructOpenUrl(contextPath, port, endpoint.pattern, hostname);

    // promp to fill {variables}
    if (url?.match(/\{.*\}/)) {
        const start = url.indexOf("{");
        const end = url.indexOf("}", start) + 1;
        const templateVariable = url.slice(start, end);
        url = await vscode.window.showInputBox({
            value: url,
            valueSelection: [start, end],
            placeHolder: "URL to Open ...",
            title: "Confirm URL to Open",
            prompt: `Please fill in the value of ${templateVariable}`,
            ignoreFocusOut: true
        });
    }

    if (url) {
        const openWithExternalBrowser: boolean = vscode.workspace.getConfiguration("spring.dashboard").get("openWith") === "external";
        const browserCommand: string = openWithExternalBrowser ? "vscode.open" : "simpleBrowser.api.open";
        let uri = vscode.Uri.parse(url);
        uri = await vscode.env.asExternalUri(uri); // Enables Remote envs like Codespaces
        vscode.commands.executeCommand(browserCommand, uri);
    }
}
