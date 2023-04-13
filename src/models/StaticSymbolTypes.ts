// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as lsp from "vscode-languageclient";

export abstract class StaticSymbol {
    constructor(protected raw: lsp.SymbolInformation) {
    }

    public get name() : string {
        return this.raw.name;
    }

    public get location() : lsp.Location {
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
    public pattern: string | undefined;
    public method: string | undefined;

    constructor(raw: lsp.SymbolInformation) {
        super(raw);
        const [pattern, method] = this.raw.name.replace(/^@/, "").split(" -- ");
        this.pattern = pattern;
        this.method = method;
    }

    public get label() : string {
        let label = this.pattern ?? "unknown";
        if (this.method) {
            label += ` [${this.method}]`;
        }
        return label;
    }
}
