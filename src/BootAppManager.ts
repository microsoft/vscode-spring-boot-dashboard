// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { BootApp, STATE_INACTIVE } from "./BootApp";

import * as vscode from 'vscode';
import * as uuid from 'uuid';
import * as path from 'path';

interface JavaProjectData {
    path : string
    name : string
    classpath : ClassPathData
}

interface ClassPathData {
    entries : CPE[];
}

interface CPE {
    kind: string;
    path: string; // TODO: Change to File, Path or URL?
	outputFolder : string;
	sourceContainerUrl : string;
	javadocContainerUrl : string;
	isSystem : boolean;
}

function isBootAppClasspath(cp : ClassPathData) : boolean {
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

export class BootAppManager {

    private _boot_projects : Map<String, JavaProjectData> = new Map();

    constructor() {
        this.initAppListSync();
    }

    public getAppList(): BootApp[] {
        let apps : BootApp[] = [];
        this._boot_projects.forEach(p => {
            apps.push(new BootApp(p.name, STATE_INACTIVE));
        });
        return apps;
    }

    private initAppListSync(): void {
        //TODO: The code below will fail if jdt language server has not yet been started
        //  How should we deal with that?
        const callbackId = uuid.v4();

        vscode.commands.registerCommand(callbackId, (...args) => {
            let location : string = args[0];
            let name : string = args[1];
            let isDeleted : boolean = args[2];
            if (isDeleted) {
                this._boot_projects.delete(location);
            } else {
                let entries : ClassPathData = args[3];
                if (isBootAppClasspath(entries)) {
                    this._boot_projects.set(location, {
                        path: location,
                        name: name,
                        classpath: entries
                    });
                } else {
                    this._boot_projects.delete(location);
                }
            }
        });

        let tries = 0;

        function registerClasspathListener() {
            vscode.commands.executeCommand('java.execute.workspaceCommand', 'sts.java.addClasspathListener', callbackId).then(
                //okay:
                (v) => {},
                //failed:
                (reason) => {
                    setTimeout(() => {
                        if (tries++ < 20) {
                            registerClasspathListener();
                        } else {
                            console.error(reason);
                        }
                    }, 2000)
                }
            );
        }
        registerClasspathListener();
    }
}