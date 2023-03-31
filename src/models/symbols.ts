// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { sanitizeFilePath } from "../symbolUtils";
import { sleep } from "../utils";
import { Endpoint } from "../views/mappings";
import { StaticBean, StaticEndpoint } from "./StaticSymbolTypes";
import { requestWorkspaceSymbols, requestWorkspaceSymbolsByQuery } from "./stsApi";

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
    } while (!beans?.length && !mappings?.length && retry * INTERVAL < TIMEOUT);
    if (retry * INTERVAL >= TIMEOUT) {
        console.warn(`Timed out: requestWorkspaceSymbols. (${TIMEOUT}ms)`);
    }
}

export function getBeans(projectPath?: string | vscode.Uri) {
    if (!projectPath) {
        return beans;
    }

    const path = sanitizeFilePath(projectPath);
    return beans?.filter(b => sanitizeFilePath(b.location.uri).startsWith(path));
}

export function getMappings(projectPath?: string | vscode.Uri) {
    if (!projectPath) {
        return mappings;
    }

    const path = sanitizeFilePath(projectPath);
    return mappings?.filter(b => sanitizeFilePath(b.location.uri).startsWith(path));
}

export async function navigateToLocation(symbol: StaticEndpoint | StaticBean | Endpoint) {
    let location;
    if (symbol instanceof StaticBean || symbol instanceof StaticEndpoint) {
        location = symbol.location;
    } else if (symbol.corresponding) {
        location = symbol.corresponding.location;
    } else {
        const query = `@${symbol.pattern} -- ${symbol.method}`; // workaround to query symbols
        const symbols = await requestWorkspaceSymbolsByQuery(query);
        if (symbols.length > 0) {
            const exactMatched = symbols.find(s => query === s.name);
            if (exactMatched) {
                location = exactMatched.location;
            } else {
                location = symbols[0].location;
            }
        }
    }

    if (!location) {
        return;
    }

    const {uri, range} = location;
    await vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(uri), { preserveFocus: true, selection: range});
}
