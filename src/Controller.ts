// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { BootAppManager } from "./BootAppManager";
import { BootApp, STATE_INACTIVE } from "./BootApp";

export class Controller {
    private _outputChannels: Map<string, vscode.OutputChannel>;
    private _manager: BootAppManager;

    constructor(manager: BootAppManager) {
        this._outputChannels = new Map<string, vscode.OutputChannel>();
        this._manager = manager;
    }

    public getAppList(): BootApp[] {
        return this._manager.getAppList();
    }

    public async startBootApp(app: BootApp): Promise<void> {
        // TODO
        this.setState(app, "running");
        vscode.window.showInformationMessage("Not implemented.");
    }

    public async stopBootApp(app: BootApp): Promise<void> {
        // TODO
        this.setState(app, STATE_INACTIVE);
        vscode.window.showInformationMessage("Not implemented.");
    }

    public async openBootApp(app: BootApp): Promise<void> {
        vscode.window.showInformationMessage("Not implemented.");
    }

    private setState(app: BootApp, state: string): void {
        const output: vscode.OutputChannel = this.getOutput(app);
        app.state = state;
        output.appendLine(`${app.name} is ${state} now.`);
        this._manager.fireDidChangeApps();
    }

    private getChannelName(app: BootApp): string {
        return `BootApp_${app.name}`;
    }

    private getOutput(app: BootApp): vscode.OutputChannel {
        const channelName: string = this.getChannelName(app);
        let output: vscode.OutputChannel | undefined = this._outputChannels.get(channelName);
        if (!output) {
            output = vscode.window.createOutputChannel(channelName);
            this._outputChannels.set(channelName, output);
        }
        return output;
    }
}