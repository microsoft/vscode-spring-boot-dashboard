// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { instrumentOperationAsVsCodeCommand } from "vscode-extension-telemetry-wrapper";
import { BootApp } from "../BootApp";
import { sleep } from "../utils";

const RELOAD_PROJECT_COMMAND = "java.projectConfiguration.update";

export function init(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        instrumentOperationAsVsCodeCommand("spring.promptToEnableActuator", async (app: BootApp) => {
            const OPTION_ENABLE_ACTUATOR = "Enable Actuator";
            const OPTION_LEARN_MORE = "Learn More";
            const MESSAGE = "Enable actuator to view live information?";
            const DETAILED_MESSAGE = "It will add spring-boot-actuator-starter to your project's pom.xml or build.gradle file.";
            const option = await vscode.window.showInformationMessage(MESSAGE, {
                detail: DETAILED_MESSAGE,
                modal: true
            }, OPTION_ENABLE_ACTUATOR);
            if (option === OPTION_ENABLE_ACTUATOR) {
                await vscode.commands.executeCommand("spring.enableActuator", app);
            } else if (option === OPTION_LEARN_MORE) {
                openActuatorGuide();
            }
        }),
        instrumentOperationAsVsCodeCommand("spring.enableActuator", async (app: BootApp) => {
            const mavenExt = vscode.extensions.getExtension("vscjava.vscode-maven");
            if (mavenExt?.isActive) {
                const pomUri = vscode.Uri.joinPath(vscode.Uri.parse(app.path), "/pom.xml");
                try {
                    await vscode.workspace.fs.readFile(pomUri);
                    await vscode.commands.executeCommand("maven.project.addDependency", {
                        pomPath: pomUri.fsPath,
                        groupId: "org.springframework.boot",
                        artifactId: "spring-boot-starter-actuator",
                    });
                    const OPTION_CONFIRM = "Save and Re-Run";
                    const choice = await vscode.window.showInformationMessage("Spring Actuator has been added to pom.xml. Please save and re-run your application for live information.", OPTION_CONFIRM);
                    if (choice === OPTION_CONFIRM) {
                        // stop current ruuning app
                        await vscode.commands.executeCommand("spring-boot-dashboard.localapp.stop", app);
                        // save pom.xml to apply change
                        const textEditor = await vscode.window.showTextDocument(pomUri);
                        await textEditor.document.save();
                        // force to reload project in case of pending interaction
                        await vscode.commands.executeCommand(RELOAD_PROJECT_COMMAND, pomUri);
                        // Workaround: wait 2s for project updating.
                        // TODO: should wait an explict signal when project is updated.
                        await sleep(2000);
                        // re-run
                        await vscode.commands.executeCommand("_spring.project.run", app.path);
                    }
                    return;
                } catch (error) {
                    console.log(error);
                }
            }

            // for supported case, fallback to open guide.
            openActuatorGuide();
        }),

    );

}

function openActuatorGuide() {
    vscode.commands.executeCommand("vscode.open", "https://docs.spring.io/spring-boot/docs/current/reference/html/actuator.html#actuator.enabling");
}
