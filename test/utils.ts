// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

export async function setupTestEnv() {
    await vscode.extensions.getExtension("redhat.java")!.activate();
    const javaExt = vscode.extensions.getExtension("redhat.java");
    await javaExt!.activate();
    const api = javaExt?.exports;
    while (api.serverMode !== "Standard") {
        await sleep(2 * 1000/*ms*/);
    }
    await vscode.extensions.getExtension("vscjava.vscode-spring-boot-dashboard")!.activate();
}

export function sleep(milliseconds: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
