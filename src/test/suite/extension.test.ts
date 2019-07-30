// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import * as assert from "assert";
import { before } from "mocha";
import * as vscode from "vscode";

 suite("Extension Test Suite", () => {
    before(() => {
        vscode.window.showInformationMessage("Start all tests.");
    });

     test("Extension should be present", () => {
        assert.ok(vscode.extensions.getExtension("vscjava.vscode-spring-boot-dashboard"));
    });

     test("should activate", () => {
        const ext = vscode.extensions.getExtension("vscjava.vscode-spring-boot-dashboard");
        assert.notEqual(ext, null);
        return ext!.activate().then(() => {
            assert.ok(true);
        });
    });
});
