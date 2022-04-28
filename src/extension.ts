// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

'use strict';
import * as vscode from 'vscode';
import { dispose as disposeTelemetryWrapper, initializeFromJsonFile, instrumentOperation, instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { BootApp } from './BootApp';
import { Controller } from './Controller';
import { init as initLiveDataController } from './controllers/LiveDataController';
import { appsProvider } from './views/apps';
import { beansProvider } from './views/beans';
import { mappingsProvider } from './views/mappings';

export async function activate(context: vscode.ExtensionContext) {
    await initializeFromJsonFile(context.asAbsolutePath("./package.json"), { firstParty: true });
    await instrumentOperation("activation", initializeExtension)(context);
}

export async function initializeExtension(_oprationId: string, context: vscode.ExtensionContext) {
    const controller: Controller = new Controller(appsProvider.manager, context);

    context.subscriptions.push(vscode.window.registerTreeDataProvider('spring-boot-dashboard', appsProvider));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring-boot-dashboard.refresh", () => {
        appsProvider.manager.fireDidChangeApps(undefined);
    }));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring-boot-dashboard.localapp.run", async (app: BootApp) => {
        await controller.runBootApp(app);
    }));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring-boot-dashboard.localapp.debug", async (app: BootApp) => {
        await controller.runBootApp(app, true);
    }));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring-boot-dashboard.localapp.stop", async (app: BootApp) => {
        await controller.stopBootApp(app);
    }));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring-boot-dashboard.localapp.open", async (app: BootApp) => {
        await controller.openBootApp(app);
    }));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring-boot-dashboard.localapp.run-multiple", async () => {
        await controller.runBootApps();
    }));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring-boot-dashboard.localapp.debug-multiple", async () => {
        await controller.runBootApps(true);
    }));
    context.subscriptions.push(instrumentOperationAsVsCodeCommand("spring-boot-dashboard.localapp.stop-multiple", async () => {
        await controller.stopBootApps();
    }))
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

    // live data
    context.subscriptions.push(vscode.window.registerTreeDataProvider('spring.beans', beansProvider));
    context.subscriptions.push(vscode.window.registerTreeDataProvider('spring.mappings', mappingsProvider));
    await initLiveDataController();

    // console.log
    context.subscriptions.push(vscode.commands.registerCommand("_spring.console.log", console.log));
}

// this method is called when your extension is deactivated
export async function deactivate() {
    await disposeTelemetryWrapper();
}
