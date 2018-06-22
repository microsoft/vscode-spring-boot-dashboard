// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

export class BootApp {
    constructor(
        private _name: string,
        private _state: string
    ) { }

    public get name(): string {
        return this._name;
    }

    public get state(): string {
        return this._state;
    }

    public set state(state: string) {
        this._state = state;
    }
}