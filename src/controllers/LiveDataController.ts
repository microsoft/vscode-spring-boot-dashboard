import { AppState } from "../BootApp";
import { getBeans, getContextPath, getMainClass, getMappings, getPid, getPort, initialize, stsApi } from "../models/stsApi";
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
    beansProvider.refresh(processKey, beans);

    const mappings = await getMappings(processKey); 
    mappingsProvider.refresh(processKey, mappings);

    const port = await getPort(processKey);
    const contextPath = await getContextPath(processKey);
    store.data.set(processKey, { beans, mappings, port });
    const runningApp = appsProvider.manager.getAppByMainClass(getMainClass(processKey));
    if (runningApp) {
        runningApp.pid = parseInt(getPid(processKey));
        runningApp.port = parseInt(port);
        runningApp.contextPath = contextPath;
        runningApp.state = AppState.RUNNING; // will refresh tree item
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
        disconnectedApp.pid = undefined;
        disconnectedApp.port = undefined;
        disconnectedApp.contextPath = undefined;
        disconnectedApp.state = AppState.INACTIVE; // will refresh tree item
    }
}
