// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

'use strict';
import * as vscode from 'vscode';
import { dispose as disposeTelemetryWrapper, initializeFromJsonFile, instrumentOperation } from "vscode-extension-telemetry-wrapper";
import { LocalAppTreeProvider } from './LocalAppTree';
import { BootAppManager } from './BootAppManager';
import { BootApp } from './BootApp';
import { Controller } from './Controller';

let localAppManager: BootAppManager;

export async function activate(context: vscode.ExtensionContext) {
    await initializeFromJsonFile(context.asAbsolutePath("./package.json"));
    await instrumentOperation("activation", initializeExtension)(context);
}

export async function initializeExtension(oprationId: string, context: vscode.ExtensionContext) {
    localAppManager = new BootAppManager();
    const localTree: LocalAppTreeProvider = new LocalAppTreeProvider(context, localAppManager);
    const controller: Controller = new Controller(localAppManager, context);

    context.subscriptions.push(vscode.window.registerTreeDataProvider('spring-boot-dashboard', localTree));
    context.subscriptions.push(instrumentAndRegisterCommand("spring-boot-dashboard.refresh", () => {
        localAppManager.fireDidChangeApps();
    }));
    context.subscriptions.push(instrumentAndRegisterCommand("spring-boot-dashboard.localapp.start", async (app: BootApp) => {
        await controller.startBootApp(app);
    }));
    context.subscriptions.push(instrumentAndRegisterCommand("spring-boot-dashboard.localapp.debug", async (app: BootApp) => {
        await controller.startBootApp(app, true);
    }));
    context.subscriptions.push(instrumentAndRegisterCommand("spring-boot-dashboard.localapp.stop", async (app: BootApp) => {
        await controller.stopBootApp(app);
    }));
    context.subscriptions.push(instrumentAndRegisterCommand("spring-boot-dashboard.localapp.open", async (app: BootApp) => {
        await controller.openBootApp(app);
    }));
    context.subscriptions.push(instrumentAndRegisterCommand("spring-boot-dashboard.localapp.start-multiple", async () => {
        await controller.startBootApps();
    }));
    context.subscriptions.push(instrumentAndRegisterCommand("spring-boot-dashboard.localapp.debug-multiple", async () => {
        await controller.startBootApps(true);
    }));
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
}

// this method is called when your extension is deactivated
export async function deactivate() {
    await disposeTelemetryWrapper();
}

function instrumentAndRegisterCommand(name: string, cb: (...args: any[]) => any) {
    const instrumented = instrumentOperation(name, async (_operationId, myargs) => await cb(myargs));
    return vscode.commands.registerCommand(name, instrumented);
}
