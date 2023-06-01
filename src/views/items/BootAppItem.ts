// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { BootApp } from "../../BootApp";
import { getPathToExtensionRoot } from "../../contextUtils";

export class BootAppItem implements vscode.TreeItem {
    public static RUNNING_ICON = () => ({
        dark: getPathToExtensionRoot("resources", "dark", "app-status-running.svg"),
        light: getPathToExtensionRoot("resources", "light", "app-status-running.svg"),
    });

    public static STOPPED_ICON = () => ({
        dark: getPathToExtensionRoot("resources", "dark", "app-status-stopped.svg"),
        light: getPathToExtensionRoot("resources", "light", "app-status-stopped.svg"),
    });

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
        if(this._app.activeProfiles) {
            const profileInfo = `profile(s): '${this._app.activeProfiles}'`
            list.push(profileInfo);
        }
        if (list.length > 0) {
            return `[${list.join(", ")}]`;
        }
        return undefined;
    }

    public get iconPath(): string | vscode.ThemeIcon | {dark: string, light: string} {
        switch (this.state) {
            case "running":
                return BootAppItem.RUNNING_ICON();
            case "launching":
                return new vscode.ThemeIcon("sync~spin");
            default:
                return BootAppItem.STOPPED_ICON();
        }
    }

    public get state(): string {
        return this._app.state;
    }

    public get contextValue(): string {
        return `BootApp_${this._app.state}`;
    }
}
