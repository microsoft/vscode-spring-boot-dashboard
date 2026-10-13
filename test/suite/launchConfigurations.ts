// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as vscode from "vscode";
import { run as runSuite } from "./index";

export function run(): Promise<void> {
    assert.ok((vscode.workspace.workspaceFolders?.length ?? 0) > 1, "Launch configuration tests require a multi-root workspace.");
    return runSuite("launchConfigurations.test.js");
}
