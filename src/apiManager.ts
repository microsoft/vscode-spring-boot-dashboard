// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ExtensionAPI } from "./extension.api";
import { dashboard } from "./global";
import { connectRemoteApp, disconnectRemoteApp } from "./RemoteAppManager";

export class ApiManager {
    private api: ExtensionAPI;
    constructor() {
        this.api = {
            registerRemoteBootAppDataProvider(providerName, provider, options) {
                dashboard.appsProvider.remoteAppManager.registerRemoteBootAppDataProvider(providerName, provider, options);
                dashboard.appsProvider.refresh(undefined); // trigger a refresh when new provider is registered.
            },
            connectRemoteApp,
            disconnectRemoteApp
        };
    }

    public getApiInstance(): ExtensionAPI {
        if (!this.api) {
            throw new Error("API instance is not initialized");
        }
        return this.api;
    }
}
