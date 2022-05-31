// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Readable } from "stream";
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
