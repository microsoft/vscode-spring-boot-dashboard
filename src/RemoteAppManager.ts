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

    public getProviderNames(): string[] {
        return Array.from(this.providers.keys());
    }

    public async getRemoteApps(providerName: string) {
        const providers = this.providers.get(providerName);
        const ret = [];
        if (providers) {
            for (const p of providers) {
                const apps = await p.provide();
                ret.push(...apps);
            }
        }
        return ret;
    }
}