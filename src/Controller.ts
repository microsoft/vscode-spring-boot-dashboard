// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { BootAppManager } from "./BootAppManager";
import { BootApp, STATE_RUNNING, STATE_INACTIVE } from "./BootApp";

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

    public async startBootApp(app: BootApp, debug?: boolean): Promise<void> {
        const mainClasData = await this._getMainClass(app.path);

        if (mainClasData) {
            let targetConfig = this._getLaunchConfig(mainClasData);
            if (!targetConfig) {
                targetConfig = await this._createNewLaunchConfig(mainClasData);
            }
            app.activeSessionName = targetConfig.name;
            const ok: boolean = await vscode.debug.startDebugging(
                vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(app.path)),
                Object.assign({}, targetConfig, { noDebug: !debug })
            );
            if (ok) {
                // Cannot determine status. It always returns true now. 
                // See: https://github.com/Microsoft/vscode/issues/54214
            }
        } else {
            vscode.window.showWarningMessage("Found no Main Class.");
        }
    }

    public onDidStartBootApp(session: vscode.DebugSession): void {
        const app: BootApp | undefined = this._manager.getAppList().find((elem: BootApp) => elem.activeSessionName === session.name);
        if (app) {
            this._manager.bindDebugSession(app, session);
            this._setState(app, STATE_RUNNING);
        }
    }

    public async stopBootApp(app: BootApp, restart?: boolean): Promise<void> {
        // TODO: How to send a shutdown signal to the app instead of killing the process directly?
        const session: vscode.DebugSession | undefined = this._manager.getSessionByApp(app);
        if (session) {
            await session.customRequest("disconnect", { restart: !!restart });
        } else {
            // What if session not found? Force to set STATE_INACTIVE?
        }
    }

    public onDidStopBootApp(session: vscode.DebugSession): void {
        const app = this._manager.getAppBySession(session);
            if (app) {
                this._setState(app, STATE_INACTIVE);
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

    private async _getMainClass(folder: string): Promise<MainClassData | null> {
        // Note: Command `vscode.java.resolveMainClass` is implemented in extension `vscode.java.resolveMainClass`
        const mainClassList = await vscode.commands.executeCommand('java.execute.workspaceCommand', 'vscode.java.resolveMainClass', folder);
        if (mainClassList && mainClassList instanceof Array && mainClassList.length > 0) {
            return mainClassList.length === 1 ? mainClassList[0] :
                await vscode.window.showQuickPick(mainClassList.map(x => Object.assign({ label: x.mainClass }, x)));
        }
        return Promise.resolve(null);
    }

    private _getLaunchConfig(mainClasData: MainClassData) {
        const launchConfigurations: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("launch", vscode.Uri.file(mainClasData.filePath));
        const rawConfigs: vscode.DebugConfiguration[] = launchConfigurations.configurations;
        console.log(rawConfigs);
        return rawConfigs.find(conf => conf.type === "java" && conf.request === "launch" && conf.mainClass === mainClasData.mainClass);
    }

    private _constructLaunchConfigName(mainClass: string, projectName: string) {
        const prefix = "Spring Boot-";
        let name = prefix + mainClass.substr(mainClass.lastIndexOf(".") + 1);
        if (projectName !== undefined) {
            name += `<${projectName}>`;
        }
        return name;
    }

    private async _createNewLaunchConfig(mainClasData: MainClassData): Promise<vscode.DebugConfiguration> {
        const newConfig = {
            type: "java",
            name: this._constructLaunchConfigName(mainClasData.mainClass, mainClasData.projectName),
            request: "launch",
            cwd: "${workspaceFolder}",
            console: "internalConsole",
            mainClass: mainClasData.mainClass,
            projectName: mainClasData.projectName,
            args: "",
        };
        const launchConfigurations: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("launch", vscode.Uri.file(mainClasData.filePath));
        const configs: vscode.DebugConfiguration[] = launchConfigurations.configurations;
        configs.push(newConfig);
        await launchConfigurations.update("configurations", configs);
        return newConfig;
    }
}

interface MainClassData {
    filePath: string;
    mainClass: string;
    projectName: string;
}
