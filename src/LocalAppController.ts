// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { findJvm } from "@pivotal-tools/jvm-launch-utils";
import { ChildProcess } from "child_process";
import * as path from "path";
import * as vscode from "vscode";
import { AppState, BootApp } from "./BootApp";
import { dashboard } from "./global";
import {
    buildDashboardJvmArgs,
    createAttachDebugConfiguration,
    createGradleInitScript,
    ensureDashboardVmArgs,
    getConfiguredGradleTask,
    getGradleStorageDir,
    getWorkspaceLaunchStrategy,
    GradleContext,
    normalizeLaunchStrategy,
    resolveGradleContext,
    SPRING_DASHBOARD_APP_PATH,
    SPRING_DASHBOARD_SESSION_ROLE,
    waitForPort,
} from "./launchUtils";
import { LocalAppManager } from "./LocalAppManager";
import { MainClassData } from "./types/jdtls";
import { constructOpenUrl, isActuatorJarFile, isAlive, readAll, sleep } from "./utils";

import getPort = require("get-port");
import { sendInfo } from "vscode-extension-telemetry-wrapper";

const GRADLE_TASK_TYPE = "spring-boot-dashboard-gradle";
const GRADLE_TASK_SOURCE = "Spring Boot Dashboard";
const GRADLE_TASK_START_TIMEOUT_MS = 15000;
const GRADLE_ATTACH_TIMEOUT_MS = 30000;
const GRADLE_STOP_GRACE_PERIOD_MS = 2000;

interface GradleTaskDefinition extends vscode.TaskDefinition {
    appPath: string;
    launchId: string;
}

export class LocalAppController implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];

    constructor(
        private manager: LocalAppManager,
        private context: vscode.ExtensionContext
    ) {
        this.disposables.push(
            vscode.tasks.onDidEndTaskProcess((event) => {
                void this._handleGradleTaskProcessEnd(event);
            }),
            vscode.tasks.onDidEndTask((event) => {
                void this._handleGradleTaskEnd(event);
            })
        );
    }

    public dispose(): void {
        while (this.disposables.length > 0) {
            const disposable = this.disposables.pop();
            disposable?.dispose();
        }
        void this._cleanupGradleStorageDir();
    }

    public getAppList(): BootApp[] {
        return this.manager.getAppList();
    }

    public async runBootApps(debug?: boolean) {
        const appList = this.getAppList();
        if (appList.length === 1 && appList[0].state !== AppState.RUNNING) {
            await this.runBootApp(appList[0], debug);
        } else {
            const appsToRun = await vscode.window.showQuickPick(
                appList.filter(app => app.state !== AppState.RUNNING).map(app => ({ label: app.name, path: app.path })),
                { canPickMany: true, placeHolder: `Select apps to ${debug ? "debug" : "run"}.` }
            );
            if (appsToRun !== undefined) {
                const appPaths = appsToRun.map(elem => elem.path);
                await Promise.all(appList.filter(app => appPaths.indexOf(app.path) > -1).map(app => this.runBootApp(app, debug)));
            }
        }
    }

    public async runBootApp(app: BootApp, debug?: boolean, profile?: string): Promise<void> {
        const mainClassData = await this._resolveMainClass(app);
        if (mainClassData === undefined) {
            return;
        }

        const launchStrategy = getWorkspaceLaunchStrategy();
        if (launchStrategy === "gradle") {
            await this._runGradleBootApp(app, mainClassData, !!debug, profile);
            return;
        }

        await this._runJavaBootApp(app, mainClassData, !!debug, profile);
    }

    public async runAppWithProfile(app: BootApp, debug?: boolean) {
        const sourceFolders = app.classpath.entries.filter(cpe => cpe.kind === "source").map(cpe => cpe.path);
        const profilePattern = /^(application|bootstrap)-(.*)\.(properties|yml|yaml)$/;
        const detectedProfiles = new Set<string>();
        const foldersToCheck = [...sourceFolders];

        for (const sf of sourceFolders) {
            const configFolder = path.join(sf, "config");
            foldersToCheck.push(configFolder);
        }

        for (const folder of foldersToCheck) {
            try {
                const uri = vscode.Uri.file(folder);
                const entries = await vscode.workspace.fs.readDirectory(uri);
                const files = entries.filter(f => f[1] === vscode.FileType.File);
                for (const f of files) {
                    const res = profilePattern.exec(f[0]);
                    if (res !== null) {
                        detectedProfiles.add(res[2]);
                    }
                }
            } catch (error) {
                console.log(error);
            }
        }

        const selectedProfiles = await vscode.window.showQuickPick(Array.from(detectedProfiles), {
            ignoreFocusOut: true,
            canPickMany: true,
            title: "Select Active Profiles",
            placeHolder: "will run with spring.profiles.active=profile1,profile2..."
        });
        if (selectedProfiles !== undefined) {
            await this.runBootApp(app, debug, selectedProfiles.join(","));
        }
    }

    public onDidStartBootApp(session: vscode.DebugSession): void {
        const role = getSessionRole(session.configuration);
        if (role === "gradle-attach") {
            const appPath = session.configuration[SPRING_DASHBOARD_APP_PATH];
            const app = typeof appPath === "string" ? this.manager.getAppByPath(appPath) : undefined;
            if (app) {
                this.manager.bindDebugSession(app, session);
                app.gradleLaunch = {
                    ...app.gradleLaunch,
                    attachSessionName: session.name,
                    attachSessionId: session.id,
                    sessionRole: "gradle-attach",
                };
                this.manager.fireDidChangeApps(app);
            }
            return;
        }

        const app = this._resolveAppForSession(session);
        if (app) {
            app.launchStrategy = "java";
            this.manager.bindDebugSession(app, session);
            if (isActuatorOnClasspath(session.configuration)) {
                this._setState(app, AppState.LAUNCHING);
                sendInfo("", { name: "onDidStartBootApp", withActuator: "true", strategy: "java" });
            } else {
                this._setState(app, AppState.RUNNING);
                this.showActuatorGuideIfNecessary(app);
                sendInfo("", { name: "onDidStartBootApp", withActuator: "false", strategy: "java" });
            }
        }
    }

    public async stopBootApps() {
        const appList = this.getAppList();
        if (appList.length === 1 && appList[0].state !== AppState.INACTIVE) {
            await this.stopBootApp(appList[0]);
        } else {
            const appsToStop = await vscode.window.showQuickPick(
                appList.filter(app => app.state !== AppState.INACTIVE).map(app => ({ label: app.name, path: app.path })),
                { canPickMany: true, placeHolder: "Select apps to stop." }
            );
            if (appsToStop !== undefined) {
                const appPaths = appsToStop.map(elem => elem.path);
                await Promise.all(appList.filter(app => appPaths.indexOf(app.path) > -1).map(app => this.stopBootApp(app)));
            }
        }
    }

    public async stopBootApp(app: BootApp, restart?: boolean): Promise<void> {
        const activeLaunchStrategy = app.hasActiveGradleLaunch ? "gradle" : normalizeLaunchStrategy(app.launchStrategy);
        if (activeLaunchStrategy === "gradle") {
            await this._stopGradleBootApp(app);
            return;
        }

        const session: vscode.DebugSession | undefined = this.manager.getSessionByApp(app);
        if (session) {
            if (isRunInTerminal(session) && app.pid) {
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
        const role = getSessionRole(session.configuration);
        if (role === "gradle-attach") {
            const app = this.manager.unbindDebugSession(session);
            if (app) {
                const launch = app.gradleLaunch;
                if (launch.attachSessionId === session.id || launch.attachSessionName === session.name) {
                    app.gradleLaunch = {
                        ...launch,
                        attachSessionId: undefined,
                        attachSessionName: undefined,
                        sessionRole: undefined,
                    };
                    this.manager.fireDidChangeApps(app);
                }
            }
            return;
        }

        const app = this.manager.unbindDebugSession(session);
        if (app) {
            this._setState(app, AppState.INACTIVE);
        }
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
            uri = await vscode.env.asExternalUri(uri);
            vscode.commands.executeCommand(browserCommand, uri);
        } else {
            vscode.window.showErrorMessage("Couldn't determine port app is running on");
        }
    }

    private async _resolveMainClass(app: BootApp): Promise<MainClassData | undefined> {
        const mainClassData = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Window, title: `Resolving main classes for ${app.name}...` },
            async () => {
                const mainClassList = await app.getMainClasses();
                if (mainClassList && mainClassList instanceof Array && mainClassList.length > 0) {
                    return mainClassList.length === 1
                        ? mainClassList[0]
                        : await vscode.window.showQuickPick(mainClassList.map(x => Object.assign({ label: x.mainClass }, x)), {
                            placeHolder: `Specify the main class for ${app.name}`
                        });
                }
                return null;
            }
        );
        if (mainClassData === null) {
            vscode.window.showWarningMessage("No main class is found.");
            return undefined;
        }
        if (mainClassData === undefined) {
            return undefined;
        }
        return mainClassData;
    }

    private async _runJavaBootApp(app: BootApp, mainClassData: MainClassData, debug: boolean, profile?: string): Promise<void> {
        if (app.gradleLaunch.initScriptUri) {
            await this._clearGradleLaunch(app);
        } else {
            app.clearGradleLaunch();
            app.launchStrategy = "java";
        }

        let targetConfig = this._getLaunchConfig(mainClassData);
        if (!targetConfig) {
            targetConfig = await this._createNewLaunchConfig(mainClassData);
        }
        app.activeSessionName = targetConfig.name;
        app.launchStrategy = "java";

        targetConfig = await resolveDebugConfigurationWithSubstitutedVariables(targetConfig);
        app.jmxPort = parseJMXPort(targetConfig.vmArgs);

        const cwdUri: vscode.Uri = vscode.Uri.parse(app.path);
        const launchConfig = Object.assign({}, targetConfig, {
            noDebug: !debug,
            cwd: cwdUri.fsPath,
            [SPRING_DASHBOARD_SESSION_ROLE]: "java-launch",
            [SPRING_DASHBOARD_APP_PATH]: app.path,
        });
        if (profile) {
            launchConfig.vmArgs = `${launchConfig.vmArgs} -Dspring.profiles.active=${profile}`;
        }

        await vscode.debug.startDebugging(
            vscode.workspace.getWorkspaceFolder(cwdUri),
            launchConfig
        );
    }

    private async _runGradleBootApp(app: BootApp, mainClassData: MainClassData, debug: boolean, profile?: string): Promise<void> {
        if (app.hasActiveGradleLaunch || app.state !== AppState.INACTIVE) {
            const message = `${app.name} already has an active delegated launch. Stop it before starting another one.`;
            vscode.window.showErrorMessage(message);
            sendInfo("", { name: "runBootAppViaGradle", debug: String(debug), result: "failure", reason: "duplicate-launch" });
            return;
        }

        const configuredTask = getConfiguredGradleTask(debug);
        let execution: vscode.TaskExecution | undefined;
        try {
            const gradleContext = resolveGradleContext(app.path, configuredTask);
            const jmxPort = await getPort();
            const debugPort = debug ? await getPort() : undefined;
            const initScriptUri = await this._writeGradleInitScript(
                gradleContext,
                createGradleInitScript({
                    task: configuredTask,
                    projectDir: gradleContext.appFsPath,
                    appArgs: profile ? [`--spring.profiles.active=${profile}`] : [],
                    jvmArgs: buildDashboardJvmArgs(mainClassData.projectName, jmxPort),
                    debugEnabled: debug,
                    debugPort,
                })
            );

            const taskDefinition: GradleTaskDefinition = {
                type: GRADLE_TASK_TYPE,
                appPath: app.path,
                launchId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            };
            const task = this._createGradleTask(app, gradleContext, configuredTask, initScriptUri, taskDefinition);

            app.launchStrategy = "gradle";
            app.jmxPort = jmxPort;
            app.pid = undefined;
            app.port = undefined;
            app.contextPath = undefined;
            app.activeProfiles = undefined;
            app.activeSessionName = undefined;
            app.gradleLaunch = {
                launchStrategy: "gradle",
                pendingMainClass: mainClassData.mainClass,
                taskExecution: undefined,
                taskPath: configuredTask,
                taskId: taskDefinition.launchId,
                jmxPort,
                debugPort,
                initScriptUri,
                phase: "launching",
                sessionRole: debug ? "gradle-attach" : undefined,
            };

            execution = await vscode.tasks.executeTask(task);
            app.gradleLaunch = {
                ...app.gradleLaunch,
                taskExecution: execution,
            };

            await this._waitForTaskProcessStart(execution, GRADLE_TASK_START_TIMEOUT_MS);
            this._setStateAfterGradleLaunch(app);

            if (debug && debugPort !== undefined) {
                await waitForPort("localhost", debugPort, GRADLE_ATTACH_TIMEOUT_MS);
                const attachConfig = createAttachDebugConfiguration(
                    `Spring Boot (Gradle)-${app.name}`,
                    app.path,
                    mainClassData.projectName,
                    debugPort
                );
                const started = await vscode.debug.startDebugging(
                    vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(app.path)),
                    attachConfig
                );
                if (!started) {
                    throw new Error(`Failed to attach Java debugger to ${app.name}.`);
                }
            }

            sendInfo("", { name: "runBootAppViaGradle", debug: String(debug), result: "success" });
        } catch (error) {
            sendInfo("", {
                name: "runBootAppViaGradle",
                debug: String(debug),
                result: "failure",
                reason: error instanceof Error ? error.message : "unknown"
            });
            await this._cleanupFailedGradleLaunch(app, execution);
            vscode.window.showErrorMessage(error instanceof Error ? error.message : `Failed to launch ${app.name} with Gradle.`);
        }
    }

    private _createGradleTask(
        app: BootApp,
        gradleContext: GradleContext,
        configuredTask: string,
        initScriptUri: vscode.Uri,
        definition: GradleTaskDefinition
    ): vscode.Task {
        const args = ["-I", initScriptUri.fsPath, ...gradleContext.args];
        const task = new vscode.Task(
            definition,
            vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(app.path)) ?? vscode.TaskScope.Workspace,
            `${app.name} (${configuredTask})`,
            GRADLE_TASK_SOURCE,
            new vscode.ProcessExecution(gradleContext.executable, args, {
                cwd: gradleContext.rootDir,
            })
        );
        task.presentationOptions = {
            reveal: vscode.TaskRevealKind.Always,
            panel: vscode.TaskPanelKind.Dedicated,
            clear: false,
        };
        return task;
    }

    private async _writeGradleInitScript(gradleContext: GradleContext, content: string): Promise<vscode.Uri> {
        const dirUri = getGradleStorageDir();
        await vscode.workspace.fs.createDirectory(dirUri);
        const safeName = path.basename(gradleContext.appFsPath).replace(/[^a-zA-Z0-9_.-]/g, "_");
        const fileUri = vscode.Uri.joinPath(dirUri, `${safeName}-${Date.now()}-${Math.random().toString(16).slice(2)}.gradle`);
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, "utf8"));
        return fileUri;
    }

    private _setStateAfterGradleLaunch(app: BootApp): void {
        if (app.isActuatorOnClasspath) {
            app.gradleLaunch = {
                ...app.gradleLaunch,
                phase: "launching",
            };
            this._setState(app, AppState.LAUNCHING);
            sendInfo("", { name: "onDidStartBootApp", withActuator: "true", strategy: "gradle" });
        } else {
            app.gradleLaunch = {
                ...app.gradleLaunch,
                phase: "running",
            };
            this._setState(app, AppState.RUNNING);
            this.showActuatorGuideIfNecessary(app);
            sendInfo("", { name: "onDidStartBootApp", withActuator: "false", strategy: "gradle" });
        }
    }

    private async _stopGradleBootApp(app: BootApp): Promise<void> {
        const launch = app.gradleLaunch;
        app.gradleLaunch = {
            ...launch,
            phase: "stopping",
        };

        const session = this.manager.getSessionByApp(app);
        if (session) {
            try {
                await session.customRequest("disconnect", { restart: false });
            } catch (error) {
                console.log(error);
            }
        }

        if (launch.taskExecution) {
            try {
                launch.taskExecution.terminate();
            } catch (error) {
                console.log(error);
            }
            await this._waitForTaskEnd(launch.taskExecution, GRADLE_STOP_GRACE_PERIOD_MS).catch(error => {
                console.log(error);
            });
        }

        await sleep(GRADLE_STOP_GRACE_PERIOD_MS);
        if (app.pid && await isAlive(app.pid)) {
            try {
                process.kill(app.pid);
            } catch (error) {
                console.log(error);
            }
        }

        if (!app.pid || !await isAlive(app.pid)) {
            app.reset();
            await this._clearGradleLaunch(app);
        } else {
            app.gradleLaunch = {
                ...app.gradleLaunch,
                taskExecution: undefined,
            };
        }
        sendInfo("", { name: "stopBootAppViaGradle", result: "success" });
    }

    private async _cleanupFailedGradleLaunch(app: BootApp, execution?: vscode.TaskExecution): Promise<void> {
        if (execution) {
            try {
                execution.terminate();
            } catch (error) {
                console.log(error);
            }
        }
        app.reset();
        await this._clearGradleLaunch(app);
    }

    private async _clearGradleLaunch(app: BootApp): Promise<void> {
        const initScriptUri = app.gradleLaunch.initScriptUri;
        app.clearGradleLaunch();
        app.launchStrategy = "java";
        app.jmxPort = undefined;
        app.activeSessionName = undefined;
        if (initScriptUri) {
            try {
                await vscode.workspace.fs.delete(initScriptUri, { useTrash: false });
            } catch (error) {
                console.log(error);
            }
        }
        this.manager.fireDidChangeApps(app);
    }

    private async _cleanupGradleStorageDir(): Promise<void> {
        try {
            await vscode.workspace.fs.delete(getGradleStorageDir(), { recursive: true, useTrash: false });
        } catch (error) {
            console.log(error);
        }
    }

    private async _waitForTaskProcessStart(execution: vscode.TaskExecution, timeoutMs: number): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error("Gradle task did not start in time."));
            }, timeoutMs);

            const startDisposable = vscode.tasks.onDidStartTaskProcess((event) => {
                if (event.execution === execution) {
                    cleanup();
                    resolve();
                }
            });
            const endDisposable = vscode.tasks.onDidEndTask((event) => {
                if (event.execution === execution) {
                    cleanup();
                    reject(new Error("Gradle task finished before the process started."));
                }
            });
            const endProcessDisposable = vscode.tasks.onDidEndTaskProcess((event) => {
                if (event.execution === execution) {
                    cleanup();
                    reject(new Error(`Gradle task failed to start${formatExitCode(event.exitCode)}.`));
                }
            });

            const cleanup = () => {
                clearTimeout(timeout);
                startDisposable.dispose();
                endDisposable.dispose();
                endProcessDisposable.dispose();
            };
        });
    }

    private async _waitForTaskEnd(execution: vscode.TaskExecution, timeoutMs: number): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error("Timed out waiting for Gradle task to stop."));
            }, timeoutMs);

            const endDisposable = vscode.tasks.onDidEndTask((event) => {
                if (event.execution === execution) {
                    cleanup();
                    resolve();
                }
            });
            const endProcessDisposable = vscode.tasks.onDidEndTaskProcess((event) => {
                if (event.execution === execution) {
                    cleanup();
                    resolve();
                }
            });

            const cleanup = () => {
                clearTimeout(timeout);
                endDisposable.dispose();
                endProcessDisposable.dispose();
            };
        });
    }

    private async _handleGradleTaskEnd(event: vscode.TaskEndEvent): Promise<void> {
        const app = this._findAppByTaskExecution(event.execution);
        if (!app) {
            return;
        }

        if (!app.pid && app.gradleLaunch.phase !== "stopping") {
            app.reset();
            await this._clearGradleLaunch(app);
        }
    }

    private async _handleGradleTaskProcessEnd(event: vscode.TaskProcessEndEvent): Promise<void> {
        const app = this._findAppByTaskExecution(event.execution);
        if (!app) {
            return;
        }

        const wasStopping = app.gradleLaunch.phase === "stopping";
        app.gradleLaunch = {
            ...app.gradleLaunch,
            taskExecution: undefined,
        };

        if (app.pid && await isAlive(app.pid)) {
            if (wasStopping) {
                this.manager.fireDidChangeApps(app);
            } else {
                app.gradleLaunch = {
                    ...app.gradleLaunch,
                    phase: "running",
                };
            }
            return;
        }

        app.reset();
        await this._clearGradleLaunch(app);

        if (!wasStopping && event.exitCode !== 0) {
            const message = `${app.name} failed to stay running with Gradle${formatExitCode(event.exitCode)}.`;
            vscode.window.showErrorMessage(message);
            sendInfo("", { name: "runBootAppViaGradle", result: "failure", reason: `task-exit${formatExitCode(event.exitCode)}` });
        }
    }

    private _findAppByTaskExecution(execution: vscode.TaskExecution): BootApp | undefined {
        return this.getAppList().find(app => {
            const definition = execution.task.definition as Partial<GradleTaskDefinition>;
            return definition.type === GRADLE_TASK_TYPE
                && definition.appPath === app.path
                && definition.launchId === app.gradleLaunch.taskId
                && app.gradleLaunch.taskExecution === execution;
        });
    }

    private _resolveAppForSession(session: vscode.DebugSession): BootApp | undefined {
        const configuredAppPath = session.configuration[SPRING_DASHBOARD_APP_PATH];
        if (typeof configuredAppPath === "string") {
            const app = this.manager.getAppByPath(configuredAppPath);
            if (app) {
                return app;
            }
        }

        let app: BootApp | undefined = this.manager.getAppList().find((elem: BootApp) => elem.activeSessionName === session.name);
        if (app === undefined) {
            app = this.manager.getAppList().find((elem: BootApp) => elem.name === session.configuration.projectName);
        }
        return app;
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

        let port: number | undefined;
        let contextPath: string | undefined;

        READ_JMX_EXTENSION_RESPONSE: {
            if (stdout !== null) {
                let jmxExtensionResponse;

                try {
                    jmxExtensionResponse = JSON.parse(stdout);
                } catch (ex) {
                    console.log(ex);
                    break READ_JMX_EXTENSION_RESPONSE;
                }

                if (jmxExtensionResponse["local.server.port"] !== null && typeof jmxExtensionResponse["local.server.port"] === "number") {
                    port = jmxExtensionResponse["local.server.port"];
                }

                if (jmxExtensionResponse["server.servlet.context-path"] !== null) {
                    contextPath = jmxExtensionResponse["server.servlet.context-path"];
                }

                if (jmxExtensionResponse["status"] !== null && jmxExtensionResponse["status"] === "failure") {
                    this._printJavaProcessError(javaProcess);
                }
            }
        }

        if (contextPath === undefined) {
            contextPath = "";
        }

        return port ? constructOpenUrl(contextPath, port) : undefined;
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
            vscode.commands.executeCommand(command, app, true);
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

    const jmxPort = parseJMXPort(debugConfiguration.vmArgs) ?? await getPort();
    debugConfiguration.vmArgs = ensureDashboardVmArgs(debugConfiguration.vmArgs, debugConfiguration.projectName, jmxPort);
    return debugConfiguration;
}

function parseJMXPort(vmArgs: string | undefined): number | undefined {
    if (!vmArgs) {
        return undefined;
    }
    const matched = vmArgs.match(/-Dcom\.sun\.management\.jmxremote\.port=\d+/);
    if (matched) {
        const port = matched[0].substring("-Dcom.sun.management.jmxremote.port=".length);
        return parseInt(port);
    }
    return undefined;
}

function getSessionRole(configuration: vscode.DebugConfiguration): "java-launch" | "gradle-attach" {
    return configuration[SPRING_DASHBOARD_SESSION_ROLE] === "gradle-attach" ? "gradle-attach" : "java-launch";
}

function formatExitCode(exitCode: number | undefined): string {
    return typeof exitCode === "number" ? ` (exit code ${exitCode})` : "";
}
