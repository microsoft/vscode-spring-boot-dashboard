// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";

const GLOBAL_STATE_KEY = "spring.actuator.acknowledged";

const runningAppsWithoutActuator: Set<string> = new Set();

let _getAcknowledged: () => boolean;
function getAcknowledged(): boolean {
    return !!_getAcknowledged?.();
}

export function init(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        instrumentOperationAsVsCodeCommand("spring.enableActuator", async () => {
            const mavenExt = vscode.extensions.getExtension("vscjava.vscode-maven");
            if (mavenExt?.isActive && runningAppsWithoutActuator.size > 0) {
                const pomxml = vscode.Uri.joinPath(vscode.Uri.parse(Array.from(runningAppsWithoutActuator.values())[0]), "/pom.xml");
                try {
                    await vscode.workspace.fs.readFile(pomxml);
                    await vscode.commands.executeCommand("maven.project.addDependency", {
                        pomPath: pomxml.fsPath,
                        groupId: "org.springframework.boot",
                        artifactId: "spring-boot-starter-actuator",
                    });
                    await vscode.window.showInformationMessage("Spring Actuator has been added to pom.xml. Please save and re-run your application for live information.");

                    return;
                } catch (error) {
                    console.log(error);
                }
            }

            vscode.commands.executeCommand("vscode.open", "https://docs.spring.io/spring-boot/docs/current/reference/html/actuator.html#actuator.enabling");
        }),

        instrumentOperationAsVsCodeCommand("spring.viewsWelcome.acknowledged", (flag?: boolean) => {
            const acknowledged = flag ?? true;
            context.globalState.update(GLOBAL_STATE_KEY, acknowledged);
            vscode.commands.executeCommand("setContext", "spring:actuatorRequired", !acknowledged);
        })
    );

    _getAcknowledged = () => !!context.globalState.get(GLOBAL_STATE_KEY);
}

export function didRun(appWithoutActuator: string) {
    runningAppsWithoutActuator.add(appWithoutActuator);
    const ack = getAcknowledged();
    if (!ack) {
        vscode.commands.executeCommand("setContext", "spring:actuatorRequired", true);
    }
}

export function didStop(appWithoutActuator: string) {
    if (runningAppsWithoutActuator.has(appWithoutActuator)) {
        runningAppsWithoutActuator.delete(appWithoutActuator);
    }
    if (runningAppsWithoutActuator.size === 0) {
        vscode.commands.executeCommand("setContext", "spring:actuatorRequired", false);
    }
}
