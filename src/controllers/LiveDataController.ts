import * as vscode from "vscode";
import { sendInfo } from "vscode-extension-telemetry-wrapper";
import { AppState } from "../BootApp";
import { dashboard } from "../global";
import { getBeans, getContextPath, getMainClass, getMappings, getPid, getPort, getGcPausesMetrics, getMemoryMetrics, initialize, refreshMetrics } from "../models/stsApi";
import { LiveProcess } from "../types/sts-api";
import { isAlive } from "../utils";

class LiveInformationStore {
    public data: Map<string, unknown> = new Map();
}

let store: LiveInformationStore;

export async function init() {
    const stsApi = await initialize();
    store = new LiveInformationStore();

    stsApi.onDidLiveProcessConnect((payload: LiveProcess | string) => {
        sendInfo("", { name: "onDidLiveProcessConnect" });
        updateProcessInfo(payload);
    });
    stsApi.onDidLiveProcessDisconnect((payload: LiveProcess | string) => {
        sendInfo("", { name: "onDidLiveProcessDisconnect" });
        resetProcessInfo(payload);
    });
    stsApi.onDidLiveProcessUpdate((payload: LiveProcess | string) => {
        sendInfo("", { name: "onDidLiveProcessUpdate" });
        updateProcessInfo(payload);
    });

    // proposed API on vscode-spring-boot extension. check before calling.
    stsApi.onDidLiveProcessGcPausesMetricsUpdate?.(updateProcessGcPausesMetrics);
    stsApi.onDidLiveProcessMemoryMetricsUpdate?.(updateProcessMemoryMetrics);

}

export function connectedProcessKeys() {
    return Array.from(store.data.keys());
}

async function updateProcessInfo(payload: string | LiveProcess) {
    const liveProcess = await parsePayload(payload);
    const { processKey, processName, type } = liveProcess;

    const beans = await getBeans(processKey);
    dashboard.beansProvider.refreshLive(liveProcess, beans);

    const mappings = await getMappings(processKey);
    dashboard.mappingsProvider.refreshLive(liveProcess, mappings);

    const port = await getPort(processKey);
    const contextPath = await getContextPath(processKey);
    store.data.set(processKey, { processName, beans, mappings, port });

    if (type === "local") {
        const runningApp = dashboard.appsProvider.manager.getAppByPid(liveProcess.pid);
        if (runningApp) {
            runningApp.port = parseInt(port);
            runningApp.contextPath = contextPath;
            runningApp.state = AppState.RUNNING; // will refresh tree item
        }
    }

    dashboard.appsProvider.refresh(undefined);

    // memory view
    dashboard.memoryViewProvider.refreshLiveMetrics(liveProcess, "heap", []);
    dashboard.memoryViewProvider.refreshLiveMetrics(liveProcess, "non-heap", []);
    dashboard.memoryViewProvider.refreshLiveMetrics(liveProcess, "gc-pauses", []);

    // See https://github.com/microsoft/vscode-spring-boot-dashboard/issues/287
    // send a memory metrics request, ensuring following notification comes
    if (type === "local") {
        await refreshMetrics(processKey, "memory");
        // await updateProcessMemoryMetrics(payload);
    }
}

async function updateProcessGcPausesMetrics(payload: string | LiveProcess) {
    const liveProcess = await parsePayload(payload);
    const { processKey } = liveProcess;

    const gcPauses = await getGcPausesMetrics(processKey);
    if (gcPauses) {
        dashboard.memoryViewProvider.refreshLiveMetrics(liveProcess, "gc-pauses", gcPauses);
    }
}

async function updateProcessMemoryMetrics(payload: string | LiveProcess) {
    const liveProcess = await parsePayload(payload);
    const { processKey } = liveProcess;

    const heapMemMetrics = await getMemoryMetrics(processKey, "heapMemory");
    const nonHeapMemMetrics = await getMemoryMetrics(processKey, "nonHeapMemory");

    if (!store.data.has(processKey)) {
        return;
    }

    if (heapMemMetrics || nonHeapMemMetrics) {
        await vscode.commands.executeCommand("setContext", "spring.memoryGraphs:hasLiveProcess", liveProcess !== undefined);
        dashboard.memoryViewProvider.refreshLiveMetrics(liveProcess, "heap", heapMemMetrics);
        dashboard.memoryViewProvider.refreshLiveMetrics(liveProcess, "non-heap", nonHeapMemMetrics);
    }
}

async function resetProcessInfo(payload: string | LiveProcess) {
    const liveProcess = await parsePayload(payload);
    store.data.delete(liveProcess.processKey);
    dashboard.beansProvider.refreshLive(liveProcess, undefined);
    dashboard.mappingsProvider.refreshLive(liveProcess, undefined);
    dashboard.memoryViewProvider.refreshLiveMetrics(liveProcess, "heap", undefined);
    dashboard.memoryViewProvider.refreshLiveMetrics(liveProcess, "non-heap", undefined);
    dashboard.memoryViewProvider.refreshLiveMetrics(liveProcess, "gc-pauses", undefined);
    await vscode.commands.executeCommand("setContext", "spring.memoryGraphs:hasLiveProcess", store.data.size > 0);
    if (liveProcess.type === "local") {
        const disconnectedApp = dashboard.appsProvider.manager.getAppByPid(liveProcess.pid);
        // Workaound for: app is still running if manually disconnect from live process connection.
        if (disconnectedApp && !await isAlive(disconnectedApp.pid)) {
            disconnectedApp.reset();
        }
    }

    dashboard.appsProvider.refresh(undefined);
}

/**
 *
 * Fix complatibility of lower versions.
 *
 * @param payload string for v1.33, LocalLiveProcess for v1.34
 * @returns
 */
async function parsePayload(payload: string | LiveProcess): Promise<LiveProcess> {
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
