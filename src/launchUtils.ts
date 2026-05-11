// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fs from "fs";
import * as net from "net";
import * as path from "path";
import * as vscode from "vscode";
import { getPathToTempFolder, getPathToWorkspaceStorage } from "./contextUtils";
import { sanitizeFilePath } from "./symbolUtils";

export type LaunchStrategy = "java" | "gradle";
export type DebugSessionRole = "java-launch" | "gradle-attach";
export type GradleLaunchPhase = "idle" | "launching" | "running" | "stopping";

export const SPRING_DASHBOARD_SESSION_ROLE = "springDashboardSessionRole";
export const SPRING_DASHBOARD_APP_PATH = "springDashboardAppPath";

export interface GradleContext {
    appFsPath: string;
    rootDir: string;
    executable: string;
    task: string;
    args: string[];
    usesWrapper: boolean;
}

export interface GradleInitScriptOptions {
    task: string;
    projectDir: string;
    appArgs: string[];
    jvmArgs: string[];
    debugEnabled: boolean;
    debugPort?: number;
}

export function normalizeLaunchStrategy(value: string | undefined): LaunchStrategy {
    return value === "gradle" ? "gradle" : "java";
}

export function getWorkspaceLaunchStrategy(): LaunchStrategy {
    const configured = vscode.workspace.getConfiguration("spring.dashboard").get<string>("launchStrategy");
    return normalizeLaunchStrategy(configured);
}

export function getConfiguredGradleTask(debug?: boolean): string {
    const config = vscode.workspace.getConfiguration("spring.dashboard");
    const delegatedTask = (config.get<string>("gradle.task") ?? "bootRun").trim();
    const delegatedDebugTask = (config.get<string>("gradle.debugTask") ?? "").trim();
    if (debug && delegatedDebugTask.length > 0) {
        return delegatedDebugTask;
    }
    return delegatedTask.length > 0 ? delegatedTask : "bootRun";
}

export function buildDashboardJvmArgs(projectName: string, jmxPort: number): string[] {
    return [
        "-Dcom.sun.management.jmxremote",
        `-Dcom.sun.management.jmxremote.port=${jmxPort}`,
        "-Dcom.sun.management.jmxremote.authenticate=false",
        "-Dcom.sun.management.jmxremote.ssl=false",
        "-Dspring.jmx.enabled=true",
        "-Djava.rmi.server.hostname=localhost",
        "-Dspring.application.admin.enabled=true",
        `-Dspring.boot.project.name=${projectName}`,
    ];
}

export function ensureDashboardVmArgs(vmArgs: string, projectName: string, jmxPort: number): string {
    let mergedVmArgs = vmArgs;
    const dashboardArgs = buildDashboardJvmArgs(projectName, jmxPort);
    const duplicatePatterns: Map<string, RegExp> = new Map([
        ["-Dcom.sun.management.jmxremote", /-Dcom\.sun\.management\.jmxremote(?!\.)/],
        ["-Dcom.sun.management.jmxremote.port", /-Dcom\.sun\.management\.jmxremote\.port=\d+/],
        ["-Dcom.sun.management.jmxremote.authenticate", /-Dcom\.sun\.management\.jmxremote\.authenticate=\S+/],
        ["-Dcom.sun.management.jmxremote.ssl", /-Dcom\.sun\.management\.jmxremote\.ssl=\S+/],
        ["-Dspring.jmx.enabled", /-Dspring\.jmx\.enabled=\S+/],
        ["-Djava.rmi.server.hostname", /-Djava\.rmi\.server\.hostname=\S+/],
        ["-Dspring.application.admin.enabled", /-Dspring\.application\.admin\.enabled=\S+/],
        ["-Dspring.boot.project.name", /-Dspring\.boot\.project\.name=\S+/],
    ]);

    for (const arg of dashboardArgs) {
        const key = arg.includes("=") ? arg.substring(0, arg.indexOf("=")) : arg;
        const pattern = duplicatePatterns.get(key);
        if (pattern && pattern.test(mergedVmArgs)) {
            continue;
        }
        mergedVmArgs += ` ${arg}`;
    }

    return mergedVmArgs;
}

export function resolveGradleContext(appPath: string, task: string): GradleContext {
    const appFsPath = sanitizeFilePath(appPath);
    const markers = findGradleMarkers(appFsPath);
    if (!markers.wrapperDir && !markers.settingsDir && !markers.buildDir) {
        throw new Error(`Project '${appFsPath}' is not recognized as a Gradle project.`);
    }

    const rootDir = markers.wrapperDir ?? markers.settingsDir ?? markers.buildDir;
    if (!rootDir) {
        throw new Error(`Project '${appFsPath}' is not recognized as a Gradle project.`);
    }

    const executable = markers.wrapperDir ? getWrapperExecutable(markers.wrapperDir) : findGradleExecutableOnPath();
    if (!executable) {
        throw new Error("Unable to find Gradle wrapper or 'gradle' executable on PATH.");
    }

    const args = isQualifiedGradleTask(task) ? [task] : ["-p", appFsPath, task];
    return {
        appFsPath,
        rootDir,
        executable,
        task,
        args,
        usesWrapper: !!markers.wrapperDir,
    };
}

export function createGradleInitScript(options: GradleInitScriptOptions): string {
    const taskName = options.task.substring(options.task.lastIndexOf(":") + 1);
    const targetByPath = isQualifiedGradleTask(options.task);
    const jvmArgs = toGroovyList(options.jvmArgs);
    const appArgs = toGroovyList(options.appArgs);

    return `import org.gradle.api.GradleException
import org.gradle.api.tasks.JavaExec

def springDashboardTaskSpec = ${toGroovyString(options.task)}
def springDashboardTaskName = ${toGroovyString(taskName)}
def springDashboardProjectDir = new File(${toGroovyString(options.projectDir)})
def springDashboardTargetByPath = ${targetByPath}
def springDashboardJvmArgs = ${jvmArgs}
def springDashboardAppArgs = ${appArgs}
def springDashboardDebugEnabled = ${options.debugEnabled}
def springDashboardDebugPort = ${options.debugPort ?? 0}
def springDashboardMatchedTask = false

def springDashboardMatchesTask = { task ->
    if (springDashboardTargetByPath) {
        return task.path == springDashboardTaskSpec
    }
    return task.name == springDashboardTaskName && task.project.projectDir == springDashboardProjectDir
}

gradle.projectsLoaded {
    gradle.rootProject.allprojects { project ->
        project.tasks.configureEach { task ->
            if (!springDashboardMatchesTask(task)) {
                return
            }
            springDashboardMatchedTask = true
            if (!(task instanceof JavaExec)) {
                throw new GradleException("Spring Boot Dashboard can only delegate to JavaExec-compatible tasks. Task '" + task.path + "' is " + task.class.name + ".")
            }

            task.jvmArgs(springDashboardJvmArgs)
            if (!springDashboardAppArgs.isEmpty()) {
                task.args(springDashboardAppArgs)
            }

            if (springDashboardDebugEnabled) {
                task.debugOptions.enabled = true
                task.debugOptions.host = "localhost"
                task.debugOptions.port = springDashboardDebugPort
                task.debugOptions.server = true
                task.debugOptions.suspend = true
            }
        }
    }

    gradle.taskGraph.whenReady {
        if (!springDashboardMatchedTask) {
            throw new GradleException("Spring Boot Dashboard could not find delegated task '" + springDashboardTaskSpec + "'.")
        }
    }
}
`;
}

export function getGradleStorageDir(): vscode.Uri {
    return getPathToWorkspaceStorage("gradle-delegation") ?? vscode.Uri.file(getPathToTempFolder("gradle-delegation"));
}

export async function waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            await canConnect(host, port);
            return;
        } catch (error) {
            void error;
        }
        await delay(250);
    }
    throw new Error(`Timed out waiting for debugger to listen on ${host}:${port}.`);
}

export function createAttachDebugConfiguration(name: string, appPath: string, projectName: string, port: number): vscode.DebugConfiguration {
    return {
        type: "java",
        name,
        request: "attach",
        hostName: "localhost",
        port,
        projectName,
        [SPRING_DASHBOARD_SESSION_ROLE]: "gradle-attach",
        [SPRING_DASHBOARD_APP_PATH]: appPath,
    };
}

function isQualifiedGradleTask(task: string): boolean {
    return task.includes(":");
}

function findGradleMarkers(startDir: string) {
    let current = path.resolve(startDir);
    let wrapperDir: string | undefined;
    let settingsDir: string | undefined;
    let buildDir: string | undefined;

    while (true) {
        if (!wrapperDir && hasGradleWrapper(current)) {
            wrapperDir = current;
        }
        if (!settingsDir && hasSettingsBuild(current)) {
            settingsDir = current;
        }
        if (!buildDir && hasModuleBuild(current)) {
            buildDir = current;
        }

        const parent = path.dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }

    return {
        wrapperDir,
        settingsDir,
        buildDir,
    };
}

function hasGradleWrapper(dir: string): boolean {
    return fs.existsSync(getWrapperExecutable(dir));
}

function getWrapperExecutable(dir: string): string {
    return path.join(dir, process.platform === "win32" ? "gradlew.bat" : "gradlew");
}

function hasSettingsBuild(dir: string): boolean {
    return fs.existsSync(path.join(dir, "settings.gradle")) || fs.existsSync(path.join(dir, "settings.gradle.kts"));
}

function hasModuleBuild(dir: string): boolean {
    return fs.existsSync(path.join(dir, "build.gradle")) || fs.existsSync(path.join(dir, "build.gradle.kts"));
}

function findGradleExecutableOnPath(): string | undefined {
    const pathValue = process.env.PATH;
    if (!pathValue) {
        return undefined;
    }

    const executableNames = process.platform === "win32"
        ? ["gradle.cmd", "gradle.bat", "gradle.exe"]
        : ["gradle"];
    const pathEntries = pathValue.split(path.delimiter).filter(entry => entry.length > 0);

    for (const entry of pathEntries) {
        for (const executableName of executableNames) {
            const candidate = path.join(entry, executableName);
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
    }
    return undefined;
}

function toGroovyList(values: string[]): string {
    return `[${values.map(value => toGroovyString(value)).join(", ")}]`;
}

function toGroovyString(value: string): string {
    return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function canConnect(host: string, port: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const socket = net.createConnection({ host, port });
        const onError = (error: Error) => {
            socket.destroy();
            reject(error);
        };

        socket.setTimeout(500);
        socket.once("connect", () => {
            socket.end();
            resolve();
        });
        socket.once("timeout", () => onError(new Error("Connection timed out.")));
        socket.once("error", onError);
    });
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
