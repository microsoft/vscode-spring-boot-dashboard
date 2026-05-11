// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import {
    buildDashboardJvmArgs,
    createAttachDebugConfiguration,
    createGradleInitScript,
    normalizeLaunchStrategy,
    resolveGradleContext,
    SPRING_DASHBOARD_APP_PATH,
    SPRING_DASHBOARD_SESSION_ROLE,
} from "../../src/launchUtils";

suite("Launch Utils", () => {
    let tempDir: string;

    setup(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "spring-dashboard-gradle-"));
    });

    teardown(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test("resolveGradleContext prefers wrapper and project directory for unqualified tasks", () => {
        const projectDir = path.join(tempDir, "service");
        fs.mkdirSync(projectDir, { recursive: true });
        fs.writeFileSync(path.join(tempDir, "settings.gradle"), "");
        fs.writeFileSync(path.join(projectDir, "build.gradle"), "");
        fs.writeFileSync(path.join(tempDir, process.platform === "win32" ? "gradlew.bat" : "gradlew"), "");

        const context = resolveGradleContext(vscode.Uri.file(projectDir).toString(), "bootRun");

        assert.strictEqual(context.rootDir, tempDir);
        assert.strictEqual(context.appFsPath, projectDir);
        assert.strictEqual(context.usesWrapper, true);
        assert.deepStrictEqual(context.args, ["-p", projectDir, "bootRun"]);
        assert.strictEqual(context.executable, path.join(tempDir, process.platform === "win32" ? "gradlew.bat" : "gradlew"));
    });

    test("resolveGradleContext keeps fully qualified task paths intact", () => {
        const projectDir = path.join(tempDir, "service");
        fs.mkdirSync(projectDir, { recursive: true });
        fs.writeFileSync(path.join(tempDir, "settings.gradle.kts"), "");
        fs.writeFileSync(path.join(projectDir, "build.gradle.kts"), "");
        fs.writeFileSync(path.join(tempDir, process.platform === "win32" ? "gradlew.bat" : "gradlew"), "");

        const context = resolveGradleContext(vscode.Uri.file(projectDir).toString(), ":service:bootRun");

        assert.deepStrictEqual(context.args, [":service:bootRun"]);
    });

    test("resolveGradleContext falls back to gradle on PATH when there is no wrapper", () => {
        const projectDir = path.join(tempDir, "service");
        const binDir = path.join(tempDir, "bin");
        const gradleExecutable = process.platform === "win32" ? "gradle.bat" : "gradle";
        const originalPath = process.env.PATH;

        fs.mkdirSync(projectDir, { recursive: true });
        fs.mkdirSync(binDir, { recursive: true });
        fs.writeFileSync(path.join(tempDir, "settings.gradle"), "");
        fs.writeFileSync(path.join(projectDir, "build.gradle"), "");
        fs.writeFileSync(path.join(binDir, gradleExecutable), "");

        process.env.PATH = `${binDir}${path.delimiter}${originalPath ?? ""}`;
        try {
            const context = resolveGradleContext(vscode.Uri.file(projectDir).toString(), "bootRun");
            assert.strictEqual(context.executable, path.join(binDir, gradleExecutable));
            assert.strictEqual(context.usesWrapper, false);
        } finally {
            process.env.PATH = originalPath;
        }
    });

    test("createGradleInitScript injects profiles, JMX/admin flags, and debug options", () => {
        const script = createGradleInitScript({
            task: "bootRun",
            projectDir: "/workspace/service",
            appArgs: ["--spring.profiles.active=dev,test"],
            jvmArgs: buildDashboardJvmArgs("demo", 9009),
            debugEnabled: true,
            debugPort: 5005,
        });

        assert.ok(script.includes("--spring.profiles.active=dev,test"));
        assert.ok(script.includes("-Dcom.sun.management.jmxremote.port=9009"));
        assert.ok(script.includes("-Dspring.application.admin.enabled=true"));
        assert.ok(script.includes("task.debugOptions.enabled = true"));
        assert.ok(script.includes("task.debugOptions.port = springDashboardDebugPort"));
    });

    test("createAttachDebugConfiguration marks Gradle attach sessions", () => {
        const config = createAttachDebugConfiguration("attach", "file:///workspace/service", "demo", 5005);

        assert.strictEqual(config.request, "attach");
        assert.strictEqual(config.hostName, "localhost");
        assert.strictEqual(config.port, 5005);
        assert.strictEqual(config[SPRING_DASHBOARD_SESSION_ROLE], "gradle-attach");
        assert.strictEqual(config[SPRING_DASHBOARD_APP_PATH], "file:///workspace/service");
    });

    test("normalizeLaunchStrategy defaults to java", () => {
        assert.strictEqual(normalizeLaunchStrategy(undefined), "java");
        assert.strictEqual(normalizeLaunchStrategy("gradle"), "gradle");
    });
});
