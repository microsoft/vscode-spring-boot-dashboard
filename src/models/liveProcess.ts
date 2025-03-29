import * as vscode from "vscode";
import { BootApp } from "../BootApp";
import { RemoteBootAppData } from "../extension.api";
import { dashboard } from "../global";
import * as sts from "../types/sts-api";
import { refreshLiveProcessData } from "./stsApi";
import { BootAppItem } from "../views/items/BootAppItem";
import { Property, PropertyGroup } from "./properties";
import { getProperties } from "./stsApi";

export class LiveProcess {
    app: BootApp | undefined;
    remoteApp: RemoteBootAppData | undefined;
    propertyGroups: PropertyGroup[] | undefined;

    constructor(
        private payload: sts.LiveProcessPayload
    ) {
        if (payload.type === "local") {
            let app = dashboard.appsProvider.manager.getAppByPid(payload.pid);
            if (!app) {
                // fallback: here assume processName is full-qualified name of mainclass, which is not guaranteed.
                const mainClass = payload.processName;
                app = dashboard.appsProvider.manager.getAppByMainClass(mainClass);
            }
            this.app = app;
        } else if (payload.type === "remote") {
            const host = payload.processName.split(" - ")?.[1]; // TODO: should request upstream API for identifier of a unique remote app.
            const remoteApp = dashboard.appsProvider.remoteAppManager.getRemoteAppByHost(host);
            this.remoteApp = remoteApp;
        } else {
            // Not coverred.
        }
    }

    public get type(): "local" | "remote" {
        return this.payload.type;
    }

    public get processKey(): string {
        return this.payload.processKey;
    }

    public get pid(): string | undefined {
        return this.payload.type === "local" ? this.payload.pid : undefined;
    }

    public get appName(): string {
        return this.app?.name ?? this.payload.processName;
    }

    public get remoteAppName(): string {
        return this.remoteApp?.name ?? this.payload.processName;
    }

    public toTreeItem(): vscode.TreeItem {
        let item;
        if (this.type === "local") {
            item = new vscode.TreeItem(this.appName);
            item.description = `pid: ${this.pid}`;
        } else {
            item = new vscode.TreeItem(this.remoteAppName);
            item.description = this.remoteApp?.jmxurl;
        }

        item.iconPath = BootAppItem.RUNNING_ICON(); // TODO: should use customized icon based on connection type
        item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        item.contextValue = "liveProcess";
        return item;
    }

    public async getProperties(): Promise<PropertyGroup[] | undefined> {
        if (this.propertyGroups === undefined) {
            const propertiesPayload = await getProperties(this.processKey);
            const propertyGroups = [];

            // PARSE
            const { sources } = propertiesPayload;
            for (const source of sources) {
                const group = new PropertyGroup(source.sourceName);
                const {properties} = source;
                for (const prop of properties) {
                    const {property, value} = prop;
                    new Property(property, value, group);
                }
                propertyGroups.push(group);
            }
            this.propertyGroups = propertyGroups;
        }
        return this.propertyGroups;
    }

    public refresh(endpoint?: string) {
        return refreshLiveProcessData(this.payload.processKey, endpoint);
    }
}
