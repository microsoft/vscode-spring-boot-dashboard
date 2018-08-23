// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import * as path from "path";
import { BootAppManager } from "./BootAppManager";
import { BootApp, STATE_INACTIVE, STATE_RUNNING } from "./BootApp";
import { ChildProcess, spawn } from "child_process";

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
        this._setState(app, STATE_RUNNING);
        const outputChannel: vscode.OutputChannel = this._getOutput(app);
        const classpathString = app.classpath.entries.map(e => e.kind === "source" ? e.outputFolder : e.path).join(path.delimiter);

        // Note: Command `vscode.java.resolveMainClass` is implemented in extension `vscode.java.resolveMainClass`
        const mainClassList = await vscode.commands.executeCommand('java.execute.workspaceCommand', 'vscode.java.resolveMainClass', app.path);
        if (mainClassList && mainClassList instanceof Array && mainClassList.length > 0) {
            const mainClassData: MainClassData = mainClassList.length === 1 ? mainClassList[0] :
                await vscode.window.showQuickPick(mainClassList.map(x => Object.assign({ label: x.mainClass }, x)));

            outputChannel.clear();
            outputChannel.show();
            let stderr: string = '';
            const javaProcess: ChildProcess = spawn("java", ["-classpath", classpathString, mainClassData.mainClass]);
            javaProcess.stdout.on('data', (data: string | Buffer): void => {
                outputChannel.append(data.toString());
            });
            javaProcess.stderr.on('data', (data: string | Buffer) => {
                stderr = stderr.concat(data.toString());
                outputChannel.append(data.toString());
            });
            javaProcess.on('error', (err: Error) => {
                console.error("on error: ", err.toString());
            });
            javaProcess.on('exit', (code: number, signal: string) => {
                this._setState(app, STATE_INACTIVE);
            });
            app.process = javaProcess;
        } else {
            vscode.window.showWarningMessage("Found no Main Class.");
        }
    }

    public async stopBootApp(app: BootApp): Promise<void> {
        // TODO: How to send a shutdown signal to the app instead of killing the process directly?
        if (app.process) {
            app.process.kill("SIGTERM");
            if (app.process.killed) {
                app.process = undefined;
            }
        }
    }

    public async openBootApp(app: BootApp): Promise<void> {
        // TODO: How to find out the port?
        vscode.window.showInformationMessage("Not implemented.");
    }

    private _setState(app: BootApp, state: string): void {
        const output: vscode.OutputChannel = this._getOutput(app);
        app.state = state;
        output.appendLine(`${app.name} is ${state} now.`);
        this._manager.fireDidChangeApps();
    }

    private _getChannelName(app: BootApp): string {
        return `BootApp_${app.name}`;
    }

    private _getOutput(app: BootApp): vscode.OutputChannel {
        const channelName: string = this._getChannelName(app);
        let output: vscode.OutputChannel | undefined = this._outputChannels.get(channelName);
        if (!output) {
            output = vscode.window.createOutputChannel(channelName);
            this._outputChannels.set(channelName, output);
        }
        return output;
    }
}

interface MainClassData {
    filePath: string;
    mainClass: string;
    projectName: string;
}
