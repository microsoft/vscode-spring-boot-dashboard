// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { findJvm } from "@pivotal-tools/jvm-launch-utils";
import { ChildProcess } from "child_process";
import * as path from "path";
import * as vscode from "vscode";
import { AppState, BootApp } from "./BootApp";
import { LocalAppManager } from "./LocalAppManager";
import { MainClassData } from "./types/jdtls";
import { constructOpenUrl, isActuatorJarFile, readAll } from "./utils";

import getPort = require("get-port");
import { sendInfo } from "vscode-extension-telemetry-wrapper";
import { dashboard } from "./global";

export class LocalAppController {

    constructor(
        private manager: LocalAppManager,
        private context: vscode.ExtensionContext
    ) { }

    public getAppList(): BootApp[] {
        return this.manager.getAppList();
    }

    public async runBootApps(debug?: boolean) {
        const appList = this.getAppList();
        if (appList.length === 1 && appList[0].state !== AppState.RUNNING) {
            this.runBootApp(appList[0], debug);
        } else {
            const appsToRun = await vscode.window.showQuickPick(
                appList.filter(app => app.state !== AppState.RUNNING).map(app => ({ label: app.name, path: app.path })), /** items */
                { canPickMany: true, placeHolder: `Select apps to ${debug ? "debug" : "run"}.` } /** options */
            );
            if (appsToRun !== undefined) {
                const appPaths = appsToRun.map(elem => elem.path);
                await Promise.all(appList.filter(app => appPaths.indexOf(app.path) > -1).map(app => this.runBootApp(app, debug)));
            }
        }
    }

    public async runBootApp(app: BootApp, debug?: boolean, profile?: string): Promise<void> {
        const mainClasData = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Window, title: `Resolving main classes for ${app.name}...` },
            async () => {
                const mainClassList = await app.getMainClasses();

                if (mainClassList && mainClassList instanceof Array && mainClassList.length > 0) {
                    return mainClassList.length === 1 ? mainClassList[0] :
                        await vscode.window.showQuickPick(mainClassList.map(x => Object.assign({ label: x.mainClass }, x)), { placeHolder: `Specify the main class for ${app.name}` });
                }
                return null;
            }
        );
        if (mainClasData === null) {
            vscode.window.showWarningMessage("No main class is found.");
            return;
        }
        if (mainClasData === undefined) {
            return;
        }

        let targetConfig = this._getLaunchConfig(mainClasData);
        if (!targetConfig) {
            targetConfig = await this._createNewLaunchConfig(mainClasData);
        }
        app.activeSessionName = targetConfig.name;

        targetConfig = await resolveDebugConfigurationWithSubstitutedVariables(targetConfig);
        app.jmxPort = parseJMXPort(targetConfig.vmArgs);

        const cwdUri: vscode.Uri = vscode.Uri.parse(app.path);
        const launchConfig = Object.assign({}, targetConfig, {
            noDebug: !debug,
            cwd: cwdUri.fsPath,
        });
        if (profile) {
            launchConfig.vmArgs = launchConfig.vmArgs + ` -Dspring.profiles.active=${profile}`;
        }

        await vscode.debug.startDebugging(
            vscode.workspace.getWorkspaceFolder(cwdUri),
            launchConfig
        );
    }

    public async runAppWithProfile(app: BootApp, debug?: boolean) {
        const sourceFolders = app.classpath.entries.filter(cpe => cpe.kind === "source").map(cpe => cpe.path);
        const profilePattern = /^application-(.*).(properties|yml|yaml)$/;
        const detectedProfiles = [];
        for (const sf of sourceFolders) {
            try {
                const uri = vscode.Uri.file(sf);
                const entries = await vscode.workspace.fs.readDirectory(uri);
                const files = entries.filter(f => f[1] === vscode.FileType.File);
                for (const f of files) {
                    const res = profilePattern.exec(f[0]);
                    if (res !== null) {
                        const matchedProfile = res[1];
                        detectedProfiles.push(matchedProfile);
                    }
                }
            } catch (error) {
                console.log(error);
            }
        }
        const selectedProfiles = await vscode.window.showQuickPick(detectedProfiles, {
            ignoreFocusOut: true,
            canPickMany: true,
            title: "Select Active Profiles",
            placeHolder: "will add -Dspring.profiles.active=profile1,profile2... to VMArgs"
        });
        if (selectedProfiles !== undefined) {
            const profileArgs = selectedProfiles.join(",");
            await this.runBootApp(app, debug, profileArgs);
        }
    }


    public onDidStartBootApp(session: vscode.DebugSession): void {
        // exact match
        let app: BootApp | undefined = this.manager.getAppList().find((elem: BootApp) => elem.activeSessionName === session.name);

        // workaround if not launched from dashboard, where `activeSessionName` is not set
        // See https://github.com/microsoft/vscode-spring-boot-dashboard/issues/177
        if (app === undefined) {
            app = this.manager.getAppList().find((elem: BootApp) => elem.name === session.configuration.projectName);
        }

        if (app) {
            this.manager.bindDebugSession(app, session);
            if (isActuatorOnClasspath(session.configuration)) {
                // actuator enabled: wait live connection to update running state.
                this._setState(app, AppState.LAUNCHING);
                sendInfo("", { name: "onDidStartBootApp", withActuator: "true" });
            } else {
                // actuator absent: no live connection, set project as 'running' immediately.
                this._setState(app, AppState.RUNNING);
                // Guide to enable actuator
                this.showActuatorGuideIfNecessary(app);
                sendInfo("", { name: "onDidStartBootApp", withActuator: "false" });
            }
        }
    }

    public async stopBootApps() {
        const appList = this.getAppList();
        if (appList.length === 1 && appList[0].state !== AppState.INACTIVE) {
            this.stopBootApp(appList[0]);
        } else {
            const appsToStop = await vscode.window.showQuickPick(
                appList.filter(app => app.state !== AppState.INACTIVE).map(app => ({ label: app.name, path: app.path })), /** items */
                { canPickMany: true, placeHolder: "Select apps to stop." } /** options */
            );
            if (appsToStop !== undefined) {
                const appPaths = appsToStop.map(elem => elem.path);
                await Promise.all(appList.filter(app => appPaths.indexOf(app.path) > -1).map(app => this.stopBootApp(app)));
            }
        }
    }

    public async stopBootApp(app: BootApp, restart?: boolean): Promise<void> {
        // TODO: How to send a shutdown signal to the app instead of killing the process directly?
        const session: vscode.DebugSession | undefined = this.manager.getSessionByApp(app);
        if (session) {
            if (isRunInTerminal(session) && app.pid) {
                // kill corresponding process launched in terminal
                try {
                    process.kill(app.pid);
                } catch (error) {
                    console.log(error);
                    app.reset();
                }
            } else {
                await session.customRequest("disconnect", { restart: !!restart });
            }
        }
    }

    public onDidStopBootApp(session: vscode.DebugSession): void {
        const app = this.manager.getAppBySession(session);
        if (app) {
            this._setState(app, AppState.INACTIVE);
        }
    }

    private async getOpenUrlFromJMX(app: BootApp) {
        if (!app.jmxPort) {
            return undefined;
        }

        const jvm = await findJvm();
        if (!jvm) {
            return undefined;
        }

        const jmxurl = `service:jmx:rmi:///jndi/rmi://localhost:${app.jmxPort}/jmxrmi`;
        const javaProcess = jvm.jarLaunch(
            path.resolve(this.context.extensionPath, "lib", "java-extension.jar"),
            [
                "-Djmxurl=" + jmxurl
            ]
        );
        const stdout = javaProcess.stdout ? await readAll(javaProcess.stdout) : null;

        let port: number | undefined = undefined;
        let contextPath: string | undefined = undefined;

        READ_JMX_EXTENSION_RESPONSE: {
            if (stdout !== null) {
                let jmxExtensionResponse;

                try {
                    jmxExtensionResponse = JSON.parse(stdout);
                } catch (ex) {
                    console.log(ex);
                    break READ_JMX_EXTENSION_RESPONSE;
                }

                if (jmxExtensionResponse['local.server.port'] !== null && typeof jmxExtensionResponse['local.server.port'] === 'number') {
                    port = jmxExtensionResponse['local.server.port'];
                }

                if (jmxExtensionResponse['server.servlet.context-path'] !== null) {
                    contextPath = jmxExtensionResponse['server.servlet.context-path'];
                }

                if (jmxExtensionResponse['status'] !== null && jmxExtensionResponse['status'] === "failure") {
                    this._printJavaProcessError(javaProcess);
                }
            }
        }

        if (contextPath === undefined) {
            contextPath = ""; //if no context path is defined then fallback to root path
        }

        return port ? constructOpenUrl(contextPath, port) : undefined;
    }

    public async openBootApp(app: BootApp): Promise<void> {
        let openUrl: string | undefined;
        if (app.contextPath !== undefined && app.port !== undefined) {
            openUrl = constructOpenUrl(app.contextPath, app.port);
        } else {
            openUrl = await this.getOpenUrlFromJMX(app);
        }

        if (openUrl !== undefined) {
            const openWithExternalBrowser: boolean = vscode.workspace.getConfiguration("spring.dashboard").get("openWith") === "external";
            const browserCommand: string = openWithExternalBrowser ? "vscode.open" : "simpleBrowser.api.open";

            let uri = vscode.Uri.parse(openUrl);
            uri = await vscode.env.asExternalUri(uri); // Enables Remote envs like Codespaces
            vscode.commands.executeCommand(browserCommand, uri);
        } else {
            vscode.window.showErrorMessage("Couldn't determine port app is running on");
        }
    }

    private async _printJavaProcessError(javaProcess: ChildProcess) {
        if (javaProcess.stderr) {
            const err = await readAll(javaProcess.stderr);
            console.log(err);
        }
    }

    private _setState(app: BootApp, state: AppState): void {
        app.state = state;
        this.manager.fireDidChangeApps(app);
        dashboard.beansProvider.refresh(app);
        dashboard.mappingsProvider.refresh(app);
    }

    private _getLaunchConfig(mainClasData: MainClassData) {
        const launchConfigurations: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("launch", vscode.Uri.file(mainClasData.filePath));
        const rawConfigs: vscode.DebugConfiguration[] = launchConfigurations.configurations;
        return rawConfigs.find(conf => conf.type === "java" && conf.request === "launch" && conf.mainClass === mainClasData.mainClass && conf.projectName === mainClasData.projectName);
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
            mainClass: mainClasData.mainClass,
            projectName: mainClasData.projectName,
            args: "",
            envFile: "${workspaceFolder}/.env"
        };
        const launchConfigurations: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("launch", vscode.Uri.file(mainClasData.filePath));
        const configs: vscode.DebugConfiguration[] = launchConfigurations.configurations;
        configs.push(newConfig);
        await launchConfigurations.update("configurations", configs, vscode.ConfigurationTarget.WorkspaceFolder);
        return newConfig;
    }

    private showActuatorGuideIfNecessary(app: BootApp) {
        const command = "spring.promptToEnableActuator";
        const key = "LastTimeSeenActuatorGuide";

        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);

        const lastTimeSeen: number = this.context.globalState.get(key) ?? 0;
        if (new Date(lastTimeSeen) < lastMonth) {
            this.context.globalState.update(key, Date.now());
            vscode.commands.executeCommand(command, app, true /* asNotification */);
        }
    }

}

function isRunInTerminal(session: vscode.DebugSession) {
    return session.configuration.noDebug === true && session.configuration.console !== "internalConsole";
}

function isActuatorOnClasspath(debugConfiguration: vscode.DebugConfiguration): boolean {
    if (Array.isArray(debugConfiguration.classPaths)) {
        return !!debugConfiguration.classPaths.find(isActuatorJarFile);
    }
    return false;
}

async function resolveDebugConfigurationWithSubstitutedVariables(debugConfiguration: vscode.DebugConfiguration): Promise<vscode.DebugConfiguration> {
    if (!debugConfiguration.vmArgs) {
        debugConfiguration.vmArgs = "";
    } else if (debugConfiguration.vmArgs instanceof Array) {
        debugConfiguration.vmArgs = debugConfiguration.vmArgs.join(" ");
    }

    // Add default vmArgs if not specified
    if (debugConfiguration.vmArgs.indexOf("-Dcom.sun.management.jmxremote") < 0) {
        debugConfiguration.vmArgs += " -Dcom.sun.management.jmxremote";
    }
    if (debugConfiguration.vmArgs.indexOf("-Dcom.sun.management.jmxremote.port") < 0) {
        const jmxport = await getPort();
        debugConfiguration.vmArgs += ` -Dcom.sun.management.jmxremote.port=${jmxport}`;
    }
    if (debugConfiguration.vmArgs.indexOf("-Dcom.sun.management.jmxremote.authenticate=") < 0) {
        debugConfiguration.vmArgs += " -Dcom.sun.management.jmxremote.authenticate=false";
    }
    if (debugConfiguration.vmArgs.indexOf("-Dcom.sun.management.jmxremote.ssl=") < 0) {
        debugConfiguration.vmArgs += " -Dcom.sun.management.jmxremote.ssl=false";
    }
    if (debugConfiguration.vmArgs.indexOf("-Dspring.jmx.enabled=") < 0) {
        debugConfiguration.vmArgs += " -Dspring.jmx.enabled=true";
    }
    if (debugConfiguration.vmArgs.indexOf("-Djava.rmi.server.hostname=") < 0) {
        debugConfiguration.vmArgs += " -Djava.rmi.server.hostname=localhost";
    }
    if (debugConfiguration.vmArgs.indexOf("-Dspring.application.admin.enabled=") < 0) {
        debugConfiguration.vmArgs += " -Dspring.application.admin.enabled=true";
    }
    if (debugConfiguration.vmArgs.indexOf("-Dspring.boot.project.name=") < 0) {
        debugConfiguration.vmArgs += ` -Dspring.boot.project.name=${debugConfiguration.projectName}`;
    }


    return debugConfiguration;
}

function parseJMXPort(vmArgs: string): number | undefined {
    const matched = vmArgs.match(/-Dcom\.sun\.management\.jmxremote\.port=\d+/);
    if (matched) {
        const port = matched[0].substring("-Dcom.sun.management.jmxremote.port=".length);
        return parseInt(port);
    }
    return undefined;
}
