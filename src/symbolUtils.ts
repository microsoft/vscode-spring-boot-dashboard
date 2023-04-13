import * as vscode from "vscode";
import * as lsp from "vscode-languageclient";
import { createConverter } from "vscode-languageclient/lib/common/protocolConverter"
import { stsApi } from "./models/stsApi";

let p2c: lsp.Protocol2CodeConverter | undefined;

export const protocol2CodeConverter = () => stsApi?.client.protocol2CodeConverter ?? fallbackProtocol2CodeConverter();

function fallbackProtocol2CodeConverter() {
    if (!p2c) {
        p2c = createConverter(undefined, undefined);
    }
    return p2c;
}

export function locationEquals(la_lsp: lsp.Location | undefined, lb: vscode.Location): boolean {
    if (!la_lsp) {
        return false;
    }

    const la = protocol2CodeConverter().asLocation(la_lsp);
    return la.uri.toString() === lb.uri.toString() && rangeEquals(la.range, lb.range);
}

function rangeEquals(ra: vscode.Range, rb: vscode.Range): boolean {
    return positionEquals(ra.start, rb.start) && positionEquals(ra.end, rb.end);
}

function positionEquals(pa: vscode.Position, pb: vscode.Position): boolean {
    return pa.line === pb.line && pa.character === pb.character;
}

export function sanitizeFilePath(uriLike: string | vscode.Uri) {
    if (uriLike instanceof vscode.Uri) {
        return uriLike.fsPath;
    }
    return vscode.Uri.parse(uriLike).fsPath;
}
