import { BootApp } from "../BootApp";
import { RemoteBootAppData } from "../extension.api";
import { dashboard } from "../global";
import * as sts from "../types/sts-api";

export class LiveProcess {
    app: BootApp | undefined;
    remoteApp: RemoteBootAppData | undefined;

    constructor(
        private liveProcess: sts.LiveProcess
    ) {
        if (liveProcess.type === "local") {
            let app = dashboard.appsProvider.manager.getAppByPid(liveProcess.pid);
            if (!app) {
                // fallback: here assume processName is full-qualified name of mainclass, which is not guaranteed.
                const mainClass = liveProcess.processName;
                app = dashboard.appsProvider.manager.getAppByMainClass(mainClass);
            }
            this.app = app;
        } else if (liveProcess.type === "remote") {
            const host = liveProcess.processName.split(" - ")?.[1]; // TODO: should request upstream API for identifier of a unique remote app.
            const remoteApp = dashboard.appsProvider.remoteAppManager.getRemoteAppByHost(host);
            this.remoteApp = remoteApp;
        } else {
            // Not coverred.
        }
    }

    public get type(): "local" | "remote" {
        return this.liveProcess.type;
    }

    public get processKey(): string {
        return this.liveProcess.processKey;
    }

    public get pid(): string | undefined {
        return this.liveProcess.type === "local" ? this.liveProcess.pid : undefined;
    }

    public get appName(): string {
        return this.app?.name ?? this.liveProcess.processName;
    }

    public get remoteAppName(): string {
        return this.remoteApp?.name ?? this.liveProcess.processName;
    }
}
