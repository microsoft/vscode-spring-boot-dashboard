// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Readable } from "stream";

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
