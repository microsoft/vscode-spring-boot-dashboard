// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

export abstract class StaticSymbol {
    constructor(protected raw: any) {
    }

    public get name() : string {
        return this.raw.name;
    }

    public get location() : {
        uri: string;
        range: vscode.Range;
    } {
        return this.raw.location;
    }

    abstract label: string;
}

export class StaticBean extends StaticSymbol{
    public get label(): string {
        return this.id;
    }

    public get id() : string {
        const m = (this.raw.name as string).match(/^@\+ '(.+?)'/);
        return m ? m[1] : "unknown";
    }
}

export class StaticEndpoint extends StaticSymbol {
    public get label() : string {
        const [pattern, method] = this.raw.name.replace(/^@/, "").split(" -- ");
        let label = pattern ?? "unknown";
        if (method) {
            label += ` [${method}]`;
        }
        return label;
    }

    // parsed
    public get method(): string | undefined {
        return this.raw.method;
    }

    public get pattern(): string | undefined {
        return this.raw.pattern;
    }
}
