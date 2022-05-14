// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { BootApp } from "../BootApp";
import { BootAppManager } from "../BootAppManager";

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
                return new vscode.ThemeIcon("circle-filled",);
        }
    }

    public get state(): string {
        return this._app.state;
    }

    public get contextValue(): string {
        return `BootApp_${this._app.state}`;
    }
}

class LocalAppTreeProvider implements vscode.TreeDataProvider<BootApp> {

    public manager: BootAppManager;
    public readonly onDidChangeTreeData: vscode.Event<BootApp | undefined>;

    constructor() {
        this.manager = new BootAppManager();
        this.onDidChangeTreeData = this.manager.onDidChangeApps;
        this.manager.fireDidChangeApps(undefined);
    }

    getTreeItem(element: BootApp): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return new BootAppItem(element);
    }
    getChildren(element?: BootApp | undefined): vscode.ProviderResult<BootApp[]> {
        if (!element) {
            return this.manager.getAppList();
        } else {
            return [];
        }
    }

    public refresh(element: BootApp | undefined) {
        this.manager.fireDidChangeApps(element);

    }
}

export const appsProvider = new LocalAppTreeProvider();
