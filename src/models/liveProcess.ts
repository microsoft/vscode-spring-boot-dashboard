import { BootApp } from "../BootApp";
import { LocalLiveProcess } from "../types/sts-api";
import { appsProvider } from "../views/apps";


export class LiveProcess {
    constructor(private liveProcess: LocalLiveProcess) { }

    public get processKey(): string {
        return this.liveProcess.processKey;
    }

    public get pid(): string {
        return this.liveProcess.pid;
    }

    public get app(): BootApp | undefined {
        let app = appsProvider.manager.getAppByPid(this.liveProcess.pid);
        if (!app) {
            // fallback: here assume processName is full-qualified name of mainclass, which is not guaranteed.
            const mainClass = this.liveProcess.processName;
            app = appsProvider.manager.getAppByMainClass(mainClass);
        }

        return app;
    }

    public get appName(): string {
        return this.app?.name ?? this.liveProcess.processName;
    }
}
