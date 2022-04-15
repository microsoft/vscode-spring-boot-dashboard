// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

'use strict';
import * as vscode from 'vscode';
import { dispose as disposeTelemetryWrapper, initializeFromJsonFile, instrumentOperation } from "vscode-extension-telemetry-wrapper";
import { BootApp } from './BootApp';
import { BootAppManager } from './BootAppManager';
import { Controller } from './Controller';
import { LocalAppTreeProvider } from './LocalAppTree';
import { initialize } from './stsApi';
import { BeansDataProvider } from './views/beans';
import { MappingsDataProvider } from './views/mappings';

let localAppManager: BootAppManager;

export async function activate(context: vscode.ExtensionContext) {
    await initializeFromJsonFile(context.asAbsolutePath("./package.json"), { firstParty: true });
    await instrumentOperation("activation", initializeExtension)(context);
}

export async function initializeExtension(_oprationId: string, context: vscode.ExtensionContext) {
    localAppManager = new BootAppManager();
    const localTree: LocalAppTreeProvider = new LocalAppTreeProvider(localAppManager);
    const controller: Controller = new Controller(localAppManager, context);

    context.subscriptions.push(vscode.window.registerTreeDataProvider('spring-boot-dashboard', localTree));
    context.subscriptions.push(instrumentAndRegisterCommand("spring-boot-dashboard.refresh", () => {
        localAppManager.fireDidChangeApps();
    }));
    context.subscriptions.push(instrumentAndRegisterCommand("spring-boot-dashboard.localapp.run", async (app: BootApp) => {
        await controller.runBootApp(app);
    }));
    context.subscriptions.push(instrumentAndRegisterCommand("spring-boot-dashboard.localapp.debug", async (app: BootApp) => {
        await controller.runBootApp(app, true);
    }));
    context.subscriptions.push(instrumentAndRegisterCommand("spring-boot-dashboard.localapp.stop", async (app: BootApp) => {
        await controller.stopBootApp(app);
    }));
    context.subscriptions.push(instrumentAndRegisterCommand("spring-boot-dashboard.localapp.open", async (app: BootApp) => {
        await controller.openBootApp(app);
    }));
    context.subscriptions.push(instrumentAndRegisterCommand("spring-boot-dashboard.localapp.run-multiple", async () => {
        await controller.runBootApps();
    }));
    context.subscriptions.push(instrumentAndRegisterCommand("spring-boot-dashboard.localapp.debug-multiple", async () => {
        await controller.runBootApps(true);
    }));
    context.subscriptions.push(instrumentAndRegisterCommand("spring-boot-dashboard.localapp.stop-multiple", async () => {
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

    const beansProvider = new BeansDataProvider();
    context.subscriptions.push(vscode.window.registerTreeDataProvider('spring.beans', beansProvider));

    const mappingsProvider = new MappingsDataProvider();
    context.subscriptions.push(vscode.window.registerTreeDataProvider('spring.mappings', mappingsProvider));

    await initialize(beansProvider, mappingsProvider);

    // console.log
    context.subscriptions.push(vscode.commands.registerCommand("spring.console.log", console.log));
}

// this method is called when your extension is deactivated
export async function deactivate() {
    await disposeTelemetryWrapper();
}

function instrumentAndRegisterCommand(name: string, cb: (...args: any[]) => any) {
    const instrumented = instrumentOperation(name, async (_operationId, myargs) => await cb(myargs));
    return vscode.commands.registerCommand(name, instrumented);
}
