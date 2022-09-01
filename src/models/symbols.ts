// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { requestWorkspaceSymbols } from "./stsApi";
import * as vscode from "vscode";
import { sleep } from "../utils";
import { StaticBean, StaticEndpoint } from "./StaticSymbolTypes";

let beans: any[];
let mappings: any[];

const MAX_TIMEOUT = 20 * 60 * 1000; // 20 min

export async function init(timeout?: number) {
    const INTERVAL = 1000; // 1000 ms
    const TIMEOUT = timeout ?? MAX_TIMEOUT;
    let retry = 0;
    do {
        const symbols = await requestWorkspaceSymbols();
        beans = symbols.beans;
        mappings = symbols.mappings;

        if (retry !== 0) {
            await sleep(INTERVAL);
        }
        retry++;
    } while (!beans?.length && retry * INTERVAL < TIMEOUT);
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

export async function navigateToLocation(symbol: StaticEndpoint | StaticBean | {corresponding: StaticEndpoint}) {
    const location = (symbol instanceof StaticBean || symbol instanceof StaticEndpoint) ? symbol.location : symbol.corresponding.location;
    const {uri, range} = location;
    await vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(uri), { preserveFocus: true, selection: range});
}
