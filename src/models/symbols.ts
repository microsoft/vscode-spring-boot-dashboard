// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { requestWorkspaceSymbols } from "./stsApi";
import * as vscode from "vscode";
import { sleep } from "../utils";
import { StaticBean, StaticEndpoint } from "./StaticSymbolTypes";

let beans: any[];
let mappings: any[];

export async function init(timeout?: number) {
    const INTERVAL = 500; //ms
    const TIMEOUT = timeout ?? 0;
    let retry = 0;
    do {
        if (retry !== 0) {
            await sleep(INTERVAL);
            retry++;
        }
        const symbols = await requestWorkspaceSymbols();
        beans = symbols.beans;
        mappings = symbols.mappings;
    } while (!beans?.length && !mappings?.length && retry * INTERVAL < TIMEOUT);
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
    const line = range.start.line + 1; // zero-base in range.
    const uriString = `${uri}#${line}`;
    await vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(uriString));

    // Workaround: Keep focusing on tree view, to unblock further filtering.
    if (symbol instanceof StaticBean) {
        await vscode.commands.executeCommand("spring.beans.focus");
    } else if (symbol instanceof StaticEndpoint || symbol.corresponding instanceof StaticEndpoint) {
        await vscode.commands.executeCommand("spring.mappings.focus");
    }
}
