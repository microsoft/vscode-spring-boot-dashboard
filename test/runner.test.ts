// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { run } from "./suite/index";

async function main(): Promise<void> {
    const fixtures = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-runner-"));
    const passing = path.join(fixtures, "passing.test.js");
    const failing = path.join(fixtures, "failing.test.js");
    const marker = path.join(fixtures, "discovered");
    try {
        fs.writeFileSync(passing, `suite("runner discovery", () => {
            test("executes discovered tests", () => {
                require("fs").writeFileSync(${JSON.stringify(marker)}, "executed");
            });
        });`);
        fs.writeFileSync(failing, `suite("runner failure reporting", () => {
            test("reports failures", () => { throw new Error("expected fixture failure"); });
        });`);
        await run(passing.replace(/\\/g, "/"));
        assert.strictEqual(fs.readFileSync(marker, "utf8"), "executed");
        await assert.rejects(run(failing.replace(/\\/g, "/")), /1 tests failed\./);
    } finally {
        fs.rmSync(fixtures, { recursive: true, force: true });
    }
}

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
