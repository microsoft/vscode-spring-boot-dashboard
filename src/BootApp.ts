// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { dashboard } from "./global";
import { requestWorkspaceSymbols } from "./models/stsApi";
import { ClassPathData, MainClassData } from "./types/jdtls";
import { isActuatorJarFile, isAlive } from "./utils";
import { BootAppItem } from "./views/items/BootAppItem";
import * as lsp from "vscode-languageclient";
import * as async from "async";
import { cpus } from "os";

const searchQueue = async.queue(async (path: string, callback: async.AsyncResultCallback<string[], Error>) => {
    try {
        callback(undefined, await vscode.commands.executeCommand('java.execute.workspaceCommand', 'vscode.java.resolveMainClass', path) as string[]);
    } catch (error) {
        callback(error);
    }
}, cpus().length / 2);

export enum AppState {
    INACTIVE = 'inactive',
    LAUNCHING = "launching", // TODO: Distinguish launching & running via JMX.
    RUNNING = 'running'
}

export class BootApp {
    private _activeSessionName?: string;
    private _jmxPort?: number;
    private _port?: number;
    private _contextPath?: string;
    private _pid?: number;
    private _activeProfiles?: string[];

    private _watchdog?: NodeJS.Timeout; // used to watch running process.

    public mainClasses: MainClassData[];
    public symbols: { beans: lsp.SymbolInformation[], mappings: lsp.SymbolInformation[] };

    constructor(
        private _path: string,
        private _name: string,
        private _classpath: ClassPathData,
        private _state: AppState,
    ) {
        this.getWorkspaceSymbols();
        this.getMainClasses();
    }

    public get activeSessionName(): string | undefined {
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

    public get jmxPort(): number | undefined {
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
        dashboard.appsProvider.refresh(this); // TODO: should do it in LocalAppController.
        if (this._state === AppState.INACTIVE) {
            this.clearWatchdog();
        }
    }

    public get port(): number | undefined {
        return this._port;
    }

    public set port(port: number | undefined) {
        this._port = port;
        dashboard.appsProvider.refresh(this); // TODO: should do it in LocalAppController.
    }

    public get pid(): number | undefined {
        return this._pid;
    }

    public set pid(pid: number | undefined) {
        this._pid = pid;
        if (pid !== undefined) {
            this.setWatchdog();
        }
    }

    public get activeProfiles(): string[] | undefined {
        return this._activeProfiles;
    }

    public set activeProfiles(profiles: string[] | undefined) {
        this._activeProfiles = profiles;
    }

    public get contextPath(): string | undefined {
        return this._contextPath;
    }

    public set contextPath(contextPath: string | undefined) {
        this._contextPath = contextPath ?? "";
        dashboard.appsProvider.refresh(this);  // TODO: should do it in LocalAppController.
    }

    public get isActuatorOnClasspath(): boolean {
        return !!this.classpath.entries.find(e => isActuatorJarFile(e.path));
    }

    public get iconPath(): vscode.ThemeIcon | { dark: string, light: string } {
        if (this.state === "running") {
            return BootAppItem.RUNNING_ICON();
        } else if (this.state === "launching") {
            return new vscode.ThemeIcon("sync~spin");
        } else {
            return BootAppItem.STOPPED_ICON();
        }
    }

    public reset() {
        this._port = undefined;
        this._contextPath = undefined;
        this.pid = undefined;
        this._state = AppState.INACTIVE;
        this._activeProfiles = undefined;
        dashboard.appsProvider.refresh(this);  // TODO: should do it in LocalAppController.
    }

    public setWatchdog() {
        const watchdog: NodeJS.Timeout = setInterval(async () => {
            const alive = await isAlive(this.pid);
            if (!alive) {
                clearInterval(watchdog);
                this.reset();
            }
        }, 2000);
        this._watchdog = watchdog;
    }

    public clearWatchdog() {
        if (this._watchdog) {
            clearInterval(this._watchdog);
            this._watchdog = undefined;
        }
    }

    public async getMainClasses(): Promise<MainClassData[]> {
        if (this.mainClasses === undefined) {
            // Note: Command `vscode.java.resolveMainClass` is implemented in extension java-debugger
            const mainClassList = await searchQueue.push(this.path);
            if (mainClassList && mainClassList instanceof Array) {
                this.mainClasses = mainClassList;
            } else {
                return [];
            }
        }
        return this.mainClasses;
    }

    /**
     * getWorkspaceSymbols
     */
    public async getWorkspaceSymbols() {
        if (!this.symbols) {
            this.symbols = await requestWorkspaceSymbols(this.path);
        }
        return this.symbols;
    }
}
