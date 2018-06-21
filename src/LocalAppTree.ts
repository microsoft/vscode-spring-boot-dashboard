// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import * as path from "path";
import { BootApp } from "./BootApp";
import { BootAppManager } from "./BootAppManager";

export class BootAppItem implements vscode.TreeItem {
    public readonly _app: BootApp;
    private _context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext, app: BootApp) {
        this._context = context;
        this._app = app;
    }

    public get label(): string {
        return this._app.getName();
    }

    public get iconPath(): string {
        let status: string = 'stop.svg';
        if (this.state === "running") {
            status = 'running.svg';
        }
        return this._context.asAbsolutePath(path.join('resources', status));
    }

    public get state(): string {
        return this._app.getState();
    }

    public get contextValue(): string {
        return `BootApp`;
    }
}

export class LocalAppTreeProvider implements vscode.TreeDataProvider<BootApp> {

    public _onDidChangeTreeData: vscode.EventEmitter<BootApp|undefined> = new vscode.EventEmitter<BootApp|undefined>();
    public readonly onDidChangeTreeData: vscode.Event<BootApp|undefined> = this._onDidChangeTreeData.event;
    private _manager: BootAppManager;
    private _context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext, manager: BootAppManager) {
        this._manager = manager;
        this._context = context;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: BootApp): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return new BootAppItem(this._context, element);
    }
    getChildren(element?: BootApp | undefined): vscode.ProviderResult<BootApp[]> {
        if (!element) {
            return this._manager.getAppList();
        } else {
            return [];
        }
    }


}