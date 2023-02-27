import { ExtensionAPI } from "./extension.api";
import { dashboard } from "./global";
import { connectRemoteApp, disconnectRemoteApp } from "./RemoteAppManager";

class ApiManager {

    private api: ExtensionAPI;

    public initialize(): void {
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

export const apiManager = new ApiManager();