import { ExtensionAPI } from "./extension.api";
import { connectRemoteApp, disconnectRemoteApp } from "./RemoteAppManager";
import { appsProvider } from "./views/apps";

class ApiManager {

    private api: ExtensionAPI;

    public initialize(): void {
        this.api = {
            registerRemoteBootAppDataProvider(providerName, provider, options) {
                appsProvider.remoteAppManager.registerRemoteBootAppDataProvider(providerName, provider, options)
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