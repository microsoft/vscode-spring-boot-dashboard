// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { DebugSession } from "vscode";

export const STATE_INACTIVE = 'inactive';
export const STATE_RUNNING = 'running';

export class BootApp {
    private _activeSession?: DebugSession;

    constructor(
        private _path: string,
        private _name: string,
        private _classpath: ClassPathData,
        private _state: string
    ) { }

    public get activeSession() : DebugSession | undefined {
        return this._activeSession;
    }

    public set activeSession(session: DebugSession | undefined) {
        this._activeSession = session;
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


    public get classpath(): ClassPathData {
        return this._classpath;
    }

    public set classpath(classpath: ClassPathData) {
        this._classpath = classpath;
    }

    public get state(): string {
        return this._state;
    }

    public set state(state: string) {
        this._state = state;
    }
}

export interface ClassPathData {
    entries: CPE[];
}

interface CPE {
    kind: string;
    path: string; // TODO: Change to File, Path or URL?
    outputFolder: string;
    sourceContainerUrl: string;
    javadocContainerUrl: string;
    isSystem: boolean;
}