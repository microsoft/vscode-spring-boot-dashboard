// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { BootApp } from "../BootApp";
import { BootAppManager } from "../BootAppManager";
import { RemoteBootAppData } from "../extension.api";
import { RemoteAppManager } from "../RemoteAppManager";

class BootAppItem implements vscode.TreeItem {
    public readonly _app: BootApp;

    constructor(app: BootApp) {
        this._app = app;
    }

    public get label(): string {
        return this._app.name;
    }

    public get description(): string | undefined {
        const list = [];
        if (this._app.port) {
            list.push(`:${this._app.port}`);
        }
        if (this._app.contextPath) {
            list.push(this._app.contextPath);
        }
        if (list.length > 0) {
            return `[${list.join(", ")}]`;
        }
        return undefined;
    }

    public get iconPath(): string | vscode.ThemeIcon {
        const green = new vscode.ThemeColor("charts.green");
        switch (this.state) {
            case "running":
                return new vscode.ThemeIcon("circle-filled", green);
            case "launching":
                return new vscode.ThemeIcon("sync~spin");
            default:
                return new vscode.ThemeIcon("circle-outline",);
        }
    }

    public get state(): string {
        return this._app.state;
    }

    public get contextValue(): string {
        return `BootApp_${this._app.state}`;
    }
}

type TreeData = BootApp | RemoteBootAppData | string /** for providers */;

class LocalAppTreeProvider implements vscode.TreeDataProvider<TreeData> {

    public manager: BootAppManager;
    public remoteAppManager: RemoteAppManager;
    public readonly onDidChangeTreeData: vscode.Event<BootApp | undefined>;

    constructor() {
        this.remoteAppManager = new RemoteAppManager();
        this.manager = new BootAppManager();
        this.onDidChangeTreeData = this.manager.onDidChangeApps;
        this.manager.fireDidChangeApps(undefined);
    }

    getTreeItem(element: TreeData): vscode.TreeItem | Thenable<vscode.TreeItem> {
        if (element instanceof BootApp) {
            return new BootAppItem(element);
        } else if (typeof element === "string") {
            // providers
            const item = new vscode.TreeItem(element);
            item.iconPath = vscode.ThemeIcon.Folder; /// TODO: custom icon?
            item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            return item;
        }
        else {
            // remote apps
            return {
                label: element.name,
                description: element.description,
                iconPath: new vscode.ThemeIcon("project")
            }
        }
    }
    async getChildren(element?: TreeData | undefined): Promise<TreeData[]> {
        if (!element) {
            const apps = this.manager.getAppList();
            const providers = this.remoteAppManager.getProviderNames();
            return [...apps, ...providers];
        } else if (typeof element === "string") {
            const remoteApps = await this.remoteAppManager.getRemoteApps(element);
            return remoteApps;
        } else {
            return [];
        }
    }

    public refresh(element: BootApp | undefined) {
        this.manager.fireDidChangeApps(element);

    }
}

export const appsProvider = new LocalAppTreeProvider();
