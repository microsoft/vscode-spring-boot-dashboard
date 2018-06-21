// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

export class BootApp {
    private _name: string;
    private _state: string;

    constructor(name: string, state: string) {
        this._name = name;
        this._state = state;
    }

    public getName(): string {
        return this._name;
    }

    public getState(): string {
        return this._state;
    }

    public setState(state: string) : void {
        this._state = state;
    }
}