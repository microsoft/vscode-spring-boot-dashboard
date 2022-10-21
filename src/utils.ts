// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import { Readable } from "stream";
import * as vscode from "vscode";
import pidtree = require("pidtree");

export function readAll(input: Readable) : Promise<string> {
    let buffer = "";
    return new Promise<string>((resolve, reject) => {
        input.on('data', data => {
            buffer += data;
        });
        input.on('error', error => {
            reject(error);
        });
        input.on('end', () => {
            resolve(buffer.toString());
        });

    });
}

export async function isAlive(pid?: number) {
    if (!pid) {
        return false;
    }

    const pidList = await pidtree(-1);
    return pidList.includes(pid);
}


export async function sleep(ms: number) {
    return new Promise<void>((resolve) => {
        setTimeout(() => {
            resolve();
        }, ms);
    });
}

export function isActuatorJarFile(f: string): boolean {
    const fileName = path.basename(f || "");
    if (/^spring-boot-actuator-\d+\.\d+\.\d+(.*)?.jar$/.test(fileName)) {
        return true;
    }
    return false;
}

/**
 * Construct URL based on format defined in spring.dashboard.openUrl
 *
 * @param contextPath
 * @param port
 * @param pathSeg must starts with '/'
 * @returns url
 */
export function constructOpenUrl(contextPath: string, port: number, pathSeg?: string) {
    const configOpenUrl: string | undefined = vscode.workspace.getConfiguration("spring.dashboard").get<string>("openUrl");
    let openUrl: string;

    if (configOpenUrl === undefined) {
        openUrl = `http://localhost:${port}${contextPath}`;
    } else {
        openUrl = configOpenUrl
            .replace("{port}", String(port))
            .replace("{contextPath}", contextPath.toString());
    }
    return `${openUrl}${pathSeg ?? "/"}`;
}
