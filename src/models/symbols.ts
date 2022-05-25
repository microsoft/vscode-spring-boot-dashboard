// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { requestWorkspaceSymbols } from "./stsApi";

let beans: any[];
let mappings: any[];

export async function init() {
    const symbols = await requestWorkspaceSymbols();
    beans = symbols.beans;
    mappings = symbols.mappings;
}

export function getBeans(projectPath?: string) {
    if (!projectPath) {
        return beans;
    }

    const path = sanitizeFilePath(projectPath);
    return beans.filter(b => sanitizeFilePath(b.location.uri).startsWith(path));
}

export function getMappings(projectPath?: string) {
    if (!projectPath) {
        return beans;
    }

    const path = sanitizeFilePath(projectPath);
    return mappings.filter(b => sanitizeFilePath(b.location.uri).startsWith(path));
}

function sanitizeFilePath(uri: string) {
    return uri.replace(/^file:\/+/, "");
}
