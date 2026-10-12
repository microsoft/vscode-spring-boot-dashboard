// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { AppState, BootApp } from "../../src/BootApp";
import { dashboard } from "../../src/global";
import { LocalAppController } from "../../src/LocalAppController";
import { LocalAppManager } from "../../src/LocalAppManager";
import { ClassPathData, MainClassData } from "../../src/types/jdtls";
import { isConcreteJavaLaunchConfiguration } from "../../src/utils";
import { setupTestEnv } from "../utils";

class LaunchTestApp extends BootApp {
    public async getMainClasses(): Promise<MainClassData[]> {
        return this.mainClasses ?? [];
    }

    public async getWorkspaceSymbols() {
        return { beans: [], mappings: [] };
    }
}

suite("Launch configuration main classes", () => {
    let app: LaunchTestApp;
    let apps: BootApp[];
    let manager: LocalAppManager;
    let controller: LocalAppController;
    let workspaceFolder: vscode.WorkspaceFolder;
    let originalGetAppList: LocalAppManager["getAppList"];
    let launch: vscode.WorkspaceConfiguration;
    let originalConfigurations: vscode.DebugConfiguration[] | undefined;

    suiteSetup(async () => {
        await setupTestEnv();
        manager = dashboard.appsProvider.manager;
        controller = new LocalAppController(manager, dashboard.context);
    });

    setup(async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        workspaceFolder = folder;
        const projectUri = vscode.Uri.joinPath(workspaceFolder.uri, "launch fixtures #1", "app");
        app = new LaunchTestApp(projectUri.toString(), "example", { entries: [] }, AppState.INACTIVE);
        apps = [app];
        originalGetAppList = manager.getAppList;
        manager.getAppList = () => apps;
        launch = vscode.workspace.getConfiguration("launch", projectUri);
        originalConfigurations = launch.inspect<vscode.DebugConfiguration[]>("configurations")?.workspaceFolderValue;
        await launch.update("configurations", [], vscode.ConfigurationTarget.WorkspaceFolder);
    });

    teardown(async () => {
        manager.getAppList = originalGetAppList;
        await launch.update("configurations", originalConfigurations, vscode.ConfigurationTarget.WorkspaceFolder);
    });

    function configuration(mainClass: string, projectName?: string): vscode.DebugConfiguration {
        return { type: "java", request: "launch", name: mainClass, mainClass, ...(projectName ? { projectName } : {}) };
    }

    function sourceEntry(folder: string, isOwn?: boolean): ClassPathData["entries"][number] {
        return {
            kind: "source", path: folder, isOwn, isTest: false, isSystem: false,
            outputFolder: "", sourceContainerUrl: "", javadocContainerUrl: ""
        };
    }

    function linkedApp(name: string, entries: ClassPathData["entries"]): LaunchTestApp {
        return new LaunchTestApp(
            vscode.Uri.file(path.join(os.tmpdir(), "spring-dashboard-launch-tests", "jdt_ws", name)).toString(),
            name, { entries }, AppState.INACTIVE
        );
    }

    for (const isOwn of [true, undefined]) {
        test(`Launches an unscoped configuration from linked sources ${isOwn ? "with" : "without"} ownership metadata`, async () => {
            const folder = workspaceFolder;
            app = linkedApp(app.name, [sourceEntry(path.join(folder.uri.fsPath, "src"), isOwn)]);
            apps = [app];
            assert.strictEqual(vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(app.path)), undefined);
            const config = {
                ...configuration("library.Application"),
                classPaths: ["lib/application.jar"],
                vmArgs: "-Dcustom=true",
                args: "--custom",
                env: { CUSTOM: "true" }
            };
            await launch.update("configurations", [config], vscode.ConfigurationTarget.WorkspaceFolder);
            const candidates = await controller["_getMainClassCandidates"](app);
            assert.strictEqual(candidates.length, 1);
            assert.strictEqual(candidates[0].filePath, folder.uri.fsPath);
            const originalStartDebugging = vscode.debug.startDebugging;
            const startedConfigurations: vscode.DebugConfiguration[] = [];
            try {
                vscode.debug.startDebugging = async (workspaceFolder, debugConfiguration) => {
                    assert.strictEqual(workspaceFolder?.uri.toString(), folder.uri.toString());
                    assert.ok(typeof debugConfiguration !== "string");
                    startedConfigurations.push(debugConfiguration);
                    return true;
                };
                await controller.runBootApp(app, true);
            } finally {
                vscode.debug.startDebugging = originalStartDebugging;
            }
            assert.strictEqual(startedConfigurations.length, 1);
            const started = startedConfigurations[0];
            assert.strictEqual(started.cwd, folder.uri.fsPath);
            assert.strictEqual(started.projectName, app.name);
            assert.strictEqual(started.name, config.name);
            assert.deepStrictEqual(started.classPaths, config.classPaths);
            assert.strictEqual(started.args, config.args);
            assert.deepStrictEqual(started.env, config.env);
            assert.ok(started.vmArgs.includes("-Dcustom=true"));
            assert.deepStrictEqual(
                vscode.workspace.getConfiguration("launch", folder.uri).get("configurations"),
                [config]
            );
        });
    }

    test("Finds the workspace from main classes when no source root identifies it", async () => {
        const folder = workspaceFolder;
        app = linkedApp(app.name, []);
        app.mainClasses = [{
            mainClass: "example.Application", projectName: app.name,
            filePath: path.join(folder.uri.fsPath, "src", "Application.java")
        }];
        apps = [app];
        await launch.update("configurations", [configuration("example.Application")], vscode.ConfigurationTarget.WorkspaceFolder);
        const candidates = await controller["_getMainClassCandidates"](app);
        assert.strictEqual(candidates.length, 1);
        assert.strictEqual(candidates[0].projectName, undefined);
        assert.strictEqual(candidates[0].filePath, folder.uri.fsPath);
    });

    test("Resolves logical linked-source paths through JDT LS", async () => {
        const folder = workspaceFolder;
        const projectPath = path.join(os.tmpdir(), "spring-dashboard-launch-tests", "jdt_ws", app.name);
        app = linkedApp(app.name, [sourceEntry(path.join(projectPath, "_", "src"), true)]);
        apps = [app];
        const config = configuration("library.Application");
        await launch.update("configurations", [config], vscode.ConfigurationTarget.WorkspaceFolder);
        const originalExecuteCommand = vscode.commands.executeCommand;
        try {
            vscode.commands.executeCommand = async <T>(command: string, ...args: unknown[]): Promise<T> => {
                if (command === "java.execute.workspaceCommand" && args[0] === "java.project.getSettings") {
                    assert.strictEqual(args[1], app.path);
                    assert.deepStrictEqual(args[2], ["org.eclipse.jdt.ls.core.sourcePaths"]);
                    return { "org.eclipse.jdt.ls.core.sourcePaths": [path.join(folder.uri.fsPath, "src")] } as T;
                }
                return originalExecuteCommand<T>(command, ...args);
            };
            const candidates = await controller["_getMainClassCandidates"](app);
            assert.strictEqual(candidates.length, 1);
            assert.strictEqual(candidates[0].filePath, folder.uri.fsPath);
            assert.deepStrictEqual(controller["_getLaunchConfig"](candidates[0], folder.uri), config);
        } finally {
            vscode.commands.executeCommand = originalExecuteCommand;
        }
    });

    test("Surfaces failures resolving logical source paths", async () => {
        app = linkedApp(app.name, [sourceEntry(path.join(os.tmpdir(), "logical-source"), true)]);
        apps = [app];
        const originalExecuteCommand = vscode.commands.executeCommand;
        const error = new Error("Source-path lookup failed");
        try {
            vscode.commands.executeCommand = async () => { throw error; };
            await assert.rejects(controller["_getMainClassCandidates"](app), error);
        } finally {
            vscode.commands.executeCommand = originalExecuteCommand;
        }
    });

    test("Does not infer workspace ownership from a referenced project's sources", async () => {
        const folder = workspaceFolder;
        app = linkedApp(app.name, [sourceEntry(path.join(folder.uri.fsPath, "dependency", "src"), false)]);
        apps = [app];
        await launch.update("configurations", [configuration("library.Application")], vscode.ConfigurationTarget.WorkspaceFolder);
        assert.deepStrictEqual(await controller["_getMainClassCandidates"](app), []);
    });

    test("Does not guess a workspace when own sources span multiple folders", async () => {
        const folder = workspaceFolder;
        const otherUri = vscode.Uri.file(path.join(os.tmpdir(), "spring-dashboard-other-folder"));
        const otherFolder: vscode.WorkspaceFolder = { uri: otherUri, name: "other", index: 1 };
        const otherSource = vscode.Uri.joinPath(otherUri, "src");
        app = linkedApp(app.name, [
            sourceEntry(path.join(folder.uri.fsPath, "src"), true),
            sourceEntry(otherSource.fsPath, true)
        ]);
        apps = [app];
        await launch.update("configurations", [configuration("library.Application")], vscode.ConfigurationTarget.WorkspaceFolder);
        const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder;
        try {
            vscode.workspace.getWorkspaceFolder = uri => uri.toString() === otherSource.toString() ?
                otherFolder : originalGetWorkspaceFolder(uri);
            assert.deepStrictEqual(await controller["_getMainClassCandidates"](app), []);
        } finally {
            vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder;
        }
    });

    test("Counts linked apps when rejecting ambiguous unscoped configurations", async () => {
        const folder = workspaceFolder;
        app = linkedApp(app.name, [sourceEntry(path.join(folder.uri.fsPath, "src"), true)]);
        const otherApp = linkedApp("other", [sourceEntry(path.join(folder.uri.fsPath, "other", "src"), true)]);
        apps = [app, otherApp];
        await launch.update("configurations", [
            configuration("library.Unscoped"),
            configuration("library.Application", app.name),
            configuration("library.OtherApplication", otherApp.name)
        ], vscode.ConfigurationTarget.WorkspaceFolder);
        assert.deepStrictEqual(
            (await controller["_getMainClassCandidates"](app)).map(candidate => candidate.mainClass),
            ["library.Application"]
        );
        assert.deepStrictEqual(
            (await controller["_getMainClassCandidates"](otherApp)).map(candidate => candidate.mainClass),
            ["library.OtherApplication"]
        );
    });

    test("Merges custom main classes without restoring test classes or duplicates", async () => {
        const projectPath = vscode.Uri.parse(app.path).fsPath;
        const productionMain = {
            filePath: path.join(projectPath, "src", "main", "Application.java"),
            mainClass: "example.Application",
            projectName: app.name
        };
        const testMain = {
            filePath: path.join(projectPath, "src", "test", "TestApplication.java"),
            mainClass: "example.TestApplication",
            projectName: app.name
        };
        const unconfiguredMain = {
            filePath: path.join(projectPath, "src", "main", "OtherApplication.java"),
            mainClass: "example.OtherApplication",
            projectName: app.name
        };
        app.mainClasses = [productionMain, unconfiguredMain, testMain];
        app.classpath = {
            entries: ["main", "test"].map(source => ({
                kind: "source",
                path: path.join(projectPath, "src", source),
                outputFolder: "",
                sourceContainerUrl: "",
                javadocContainerUrl: "",
                isSystem: false,
                isTest: source === "test"
            }))
        };
        await launch.update("configurations", [
            configuration(productionMain.mainClass, app.name),
            configuration("library.Application", app.name),
            configuration("library.Application", app.name)
        ], vscode.ConfigurationTarget.WorkspaceFolder);

        const candidates = await controller["_getMainClassCandidates"](app);
        assert.deepStrictEqual(candidates.map(candidate => candidate.mainClass), [
            "example.Application",
            "library.Application",
            "example.OtherApplication"
        ]);
        assert.deepStrictEqual(candidates[0], {
            filePath: projectPath,
            mainClass: productionMain.mainClass,
            projectName: app.name
        });
        assert.strictEqual(candidates[2], unconfiguredMain);
        assert.deepStrictEqual(app.mainClasses, [productionMain, unconfiguredMain, testMain]);
    });

    test("Preserves URI paths and unscoped configuration options", async () => {
        const config = {
            ...configuration("library.Application"),
            classPaths: ["lib/application.jar"],
            vmArgs: "-Dcustom=true",
            args: "--custom",
            env: { CUSTOM: "true" }
        };
        await launch.update("configurations", [config], vscode.ConfigurationTarget.WorkspaceFolder);

        const candidates = await controller["_getMainClassCandidates"](app);
        assert.strictEqual(candidates.length, 1);
        assert.strictEqual(candidates[0].filePath, vscode.Uri.parse(app.path).fsPath);
        assert.strictEqual(candidates[0].projectName, undefined);
        assert.deepStrictEqual(
            controller["_getLaunchConfig"](candidates[0], vscode.Uri.file(candidates[0].filePath)),
            config
        );
    });

    test("Excludes ambiguous unscoped and other-project configurations", async () => {
        const otherApp = new LaunchTestApp(
            vscode.Uri.joinPath(vscode.Uri.parse(app.path), "..", "other").toString(),
            "other",
            { entries: [] },
            AppState.INACTIVE
        );
        apps.push(otherApp);
        await launch.update("configurations", [
            configuration("library.Unscoped"),
            configuration("library.Application", app.name),
            configuration("library.OtherApplication", otherApp.name)
        ], vscode.ConfigurationTarget.WorkspaceFolder);

        assert.deepStrictEqual(
            (await controller["_getMainClassCandidates"](app)).map(candidate => candidate.mainClass),
            ["library.Application"]
        );
        assert.deepStrictEqual(
            (await controller["_getMainClassCandidates"](otherApp)).map(candidate => candidate.mainClass),
            ["library.OtherApplication"]
        );
    });

    test("Reads launch edits and removals without changing the Java-main-class cache", async () => {
        app.mainClasses = [];
        const cachedMainClasses = app.mainClasses;
        await launch.update("configurations", [configuration("library.First")], vscode.ConfigurationTarget.WorkspaceFolder);
        assert.deepStrictEqual(
            (await controller["_getMainClassCandidates"](app)).map(candidate => candidate.mainClass),
            ["library.First"]
        );

        await launch.update("configurations", [configuration("library.Second")], vscode.ConfigurationTarget.WorkspaceFolder);
        assert.deepStrictEqual(
            (await controller["_getMainClassCandidates"](app)).map(candidate => candidate.mainClass),
            ["library.Second"]
        );

        await launch.update("configurations", [], vscode.ConfigurationTarget.WorkspaceFolder);
        assert.deepStrictEqual(await controller["_getMainClassCandidates"](app), []);
        assert.strictEqual(app.mainClasses, cachedMainClasses);
    });

    for (const { scoped, discovered } of [
        { scoped: false, discovered: false },
        { scoped: false, discovered: true },
        { scoped: true, discovered: false },
        { scoped: true, discovered: true }
    ]) {
        test(`Preserves ${scoped ? "scoped" : "unscoped"} launch options ${discovered ? "with" : "without"} a discovered main class`, async () => {
            const config = {
                ...configuration("library.Application", scoped ? app.name : undefined),
                classPaths: ["lib/application.jar"],
                vmArgs: "-Dcustom=true",
                args: "--custom",
                env: { CUSTOM: "true" }
            };
            app.mainClasses = discovered ? [{
                filePath: path.join(vscode.Uri.parse(app.path).fsPath, "Application.java"),
                mainClass: "library.Application",
                projectName: app.name
            }] : [];
            const cachedMainClasses = app.mainClasses;
            await launch.update("configurations", [config], vscode.ConfigurationTarget.WorkspaceFolder);
            const candidates = await controller["_getMainClassCandidates"](app);
            assert.strictEqual(candidates.length, 1);
            assert.strictEqual(candidates[0].projectName, scoped ? app.name : undefined);
            const startedConfigurations: vscode.DebugConfiguration[] = [];
            const originalStartDebugging = vscode.debug.startDebugging;
            try {
                vscode.debug.startDebugging = async (_folder, debugConfiguration) => {
                    assert.ok(typeof debugConfiguration !== "string");
                    startedConfigurations.push(debugConfiguration);
                    return true;
                };

                await controller.runBootApp(app, true);
            } finally {
                vscode.debug.startDebugging = originalStartDebugging;
            }

            assert.strictEqual(startedConfigurations.length, 1);
            const started = startedConfigurations[0];
            assert.strictEqual(started.projectName, app.name);
            assert.ok(started.vmArgs.includes(`-Dspring.boot.project.name=${app.name}`));
            assert.ok(started.vmArgs.includes("-Dcustom=true"));
            assert.strictEqual(started.name, config.name);
            assert.deepStrictEqual(started.classPaths, config.classPaths);
            assert.strictEqual(started.args, config.args);
            assert.deepStrictEqual(started.env, config.env);
            assert.strictEqual(started.cwd, vscode.Uri.parse(app.path).fsPath);
            assert.strictEqual(started.noDebug, false);
            assert.strictEqual(app.mainClasses, cachedMainClasses);
            assert.deepStrictEqual(
                vscode.workspace.getConfiguration("launch", vscode.Uri.parse(app.path)).get("configurations"),
                [config]
            );
        });
    }

    test("Builds launch names for qualified and unqualified main classes", () => {
        assert.strictEqual(controller["_constructLaunchConfigName"]("example.Application"), "Spring Boot-Application");
        assert.strictEqual(controller["_constructLaunchConfigName"]("Application"), "Spring Boot-Application");
        assert.strictEqual(
            controller["_constructLaunchConfigName"]("example.Application", app.name),
            "Spring Boot-Application<example>"
        );
    });

    test("Ignores variable-based, empty, and non-Java launchers", async () => {
        const invalidConfigurations = [
            configuration("${file}"),
            configuration("${workspaceFolder}/Application.java"),
            configuration(""),
            configuration(" "),
            { ...configuration("example.Application"), mainClass: undefined },
            { ...configuration("example.Application"), mainClass: 123 },
            { ...configuration("example.Application"), request: "attach" },
            { ...configuration("example.Application"), type: "node" }
        ];
        assert.ok(invalidConfigurations.every(config => !isConcreteJavaLaunchConfiguration(config)));
        assert.strictEqual(isConcreteJavaLaunchConfiguration(configuration("library.Application")), true);
        await launch.update("configurations", invalidConfigurations, vscode.ConfigurationTarget.WorkspaceFolder);
        assert.deepStrictEqual(await controller["_getMainClassCandidates"](app), []);
    });
});
