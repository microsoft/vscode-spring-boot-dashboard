// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { requestWorkspaceSymbols } from "./stsApi";
import * as vscode from "vscode";

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

export function navigateToLocation(symbol: { location: vscode.Location }) {
    const {uri, range} = symbol.location;
    const line = range.start.line + 1; // zero-base in range.

    const uriString = `${uri}#${line}`;
    vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(uriString));
}
