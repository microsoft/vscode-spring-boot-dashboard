// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

'use strict';
import * as vscode from 'vscode';
import { LocalAppTreeProvider } from './LocalAppTree';
import { BootAppManager } from './BootAppManager';
import { BootApp, STATE_INACTIVE } from './BootApp';
import { Controller } from './Controller';

let localAppManager: BootAppManager;

export function activate(context: vscode.ExtensionContext) {    
    localAppManager = new BootAppManager();
    const localTree: LocalAppTreeProvider = new LocalAppTreeProvider(context, localAppManager);
    const controller: Controller = new Controller(localAppManager);

    context.subscriptions.push(vscode.window.registerTreeDataProvider('spring-boot-dashboard', localTree));
    context.subscriptions.push(vscode.commands.registerCommand("spring-boot-dashboard.refresh", () => {
        localAppManager.fireDidChangeApps();
    }));
    context.subscriptions.push(vscode.commands.registerCommand("spring-boot-dashboard.localapp.start", (app: BootApp) => {
        controller.startBootApp(app);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("spring-boot-dashboard.localapp.debug", (app: BootApp) => {
        controller.startBootApp(app, true);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("spring-boot-dashboard.localapp.stop", (app: BootApp) => {
        controller.stopBootApp(app);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("spring-boot-dashboard.localapp.open", (app: BootApp) => {
        controller.openBootApp(app);
    }));

    vscode.debug.onDidTerminateDebugSession(e => {
        if (e.type === "java") {
            const app = localAppManager.getAppList().find(app => (app.activeSession && app.activeSession.name === e.name) as boolean);
            if(app) {
                controller.setState(app, STATE_INACTIVE);
            }
        }
    });
}

// this method is called when your extension is deactivated
export function deactivate() {
}
