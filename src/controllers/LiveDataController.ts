import { AppState } from "../BootApp";
import { getBeans, getContextPath, getMainClass, getMappings, getPid, getPort, initialize, stsApi } from "../models/stsApi";
import { isAlive } from "../utils";
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
    store.data.delete(processKey);
    beansProvider.refresh(processKey, undefined);
    mappingsProvider.refresh(processKey, undefined);

    const disconnectedApp = appsProvider.manager.getAppByMainClass(getMainClass(processKey));
    // Workaound for: app is still running if manually disconnect from live process connection.
    if (disconnectedApp && !await isAlive(disconnectedApp.pid)) {
        disconnectedApp.reset();
    }
}
