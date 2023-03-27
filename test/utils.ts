// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

export async function setupTestEnv() {
    const javaExt = vscode.extensions.getExtension("redhat.java");
    if (!javaExt) {
        console.error("redhat.java is not enabled.");
        return;
    }
    console.log("activating redhat.java...");
    await javaExt.activate();
    console.log("redhat.java activated.");

    const api = javaExt.exports;
    console.log("wait for jdtls Standard server ready...");
    await api.serverReady();
    console.log("jdtls standard server ready.")

    const dashboardExt = vscode.extensions.getExtension("vscjava.vscode-spring-boot-dashboard");
    if (!dashboardExt) {
        console.error("dashboard extension is not enabled.");
        return;
    }
    await dashboardExt.activate();
}

export function sleep(milliseconds: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
