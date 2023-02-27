// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { AppState, BootApp } from "./BootApp";

import * as path from 'path';
import * as uuid from 'uuid';
import * as vscode from 'vscode';
import { DebugSession } from "vscode";
import { initSymbols } from "./controllers/SymbolsController";
import { ExtensionAPI } from "./types/javaExtensionApi";
import { ClassPathData, MainClassData } from "./types/jdtls";
import { sleep } from "./utils";
import { mappingsProvider } from "./views/mappings";
import { dashboard } from "./global";

function isBootAppClasspath(cp: ClassPathData): boolean {
    if (cp.entries) {
        const entries = cp.entries;
        for (let i = 0; i < entries.length; i++) {
            const cpe = entries[i];
            const filename = path.basename(cpe.path);

            if (filename.endsWith('.jar') && filename.startsWith('spring-boot')) {
                return true;
            }
        }
    }
    return false;
}

export class LocalAppManager {

    private _boot_projects: Map<string, BootApp> = new Map();
    private _bindedSessions: Map<string, DebugSession> = new Map();
    private _onDidChangeApps: vscode.EventEmitter<BootApp | undefined> = new vscode.EventEmitter<BootApp | undefined>();
    constructor() {
        //We have to do something with the errors here because constructor cannot
        // be declared as `async`.
        this._startAppListSynchronisation()
            .catch((error) => {
                console.error(error);
            });
    }

    public get onDidChangeApps(): vscode.Event<BootApp | undefined> {
        return this._onDidChangeApps.event;
    }

    public fireDidChangeApps(element: BootApp | undefined): void {
        this._onDidChangeApps.fire(element);
    }

    public getAppList(): BootApp[] {
        return Array.from(this._boot_projects.values()).sort((a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1);
    }

    public getAppBySession(session: DebugSession): BootApp | undefined {
        const location = Array.from(this._bindedSessions.keys()).find(key => this._bindedSessions.get(key) === session);
        if (location) {
            return this._boot_projects.get(location);
        } else {
            return undefined;
        }
    }

    public getSessionByApp(app: BootApp) :DebugSession | undefined {
        return this._bindedSessions.get(app.path);
    }

    public bindDebugSession(app: BootApp, session: DebugSession): void {
        app.activeSessionName = session.name;
        this._bindedSessions.set(app.path, session);
    }

    public getAppByMainClass(mainClass: string): BootApp | undefined {
        return this.getAppList().find(app => app.mainClasses?.find((mcd: MainClassData) => mcd.mainClass === mainClass));
    }

    public getAppByPid(pid: number | string): BootApp | undefined {
        const pidNumber = typeof pid === "number" ? pid : parseInt(pid);
        return this.getAppList().find(app => app.pid === pidNumber);
    }

    /**
     * Registers for classpath change events (from redhat.java and vmware.vscode-spring-boot extension).
     * These events are used to keep the list of boot apps in sync with the workspace projects.
     */
    private async _startAppListSynchronisation(): Promise<void> {
        const callbackId = uuid.v4();

        vscode.commands.registerCommand(callbackId, (location: string, name: string, isDeleted: boolean, entries: ClassPathData) => {
            if (isDeleted) {
                this._boot_projects.delete(location);
            } else {
                if (entries && isBootAppClasspath(entries)) {
                    const current: BootApp | undefined = this._boot_projects.get(location);
                    if (current) {
                        current.name = name;
                        current.classpath = entries;
                    } else {
                        this._boot_projects.set(location, new BootApp(location, name, entries, AppState.INACTIVE));
                    }
                } else {
                    this._boot_projects.delete(location);
                }
            }
            this.fireDidChangeApps(undefined);
            // update workspace symbols for beans/mappings
            initSymbols(5000).then(() => {
                dashboard.beansProvider.refresh(undefined);
                mappingsProvider.refresh(undefined);
            });
        });

        async function registerClasspathListener(): Promise<void> {
            const MAX_RETRIES = 10;
            const WAIT_IN_SECONDS = 2;
            let available_tries = MAX_RETRIES;
            while (available_tries > 0) {
                available_tries--;
                try {
                    const javaExtApi: ExtensionAPI = await vscode.extensions.getExtension("redhat.java")?.activate();
                    await javaExtApi?.serverReady?.(); // add '?' for compatibility with old versions.
                    await vscode.commands.executeCommand('java.execute.workspaceCommand', 'sts.java.addClasspathListener', callbackId);
                    return;
                } catch (error) {
                    if (available_tries > 0) {
                        await sleep(WAIT_IN_SECONDS * 1000);
                    } else {
                        throw new Error(`Failed to register classpath listener after ${MAX_RETRIES} retries.`);
                    }
                }
            }
        }

        return await registerClasspathListener();
    }
}
