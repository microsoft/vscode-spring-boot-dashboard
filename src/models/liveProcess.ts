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

    public get appName(): string {
        const mainClass = this.liveProcess.processName;
        const runningApp = appsProvider.manager.getAppByMainClass(mainClass);
        return runningApp?.name ?? mainClass;
    }
}
