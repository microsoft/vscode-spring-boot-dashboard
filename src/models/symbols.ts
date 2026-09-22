// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { BootApp } from "../BootApp";
import { ClassPathData } from "../types/jdtls";
import { sanitizeFilePath } from "../symbolUtils";
import { isInFolder, sleep } from "../utils";
import { Endpoint } from "../views/mappings";
import { StaticBean, StaticEndpoint } from "./StaticSymbolTypes";
import { requestWorkspaceSymbols, requestWorkspaceSymbolsByQuery } from "./stsApi";
import * as lsp from "vscode-languageclient";

let beans: lsp.SymbolInformation[];
let mappings: lsp.SymbolInformation[];

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

/**
 * The statically indexed symbols that belong to an app, attributed by the source
 * folders on its classpath.
 *
 * A project's location is not always an ancestor of its sources. Eclipse source
 * folders can be linked resources, so a project generated into the language
 * server's workspace - the invisible project created for a plain folder, or a
 * project contributed by an importer from another extension - keeps its sources
 * where they are while its location points into the workspace storage. Attributing
 * symbols by the location prefix then matches nothing and the app shows up with no
 * beans and no endpoints at all, although the index holds them.
 *
 * The source folders come from the classpath the app was built from, which is what
 * `excludeTestMainClasses` already uses to tell a project's own files apart.
 */
export function symbolsOfProject(symbols: lsp.SymbolInformation[], projectPath: string, classpath?: ClassPathData) {
    const sourceFolders = (classpath?.entries ?? [])
        .filter(cpe => cpe.kind === "source")
        .map(cpe => sanitizeFilePath(cpe.path));

    if (sourceFolders.length === 0) {
        // Nothing to attribute by, so the project location is the best guess left.
        const location = sanitizeFilePath(projectPath);
        return symbols?.filter(s => sanitizeFilePath(s.location.uri).startsWith(location));
    }

    return symbols?.filter(s => {
        const filePath = sanitizeFilePath(s.location.uri);
        return sourceFolders.some(folder => isInFolder(filePath, folder));
    });
}

export function getBeansOfApp(app: BootApp) {
    return symbolsOfProject(beans, app.path, app.classpath);
}

export function getMappingsOfApp(app: BootApp) {
    return symbolsOfProject(mappings, app.path, app.classpath);
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
