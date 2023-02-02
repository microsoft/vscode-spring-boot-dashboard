// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

'use strict';
import * as vscode from 'vscode';
import { dispose as disposeTelemetryWrapper, initialize, instrumentOperation, instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { BootApp } from './BootApp';
import { getAiKey, getExtensionId, getExtensionVersion, loadPackageInfo } from './contextUtils';
import { Controller } from './Controller';
import { init as initLiveDataController } from './controllers/LiveDataController';
import { initSymbols } from './controllers/SymbolsController';
import { RemoteBootAppData, RemoteBootAppDataProvider, RemoteBootAppDataProviderOptions } from './extension.api';
import { dispose as disposeGutter, init as initGutter } from './gutter';
import { requestWorkspaceSymbols } from './models/stsApi';
import { navigateToLocation } from './models/symbols';
import { showBeanHierarchy, showDependencies, showInjectedInto } from './references-view';
import { showFilterInView } from './utils';
import { appsProvider } from './views/apps';
import { beansProvider, openBeanHandler } from './views/beans';
import { init as initActuatorGuide } from './views/guide';
import { mappingsProvider, openEndpointHandler } from './views/mappings';
import { memoryProvider } from './views/memory';

export async function activate(context: vscode.ExtensionContext) {
    await loadPackageInfo(context);
    // Usage data statistics.
    if (getAiKey()) {
        initialize(getExtensionId(), getExtensionVersion(), getAiKey(), { firstParty: true });
    }
    return await instrumentOperation("activation", initializeExtension)(context);
}

export async function initializeExtension(_oprationId: string, context: vscode.ExtensionContext) {
    const controller: Controller = new Controller(appsProvider.manager, context);

    const appsView = vscode.window.createTreeView('spring.apps', { treeDataProvider: appsProvider, showCollapseAll: false });
    context.subscriptions.push(appsView);
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring-boot-dashboard.refresh", () => {
        appsProvider.manager.fireDidChangeApps(undefined);
    }));

    // app related commands
    context.subscriptions.push(
        instrumentOperationAsVsCodeCommand("spring-boot-dashboard.localapp.run", async (app: BootApp) => await controller.runBootApp(app)),
        instrumentOperationAsVsCodeCommand("spring-boot-dashboard.localapp.debug", async (app: BootApp) => await controller.runBootApp(app, true)),
        instrumentOperationAsVsCodeCommand("spring-boot-dashboard.localapp.stop", async (app: BootApp) => await controller.stopBootApp(app)),
        instrumentOperationAsVsCodeCommand("spring-boot-dashboard.localapp.open", async (app: BootApp) => await controller.openBootApp(app)),
        instrumentOperationAsVsCodeCommand("spring-boot-dashboard.localapp.run-multiple", async () => await controller.runBootApps()),
        instrumentOperationAsVsCodeCommand("spring-boot-dashboard.localapp.debug-multiple", async () => await controller.runBootApps(true)),
        instrumentOperationAsVsCodeCommand("spring-boot-dashboard.localapp.stop-multiple", async () => await controller.stopBootApps()),
    );

    vscode.debug.onDidStartDebugSession((session: vscode.DebugSession) => {
        if (session.type === "java") {
            controller.onDidStartBootApp(session);
        }
    });
    vscode.debug.onDidTerminateDebugSession((session: vscode.DebugSession) => {
        if (session.type === "java") {
            controller.onDidStopBootApp(session);
        }
    });
    vscode.debug.onDidReceiveDebugSessionCustomEvent(e => {
        if (e.session.type === 'java' && e.event === 'processid') {
            const app = appsProvider.manager.getAppList().find(app => app.activeSessionName === e.session.name);
            if (app) {
                app.pid = parseInt(e.body.processId);
            }
        }
    });

    // live data
    const beansView = vscode.window.createTreeView('spring.beans', { treeDataProvider: beansProvider, showCollapseAll: true });
    context.subscriptions.push(beansView);
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring.beans.reveal", (element) => {
        // find and focus on specific element if possible.
        const item = beansProvider.getBeanBySymbol(element?.raw);
        if (item) {
            beansView.reveal(item, {
                focus: true
            });
        } else {
            // fallback to reveal whole view.
            vscode.commands.executeCommand("spring.beans.focus");
        }
    }));
    const mappingsView = vscode.window.createTreeView('spring.mappings', { treeDataProvider: mappingsProvider, showCollapseAll: true });
    context.subscriptions.push(mappingsView);
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring.mappings.reveal", (element) => {
        // find and focus on specific element if possible.
        const item = mappingsProvider.getMappingBySymbol(element?.raw);
        if (item) {
            mappingsView.reveal(item, {
                focus: true
            });
        } else {
            // fallback to reveal whole view.
            vscode.commands.executeCommand("spring.mappings.focus");
        }
    }));
    for (const viewId of ["spring.beans", "spring.mappings"]) {
        context.subscriptions.push(instrumentOperationAsVsCodeCommand(`${viewId}.find`, async () => await showFilterInView(viewId)));
    }

    await initLiveDataController();
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring.dashboard.endpoint.open", openEndpointHandler));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring.dashboard.endpoint.navigate", navigateToLocation));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring.dashboard.bean.open", openBeanHandler));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring.dashboard.bean.navigate", navigateToLocation));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring.dashboard.mapping.showAll", () => mappingsProvider.showAll = true));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring.dashboard.mapping.showDefined", () => mappingsProvider.showAll = false));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring.dashboard.bean.showAll", () => beansProvider.showAll = true));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring.dashboard.bean.showDefined", () => beansProvider.showAll = false));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring.staticData.refresh", () => initSymbols(0, true)));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring.dashboard.bean.showDependencies", showDependencies));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring.dashboard.bean.showInjectedInto", showInjectedInto));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring.dashboard.bean.showHierarchy", showBeanHierarchy));

    initActuatorGuide(context);
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("_spring.project.run", async (appPath: string) => {
        const targetApp = controller.getAppList().find(app => app.path === appPath);
        if (targetApp) {
            await controller.runBootApp(targetApp);
        }
    }));

    // Gutter
    const gutterEnabled = () => {
        const gutterOption = vscode.workspace.getConfiguration("spring.dashboard").get("enableGutter");
        if (gutterOption === "auto" && vscode.version.includes("insider") || gutterOption === "on") {
            // By default preview features in insiders only
            return true;
        } else {
            return false;
        }
    };
    if (gutterEnabled()) {
        initGutter(context);
    }
    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration("spring.dashboard.enableGutter")) {
            if (gutterEnabled()) {
                initGutter(context);
            } else {
                disposeGutter();
            }
        }
    });

    // console.log
    context.subscriptions.push(vscode.commands.registerCommand("_spring.console.log", console.log));
    context.subscriptions.push(vscode.commands.registerCommand("_spring.symbols", requestWorkspaceSymbols));

    // memory view
    const provider = memoryProvider;
    memoryProvider.extensionUrl = context.extensionUri;
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(
        "memory.memoryView",
        provider
    ));

    // remote apps
    /**
     * sts/livedata/remoteConnect(owner: string, apps: {host: string, jmlurl: string}[])
     * sts/livedata/disconnect(obj: {processKey: string}) // processKey of remote app is currently `remote process - ${jmxurl}`.
     */
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring.remoteApp.connect", async (item: RemoteBootAppData) => {
        await vscode.commands.executeCommand("sts/livedata/remoteConnect", item.name, [item]);
    }));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring.remoteApp.disconnect", async (item: RemoteBootAppData) => {
        await vscode.commands.executeCommand("sts/livedata/disconnect", { processKey: `remote process - ${item.jmxurl}` });
    }));

    return {
        registerRemoteBootAppDataProvider: (name: string, provider: RemoteBootAppDataProvider, options?: RemoteBootAppDataProviderOptions) => appsProvider.remoteAppManager.registerRemoteBootAppDataProvider(name, provider, options)
    }
}

// this method is called when your extension is deactivated
export async function deactivate() {
    await disposeTelemetryWrapper();
}
