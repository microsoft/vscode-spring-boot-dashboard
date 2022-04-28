import { appsProvider } from "../views/apps";
import { getPid, getMainClass } from "./stsApi";


export class LiveProcess {
    constructor(public processKey: string) { }

    public get pid(): string {
        return getPid(this.processKey);
    }

    public get appName(): string {
        const mainClass = getMainClass(this.processKey);
        const runningApp = appsProvider.manager.getAppByMainClass(mainClass);
        return runningApp?.name ?? mainClass;
    }
}
