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

export class AppDataProvider implements vscode.TreeDataProvider<TreeData> {

    /**
     * Whether the APPS view hides apps without a launchable main class.
     * Toggled via the view title button.
     *
     * @author zhangzp
     */
    private _launchableFilter = false;

    private emitter: vscode.EventEmitter<TreeData | undefined>;
    public readonly onDidChangeTreeData: vscode.Event<TreeData | undefined>;

    constructor(
        public manager: LocalAppManager,
        public remoteAppManager: RemoteAppManager,
        public context: vscode.ExtensionContext
    ) {
        this.emitter = new vscode.EventEmitter<TreeData | undefined>();

        this.onDidChangeTreeData = this.emitter.event;
        this.manager.onDidChangeApps(e => this.emitter.fire(e));
        this.remoteAppManager.onDidProviderDataChange(e => this.emitter.fire(e));

        vscode.commands.executeCommand("setContext", "spring.apps:launchableFilter", false);
        this.manager.fireDidChangeApps(undefined);
    }

    public get launchableFilter(): boolean {
        return this._launchableFilter;
    }

    public set launchableFilter(value: boolean) {
        this._launchableFilter = value;
        // Update the context key so the view title button swaps to the
        // "filled" (active) icon while the filter is on.
        vscode.commands.executeCommand("setContext", "spring.apps:launchableFilter", value);
        this.emitter.fire(undefined);
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
                return this.getVisibleApps();
            }
        } else if (element instanceof WorkspaceFolderItem) {
            return this.getVisibleApps();
        } else if (typeof element === "string") {
            const remoteApps = await this.remoteAppManager.getRemoteApps(element);
            return remoteApps;
        } else {
            return [];
        }
    }

    /**
     * Returns the apps to render, honoring the "show launchable apps only" toggle.
     *
     * With the filter enabled, apps whose main classes have not been resolved yet
     * (hasMainClass === undefined) are hidden as well: apps loaded gradually while
     * the filter is on must not flash up before their resolution completes.
     * BootApp refreshes the view once resolution finishes, so launchable apps
     * appear as soon as they are confirmed.
     *
     * @author zhangzp
     */
    private getVisibleApps(): BootApp[] {
        const apps = this.manager.getAppList();
        if (!this._launchableFilter) {
            return apps;
        }
        return apps.filter(app => app.hasMainClass === true);
    }

    public refresh(element: BootApp | undefined) {
        this.manager.fireDidChangeApps(element);
    }
}
