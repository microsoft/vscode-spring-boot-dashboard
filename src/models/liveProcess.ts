import { BootApp } from "../BootApp";
import * as sts from "../types/sts-api";
import { appsProvider } from "../views/apps";


export class LiveProcess {
    constructor(private liveProcess: sts.LiveProcess) { }

    public get type(): string {
        return this.liveProcess.type;
    }

    public get processKey(): string {
        return this.liveProcess.processKey;
    }

    public get pid(): string | undefined {
        return this.liveProcess.type === "local" ? this.liveProcess.pid : undefined;
    }

    public get app(): BootApp | undefined {
        if (this.liveProcess.type === "remote") {
            return undefined;
        }

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
