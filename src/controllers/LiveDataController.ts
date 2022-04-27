import { AppState } from "../BootApp";
import { getBeans, getMainClass, getMappings, getPid, initialize, stsApi } from "../models/stsApi";
import { appsProvider } from "../views/apps";
import { beansProvider } from "../views/beans";
import { mappingsProvider } from "../views/mappings";

class LiveInformationStore {
    public data: Map<string, any> = new Map();

    constructor() { }
}

let store: LiveInformationStore;

export async function init() {
    await initialize();
    store = new LiveInformationStore();

    stsApi.onDidLiveProcessConnect(updateProcessInfo);
    stsApi.onDidLiveProcessDisconnect(resetProcessInfo);
    stsApi.onDidLiveProcessUpdate(updateProcessInfo);
}

async function updateProcessInfo(processKey: string) {
    console.log("update", processKey);

    const beans = await getBeans(processKey);
    store.data.set(processKey, { beans });
    beansProvider.refresh(processKey, beans);

    const mappings = await getMappings(processKey); 
    store.data.set(processKey, { mappings });
    mappingsProvider.refresh(processKey, mappings);

    const runningApp = appsProvider.manager.getAppByMainClass(getMainClass(processKey));
    if (runningApp) {
        runningApp.state = AppState.RUNNING;
        runningApp.pid = parseInt(getPid(processKey));
    }
}

async function resetProcessInfo(processKey: string) {
    console.log("disconnect", processKey);

    store.data.delete(processKey);
    beansProvider.refresh(processKey, []);
    mappingsProvider.refresh(processKey, []);

    const disconnectedApp = appsProvider.manager.getAppByMainClass(getMainClass(processKey));
    // TO fix: app is still running if manually disconnect from live process connection.
    if (disconnectedApp) {
        disconnectedApp.state = AppState.INACTIVE;
        disconnectedApp.pid = undefined;
    }
}
