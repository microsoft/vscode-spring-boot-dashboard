// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

export const STATE_INACTIVE = 'inactive';

export class BootApp {
    constructor(
        private _path: string,
        private _name: string,
        private _classpath: ClassPathData,
        private _state: string
    ) { }

    public get path() : string {
        return this._path;
    }
    
    public get name(): string {
        return this._name;
    }

    public get classpath(): ClassPathData {
        return this._classpath;
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