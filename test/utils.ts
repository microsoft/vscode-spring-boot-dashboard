// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

const JavaExtId = "redhat.java";
const SpringExtId = "vmware.vscode-spring-boot";
const DashboardExtId = "vscjava.vscode-spring-boot-dashboard";

export async function setupTestEnv() {

    await vscode.workspace.getConfiguration("spring-boot.ls").update("logfile", "./boot-ls.log");
    const bootlsLog = vscode.workspace.getConfiguration("spring-boot.ls").get("logfile");
    console.log("boot ls logfile: " + bootlsLog);

    const javaExt = await activateExtension(JavaExtId);
    if (!javaExt) {
        return;
    }

    const api = javaExt.exports;
    console.log("wait for jdtls Standard server ready...");
    await api.serverReady();
    console.log("jdtls standard server ready.")

    await activateExtension(SpringExtId);
    await activateExtension(DashboardExtId);
}

export function sleep(milliseconds: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function activateExtension(extId: string) {
    const ext = vscode.extensions.getExtension(extId);
    if (!ext) {
        console.error(`${extId} is not enabled.`);
        return undefined;
    }
    console.log(`activating ${extId}...`);
    await ext.activate();
    console.log(`${extId} is activated.`);
    return ext;
}