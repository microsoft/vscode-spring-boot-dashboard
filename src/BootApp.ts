// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { ClassPathData, MainClassData } from "./types/jdtls";
import { appsProvider } from "./views/apps";

export enum AppState {
    INACTIVE = 'inactive',
    RUNNING = 'running',
    LAUNCHING = "launching" // TODO: Distinguish launching & running via JMX.
}

export class BootApp {
    private _activeSessionName?: string;
    private _jmxPort?: number;

    public mainClasses: MainClassData[];
    public pid?: number;

    constructor(
        private _path: string,
        private _name: string,
        private _classpath: ClassPathData,
        private _state: AppState,
    ) { }

    public get activeSessionName() : string | undefined {
        return this._activeSessionName;
    }

    public set activeSessionName(session: string | undefined) {
        this._activeSessionName = session;
    }

    public get path(): string {
        return this._path;
    }

    public get name(): string {
        return this._name;
    }


    public set name(name: string) {
        this._name = name;
    }

    public set jmxPort(port: number | undefined) {
        this._jmxPort = port;
    }

    public get jmxPort() : number | undefined {
        return this._jmxPort;
    }

    public get classpath(): ClassPathData {
        return this._classpath;
    }

    public set classpath(classpath: ClassPathData) {
        this._classpath = classpath;
    }

    public get state(): AppState {
        return this._state;
    }

    public set state(state: AppState) {
        this._state = state;
        appsProvider.refresh(this);
    }

    public async getMainClasses(): Promise<MainClassData[]> {
        // Note: Command `vscode.java.resolveMainClass` is implemented in extension java-debugger
        const mainClassList = await vscode.commands.executeCommand('java.execute.workspaceCommand', 'vscode.java.resolveMainClass', this.path);
        if (mainClassList && mainClassList instanceof Array) {
            this.mainClasses = mainClassList;
            return mainClassList;
        } else {
            return [];
        }
    }
}
