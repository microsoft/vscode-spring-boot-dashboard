// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { Extension, ExtensionContext, extensions } from "vscode";

let EXTENSION_CONTEXT: ExtensionContext;
let EXTENSION_PUBLISHER: string;
let EXTENSION_NAME: string;
let EXTENSION_VERSION: string;
let EXTENSION_AI_KEY: string;
let TEMP_FOLDER_PER_USER: string;

export async function loadPackageInfo(context: ExtensionContext): Promise<void> {
    EXTENSION_CONTEXT = context;

    const raw = await fs.promises.readFile(context.asAbsolutePath("./package.json"), { encoding: 'utf-8' });
    const { publisher, name, version, aiKey } = JSON.parse(raw);
    EXTENSION_AI_KEY = aiKey;
    EXTENSION_PUBLISHER = publisher;
    EXTENSION_NAME = name;
    EXTENSION_VERSION = version;

    TEMP_FOLDER_PER_USER = path.join(os.tmpdir(), `${EXTENSION_NAME}-${os.userInfo().username}`);

}

export function getExtensionId(): string {
    return `${EXTENSION_PUBLISHER}.${EXTENSION_NAME}`;
}

export function getExtensionVersion(): string {
    return EXTENSION_VERSION;
}

export function getAiKey(): string {
    return EXTENSION_AI_KEY;
}

export function getPathToTempFolder(...args: string[]): string {
    return path.join(TEMP_FOLDER_PER_USER, ...args);
}

export function getPathToExtensionRoot(...args: string[]): string {
    const ext: Extension<any> | undefined = extensions.getExtension(getExtensionId());
    if (!ext) {
        throw new Error("Cannot identify extension root.");
    }
    return path.join(ext.extensionPath, ...args);
}
