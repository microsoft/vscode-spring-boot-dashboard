// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { dashboard } from "./global";
import { requestWorkspaceSymbols } from "./models/stsApi";
import { ClassPathData, MainClassData } from "./types/jdtls";
import { excludeTestMainClasses, isActuatorJarFile, isAlive } from "./utils";
import { BootAppItem } from "./views/items/BootAppItem";
import * as lsp from "vscode-languageclient";
import * as async from "async";
import { cpus } from "os";

interface MainClassSearchRequest {
    path: string;
}

const searchQueue = async.queue(
    async (
        request: MainClassSearchRequest,
        callback: async.AsyncResultCallback<MainClassData[], Error>
    ) => {
        try {
            const resolvedMainClasses =
                (await vscode.commands.executeCommand<MainClassData[]>(
                    "java.execute.workspaceCommand",
                    "vscode.java.resolveMainClass",
                    request.path
                )) ?? [];

            callback(undefined, resolvedMainClasses);
        } catch (error) {
            callback(error as Error);
        }
    },
    Math.max(1, Math.floor(cpus().length / 2))
);

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

    /**
     * Whether the app has launchable (non-test) main classes.
     * `undefined` means main classes have not been resolved yet.
     * Apps without a main class are shown in the APPS view but get no
     * start/stop controls and no running/stopped state icon.
     *
     * @author zhangzp
     */
    public hasMainClass?: boolean;

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
        // Apps without a main class can never be started/stopped: show a neutral
        // icon instead of the running/stopped state indicator.
        if (this.state === AppState.INACTIVE && this.hasMainClass === false) {
            return new vscode.ThemeIcon("package");
        } else if (this.state === "running") {
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
            if (alive === false) {
                clearInterval(watchdog);
                this.reset();
            } else if (alive === undefined) {
                clearInterval(watchdog);
                this._watchdog = undefined;
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
            let mainClassList: MainClassData[] | undefined;
            try {
                mainClassList = await searchQueue.pushAsync({
                    path: this.path,
                });
            } catch (error) {
                // Resolution failed (e.g. java tooling not ready): leave mainClasses
                // undefined so a later call can retry, and log instead of bubbling up
                // (the constructor fires this method without awaiting it).
                console.error(`Failed to resolve main classes for ${this.name}:`, error);
            }
            if (mainClassList && mainClassList instanceof Array) {
                this.mainClasses = mainClassList;
                // Compute launchability (exclude main classes from test source folders) and
                // refresh the views so apps without a main class lose their start/stop
                // controls and state icon once resolution completes.
                const launchable = await excludeTestMainClasses(mainClassList, this.classpath);
                this.hasMainClass = launchable.length > 0;
                dashboard.appsProvider.refresh(this);
                dashboard.beansProvider.refresh(undefined);
                dashboard.mappingsProvider.refresh(undefined);
            } else {
                return [];
            }
        }
        return this.mainClasses;
    }

    /**
     * The main classes offered to the user when running/debugging this app, i.e. all
     * resolved main classes except the ones located in test source folders.
     *
     * Falls back to the full list when every main class is in a test source folder, so
     * that a project whose only main class lives there stays launchable.
     */
    public async getLaunchableMainClasses(): Promise<MainClassData[]> {
        const mainClasses = await this.getMainClasses();
        const launchable = await excludeTestMainClasses(mainClasses, this.classpath);
        return launchable.length > 0 ? launchable : mainClasses;
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
