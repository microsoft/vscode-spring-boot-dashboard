import * as vscode from "vscode";
import { AppState } from "../BootApp";
import { getBeans, getContextPath, getMainClass, getMappings, getPid, getPort, getGcPausesMetrics, getMemoryMetrics, initialize, stsApi } from "../models/stsApi";
import { LocalLiveProcess } from "../types/sts-api";
import { isAlive } from "../utils";
import { appsProvider } from "../views/apps";
import { beansProvider } from "../views/beans";
import { mappingsProvider } from "../views/mappings";
import { memoryProvider } from "../views/memory";

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
    stsApi.onDidLiveProcessGcPausesMetricsUpdate(updateProcessGcPausesMetrics);
    stsApi.onDidLiveProcessMemoryMetricsUpdate(updateProcessMemoryMetrics);
}

async function updateProcessInfo(payload: string | LocalLiveProcess) {
    const liveProcess = await parsePayload(payload);
    const { processKey, processName, pid } = liveProcess;

    const beans = await getBeans(processKey);
    beansProvider.refreshLive(liveProcess, beans);

    const mappings = await getMappings(processKey);
    mappingsProvider.refreshLive(liveProcess, mappings);

    const port = await getPort(processKey);
    const contextPath = await getContextPath(processKey);
    store.data.set(processKey, { processName, pid, beans, mappings, port });
    const runningApp = appsProvider.manager.getAppByMainClass(processName);
    if (runningApp) {
        runningApp.pid = parseInt(pid);
        runningApp.port = parseInt(port);
        runningApp.contextPath = contextPath;
        runningApp.state = AppState.RUNNING; // will refresh tree item
    }
}

async function updateProcessGcPausesMetrics(payload: string | LocalLiveProcess) {
    const liveProcess = await parsePayload(payload);
    const { processKey} = liveProcess;

    const gcPauses = await getGcPausesMetrics(processKey);
    memoryProvider.refreshLiveGcPausesMetrics(liveProcess, gcPauses);
    store.data.set(processKey, { gcPauses});  
}

async function updateProcessMemoryMetrics(payload: string | LocalLiveProcess) {
    const liveProcess = await parsePayload(payload);
    const { processKey} = liveProcess;

    const memoryMetrics = await getMemoryMetrics(processKey);
    await vscode.commands.executeCommand("setContext", "spring.gcPauses:hasLiveProcess", liveProcess !== undefined); 
    memoryProvider.refreshLiveMemoryMetrics(liveProcess, memoryMetrics);
    store.data.set(processKey, { memoryMetrics});

}

async function resetProcessInfo(payload: string | LocalLiveProcess) {
    const liveProcess = await parsePayload(payload);
    store.data.delete(liveProcess.processKey);
    beansProvider.refreshLive(liveProcess, undefined);
    mappingsProvider.refreshLive(liveProcess, undefined);
    memoryProvider.refreshLiveGcPausesMetrics(liveProcess, undefined);
    memoryProvider.refreshLiveMemoryMetrics(liveProcess, undefined);
    await vscode.commands.executeCommand("setContext", "spring.gcPauses:hasLiveProcess", store.data.size > 0);
    const disconnectedApp = appsProvider.manager.getAppByMainClass(liveProcess.processName);
    // Workaound for: app is still running if manually disconnect from live process connection.
    if (disconnectedApp && !await isAlive(disconnectedApp.pid)) {
        disconnectedApp.reset();
    }
}

/**
 *
 * Fix complatibility of lower versions.
 *
 * @param payload string for v1.33, LocalLiveProcess for v1.34
 * @returns
 */
async function parsePayload(payload: string | LocalLiveProcess): Promise<LocalLiveProcess> {
    if (typeof payload === "string") {
        const processKey = payload;
        const processName = await getMainClass(processKey);
        const pid = getPid(processKey);
        return {
            type: "local",
            processKey,
            processName,
            pid
        };
    } else {
        return payload;
    }
}
