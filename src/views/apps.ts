// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { BootApp } from "../BootApp";
import { LocalAppManager } from "../LocalAppManager";
import { connectedProcessKeys } from "../controllers/LiveDataController";
import { RemoteBootAppData } from "../extension.api";
import { RemoteAppManager } from "../RemoteAppManager";
import { processKey } from "../utils";
import { BootAppItem } from "./items/BootAppItem";
import { WorkspaceFolderItem } from "./items/folders";

type TreeData = BootApp | RemoteBootAppData | WorkspaceFolderItem | string /** for providers */;

class LocalAppTreeProvider implements vscode.TreeDataProvider<TreeData> {

    public manager: LocalAppManager;
    public remoteAppManager: RemoteAppManager;
    private emitter: vscode.EventEmitter<TreeData | undefined>;
    public readonly onDidChangeTreeData: vscode.Event<TreeData | undefined>;

    constructor() {
        this.remoteAppManager = new RemoteAppManager();
        this.manager = new LocalAppManager();
        this.emitter = new vscode.EventEmitter<TreeData | undefined>();

        this.onDidChangeTreeData = this.emitter.event;
        this.manager.onDidChangeApps(e => this.emitter.fire(e));
        this.remoteAppManager.onDidProviderDataChange(e => this.emitter.fire(e));

        this.manager.fireDidChangeApps(undefined);
    }

    getTreeItem(element: TreeData): vscode.TreeItem | Thenable<vscode.TreeItem> {
        if (element instanceof BootApp) {
            return new BootAppItem(element);
        } else if (element instanceof WorkspaceFolderItem) {
            return element;
        } else if (typeof element === "string") {
            // providers
            const item = new vscode.TreeItem(element);
            item.iconPath = this.remoteAppManager.getIconPath(element) ?? vscode.ThemeIcon.Folder;
            item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            item.contextValue = `spring:remoteAppProvider+${element}`;
            return item;
        }
        else {
            // remote apps
            const item = new vscode.TreeItem(element.name);
            item.iconPath = element.iconPath ?? new vscode.ThemeIcon("project");
            item.contextValue = "spring:remoteApp";
            if (element.group) {
                item.contextValue += `+${element.group}`;
            }
            if (connectedProcessKeys().includes(processKey(element))) {
                item.contextValue += "+connected";
                item.description = "connected";
            }
            return item;
        }
    }
    async getChildren(element?: TreeData | undefined): Promise<TreeData[]> {
        if (!element) {
            const providers = this.remoteAppManager.getProviderNames();
            if (providers.length > 0) {
                return [new WorkspaceFolderItem(), ...providers]
            } else {
                return this.manager.getAppList();
            }
        } else if (element instanceof WorkspaceFolderItem) {
            return this.manager.getAppList();
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
