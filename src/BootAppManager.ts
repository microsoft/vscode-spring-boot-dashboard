// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { BootApp } from "./BootApp";

export class BootAppManager {
    private _appList: BootApp[];

    constructor() {
        this._appList = [];
        this.initAppListSync();
    
    }

    public getAppList() : BootApp[] {
        return this._appList;
    }

    private initAppListSync(): void {
        // TODO: this is just a mock.
        this._appList.push(
            new BootApp("app 1", "running"),
            new BootApp("app 2", "inactive")
        );
    }
}