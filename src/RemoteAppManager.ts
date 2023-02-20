import { commands, Event, EventEmitter, ThemeIcon, Uri } from "vscode";
import { RemoteBootAppData, RemoteBootAppDataProvider, RemoteBootAppDataProviderOptions } from "./extension.api";

class RemoteAppProviderRegistryEntry {
    public name: string;
    public providers: RemoteBootAppDataProvider[];
    public iconPath?: string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon;

    constructor(
        providerName: string,
        provider: RemoteBootAppDataProvider,
        options?: RemoteBootAppDataProviderOptions
    ) {
        this.name = providerName;
        this.providers = [provider];
        this.iconPath = options?.iconPath;
    }

    public addProvider(provider: RemoteBootAppDataProvider) {
        this.providers.push(provider);
    }

    public updateOptions(options?: RemoteBootAppDataProviderOptions) {
        if (options?.iconPath) {
            if (this.iconPath) {
                console.warn(`iconPath of provider "${this.name}" is already defined.`);
            } else {
                this.iconPath = options.iconPath;
            }
        }
    }
}

export class RemoteAppManager {

    registry: Map<string, RemoteAppProviderRegistryEntry>;
    emitter: EventEmitter<string>;

    public onDidProviderDataChange: Event<string>;

    constructor() {
        this.registry = new Map();
        this.emitter = new EventEmitter();
        this.onDidProviderDataChange = this.emitter.event;
    }

    public registerRemoteBootAppDataProvider(providerName: string, provider: RemoteBootAppDataProvider, options?: RemoteBootAppDataProviderOptions) {
        let entry = this.registry.get(providerName);
        if (entry) {
            entry.addProvider(provider);
            entry.updateOptions(options);
        } else {
            entry = new RemoteAppProviderRegistryEntry(providerName, provider, options);
        }
        this.registry.set(providerName, entry);

        if (provider.onDidChangeData) {
            provider.onDidChangeData(() => {
                this.emitter.fire(providerName);
            })
        }
    }

    public getProviderNames(): string[] {
        return Array.from(this.registry.keys());
    }

    public async getRemoteApps(providerName: string) {
        const entry = this.registry.get(providerName);
        const providers = entry?.providers;
        const ret = [];
        if (providers) {
            for (const p of providers) {
                const apps = await p.provide();
                ret.push(...apps);
            }
        }
        return ret;
    }

    public getIconPath(providerName: string): string | ThemeIcon | Uri | { light: string | Uri; dark: string | Uri; } | undefined {
        return this.registry.get(providerName)?.iconPath;
    }
}

export async function connectRemoteApp(appData: RemoteBootAppData) {
    await commands.executeCommand("sts/livedata/remoteConnect", appData.name, [appData]);
}

export async function disconnectRemoteApp(appData: RemoteBootAppData) {
    await commands.executeCommand("sts/livedata/remoteConnect", appData.name, []);
}