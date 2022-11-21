import * as vscode from "vscode";

export function locationEquals(la: { uri: string; range: vscode.Range; }, lb: vscode.Location): boolean {
    return la.uri === lb.uri.toString() && rangeEquals(la.range, lb.range);
}

function rangeEquals(ra: vscode.Range, rb: vscode.Range): boolean {
    return positionEquals(ra.start, rb.start) && positionEquals(ra.end, rb.end);
}

function positionEquals(pa: vscode.Position, pb: vscode.Position): boolean {
    return pa.line === pb.line && pa.character === pb.character;
}