// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";
import { AppState, BootApp } from "../../src/BootApp";
import { dashboard } from "../../src/global";
import { LocalAppController } from "../../src/LocalAppController";
import { LocalAppManager } from "../../src/LocalAppManager";
import { MainClassData } from "../../src/types/jdtls";
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
    let originalGetAppList: LocalAppManager["getAppList"];
    let launch: vscode.WorkspaceConfiguration;
    let originalConfigurations: vscode.DebugConfiguration[] | undefined;

    suiteSetup(async () => {
        await setupTestEnv();
        manager = dashboard.appsProvider.manager;
        controller = new LocalAppController(manager, dashboard.context);
    });

    setup(async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder);
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
