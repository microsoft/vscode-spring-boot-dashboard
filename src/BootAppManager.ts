// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { BootApp, STATE_INACTIVE, ClassPathData } from "./BootApp";

import * as vscode from 'vscode';
import * as uuid from 'uuid';
import * as path from 'path';

function isBootAppClasspath(cp: ClassPathData): boolean {
    if (cp.entries) {
        let entries = cp.entries;
        for (let i = 0; i < entries.length; i++) {
            const cpe = entries[i];
            let filename = path.basename(cpe.path);

            if (filename.endsWith('.jar') && filename.startsWith('spring-boot')) {
                return true;
            }
        }
    }
    return false;
}

function sleep(milliseconds: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export class BootAppManager {

    private _boot_projects : Map<String, BootApp> = new Map();
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

    public fireDidChangeApps(): void {
        this._onDidChangeApps.fire();
    }

    public getAppList(): BootApp[] {
        return Array.from(this._boot_projects.values());
    }

    /**
     * Registers for classpath change events (from redhat.java and pivotal.spring-boot extension).
     * These events are used to keep the list of boot apps in sync with the workspace projects.
     */
    private async _startAppListSynchronisation(): Promise<void> {
        //TODO: The code below will fail if jdt language server has not yet been started
        //  How should we deal with that?
        const callbackId = uuid.v4();

        vscode.commands.registerCommand(callbackId, (location: string, name: string, isDeleted: boolean, entries: ClassPathData, ...args: any[]) => {
            if (isDeleted) {
                this._boot_projects.delete(location);
            } else {
                if (entries && isBootAppClasspath(entries)) {
                    this._boot_projects.set(location, new BootApp(location, name, entries, STATE_INACTIVE));
                } else {
                    this._boot_projects.delete(location);
                }
            }
            this.fireDidChangeApps();
        });

        async function registerClasspathListener() : Promise<void> {
            const MAX_RETRIES = 10;
            const WAIT_IN_SECONDS = 2;
            let available_tries = MAX_RETRIES;
            while (available_tries>0) {
                available_tries--;
                try {
                    await vscode.commands.executeCommand('java.execute.workspaceCommand', 'sts.java.addClasspathListener', callbackId);
                    return;
                } catch (error) {
                    if (available_tries>0) {
                        await sleep(WAIT_IN_SECONDS*1000);
                    } else {
                        throw new Error(`Failed to register classpath listener after ${MAX_RETRIES} retries.`);
                    }
                }
            }
        }
        return await registerClasspathListener();
    }
}