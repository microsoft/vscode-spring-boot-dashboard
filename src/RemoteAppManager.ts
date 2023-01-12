import { RemoteBootAppDataProvider } from "./extension.api";

export class RemoteAppManager {
    providers: Map<string, RemoteBootAppDataProvider[]>;
    constructor() {
        this.providers = new Map();
    }

    public registerRemoteBootAppDataProvider(providerName: string, provider: RemoteBootAppDataProvider) {
        const list = this.providers.get(providerName) ?? [];
        list.push(provider);
        this.providers.set(providerName, list);
    }
}