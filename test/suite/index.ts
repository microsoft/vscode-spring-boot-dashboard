// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { glob } from "glob";
import Mocha from "mocha";
import * as path from "path";

export async function run(testPattern = "**/*.test.js"): Promise<void> {
    // Create the mocha test
    const mocha = new Mocha({
        ui: "tdd",
        color: true,
        timeout: 10 * 60 * 1000,
    });

    const testsRoot = __dirname;
    const files = await glob(testPattern, { cwd: testsRoot });
    files.forEach((file) => mocha.addFile(path.resolve(testsRoot, file)));

    return new Promise((c, e) => {
        try {
            mocha.run((failures) => {
                if (failures > 0) {
                    e(new Error(`${failures} tests failed.`));
                } else {
                    c();
                }
            });
        } catch (err) {
            e(err);
        }
    });
}
