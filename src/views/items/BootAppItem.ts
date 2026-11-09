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
        if(this._app.activeProfiles?.length) {
            const profileInfo = `profiles: '${this._app.activeProfiles.join(", ")}'`
            list.push(profileInfo);
        }
        if (list.length > 0) {
            return `[${list.join(", ")}]`;
        }
        return undefined;
    }

    public get iconPath(): string | vscode.ThemeIcon | {dark: string, light: string} {
        // Delegate to BootApp.iconPath so apps without a main class get the
        // neutral icon instead of the running/stopped state indicator.
        return this._app.iconPath;
    }

    public get state(): string {
        return this._app.state;
    }

    public get contextValue(): string {
        // Apps without a resolvable main class are not launchable: use a distinct
        // context value so the start/stop menu entries (incl. inline controls)
        // registered for the exact `BootApp_<state>` values don't match.
        // Running/launching apps always keep their controls (they were started somehow).
        if (this._app.hasMainClass === false && this.state === "inactive") {
            return `BootApp_${this._app.state}_noMain`;
        }
        return `BootApp_${this._app.state}`;
    }
}
