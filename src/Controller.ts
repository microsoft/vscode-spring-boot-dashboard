// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { BootAppManager } from "./BootAppManager";
import { BootApp } from "./BootApp";

export class Controller {
    private _outputChannels: Map<string, vscode.OutputChannel>;
    private _onDidChangeTreeData: vscode.EventEmitter<BootApp | undefined>;
    private _manager: BootAppManager;

    constructor(manager: BootAppManager, onDidChangeTreeData: vscode.EventEmitter<BootApp | undefined>) {
        this._outputChannels = new Map<string, vscode.OutputChannel>();
        this._onDidChangeTreeData = onDidChangeTreeData;
        this._manager = manager;
    }

    public getAppList() : BootApp[] {
        return this._manager.getAppList();
    }

    public async startBootApp(app: BootApp) : Promise<void> {
        // TODO
        this.setState(app, "running");
        vscode.window.showInformationMessage("Not implemented.");
    }

    public async stopBootApp(app: BootApp) : Promise<void> {
        // TODO
        this.setState(app, "inactive");
        vscode.window.showInformationMessage("Not implemented.");
    }

    private setState(app: BootApp, state: string): void {
        const output: vscode.OutputChannel = this.getOutput(app);
        app.setState(state);
        output.appendLine(`${app.getName()} is ${state} now.`);
        this._onDidChangeTreeData.fire();
    }

    private getChannelName(app: BootApp): string {
        return `BootApp_${app.getName()}`;
    }

    private getOutput(app: BootApp): vscode.OutputChannel {
        const channelName: string = this.getChannelName(app);
        let output: vscode.OutputChannel | undefined = this._outputChannels.get(channelName);
        if (!output) {
            output  = vscode.window.createOutputChannel(channelName);
            this._outputChannels.set(channelName, output);
        }
        return output;
    }
}