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

    public get app(): BootApp | undefined{
        const mainClass = this.liveProcess.processName; // TODO: here assume processName is full-qualified name of mainclass
        const runningApp = appsProvider.manager.getAppByMainClass(mainClass);
        return runningApp;
    }

    public get appName(): string {
        return this.app?.name ?? this.liveProcess.processName;
    }
}
