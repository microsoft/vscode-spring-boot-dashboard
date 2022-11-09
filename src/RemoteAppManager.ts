export interface RemoteApp {
    processKey: string,
    processName: string,
    [key: string]: any
}

class RemoteAppManager {


    private apps: Map<string, RemoteApp> = new Map();

    constructor() {

    }

    /**
     * getApps
     */
    public getApps(): RemoteApp[] {
        return Array.from(this.apps.values())
    }

    /**
     * addApp
     */
    public addRemoteApp(app: RemoteApp) {
        this.apps.set(app.processKey, app);
    }

    /**
     * removeRemoteApp
     */
    public removeRemoteApp(key: string) {
        this.apps.delete(key);
    }
}

export const remoteAppManager = new RemoteAppManager();