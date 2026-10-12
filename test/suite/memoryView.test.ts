// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

suite("Memory View Layout", () => {
    test("Constrains responsive charts with a definite container height", () => {
        const styles = fs.readFileSync(path.resolve(__dirname, "../../../resources/webview-ui/styles.css"), "utf8");
        const containerStyles = styles.match(/\.chart-container\s*\{([^}]+)\}/)?.[1];

        assert.ok(containerStyles, "The memory chart must have a styled container");
        assert.match(containerStyles, /height:\s*350px\s*;/);
        assert.match(containerStyles, /width:\s*100%\s*;/);
    });
});
