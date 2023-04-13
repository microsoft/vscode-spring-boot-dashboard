import * as vscode from "vscode";
import { initSymbols } from "../controllers/SymbolsController";
import { StaticBean, StaticEndpoint } from "../models/StaticSymbolTypes";
import { getBeans, getMappings } from "../models/symbols";
import { sleep } from "../utils";
import { protocol2CodeConverter } from "../symbolUtils";

let DECORATION_TYPE_BEAN: vscode.TextEditorDecorationType;
let DECORATION_TYPE_ENDPOINT: vscode.TextEditorDecorationType;
const disposables: vscode.Disposable[] = [];

function decorateEditor(textEditor: vscode.TextEditor) {
    if (textEditor.document.languageId !== "java") {
        return;
    }

    const beans = (getBeans(textEditor.document.uri) ?? []).map(b => new StaticBean(b));
    const mappings = (getMappings(textEditor.document.uri) ?? []).map(m => new StaticEndpoint(m));
    const beansInCurrentEditor = beans.filter(b => isSameUriString(b.location.uri, textEditor.document.uri));
    const endpointsInCurrentEditor = mappings.filter(m => isSameUriString(m.location.uri, textEditor.document.uri));
    if (beansInCurrentEditor.length + endpointsInCurrentEditor.length > 0) {
        setDecorationOptions(textEditor, beansInCurrentEditor, endpointsInCurrentEditor);
    }
}

export function init(context: vscode.ExtensionContext) {
    DECORATION_TYPE_BEAN = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        gutterIconPath: vscode.Uri.joinPath(context.extensionUri, "resources", "gutter-bean.svg")
    });
    DECORATION_TYPE_ENDPOINT = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        gutterIconPath: vscode.Uri.joinPath(context.extensionUri, "resources", "gutter-endpoint.svg")
    });

    disposables.push(vscode.window.onDidChangeVisibleTextEditors((textEditors) => {
        textEditors.forEach(decorateEditor);
    }));
    disposables.push(vscode.workspace.onDidSaveTextDocument(async (e) => {
        if (e === vscode.window.activeTextEditor?.document) {
            // TODO: magic number here because you have to wait STS-LS to update workspace symbols before querying it.
            await sleep(1000);
            await initSymbols();
            decorateEditor(vscode.window.activeTextEditor);
        }
    }));
    vscode.window.visibleTextEditors.forEach(decorateEditor);
}

export function dispose() {
    while (disposables.length > 0) {
        disposables.pop()?.dispose();
    }
}

function setDecorationOptions(textEditor: vscode.TextEditor, beans: StaticBean[], mappings: StaticEndpoint[]): void {
    const beanDecorations: vscode.DecorationOptions[] = [];
    const mappingDecorations: vscode.DecorationOptions[] = [];
    const beanLines = beans.map(b => b.location.range.start.line);
    const mappingLines = mappings.map(m => m.location.range.start.line);
    for (let lineNumber = 0; lineNumber < textEditor.document.lineCount; lineNumber++) {
        if (beanLines.includes(lineNumber)) {
            const bean = beans.find(b => b.location.range.start.line === lineNumber);
            if (bean) {
                beanDecorations.push({
                    range: protocol2CodeConverter().asRange(bean.location.range),
                    hoverMessage: getBeanGutterHover(bean)
                });
            }
        } else if (mappingLines.includes(lineNumber)) {
            const mapping = mappings.find(m => m.location.range.start.line === lineNumber);
            if (mapping) {
                mappingDecorations.push({
                    range: protocol2CodeConverter().asRange(mapping.location.range),
                    hoverMessage: getEndpointGutterHover(mapping)
                });
            }
        }
    }
    textEditor.setDecorations(DECORATION_TYPE_BEAN, [...beanDecorations]);
    textEditor.setDecorations(DECORATION_TYPE_ENDPOINT, [...mappingDecorations]);
}

function getBeanGutterHover(bean: StaticBean) {
    const args = [bean];
    const commandUri = vscode.Uri.parse(`command:spring.beans.reveal?${encodeURIComponent(JSON.stringify(args))}`);
    const message = new vscode.MarkdownString(
        `$(telescope)[Reveal In Dashboard](${commandUri})\n\nBean: ${bean.label}`,
        true
    );
    message.isTrusted = true;
    return message;
}

function getEndpointGutterHover(endpoint: StaticEndpoint) {
    const args = [endpoint];
    const commandUri = vscode.Uri.parse(`command:spring.mappings.reveal?${encodeURIComponent(JSON.stringify(args))}`);
    const message = new vscode.MarkdownString(
        `$(telescope)[Reveal In Dashboard](${commandUri})\n\nEndpoint: ${endpoint.label}`,
        true
    );
    message.isTrusted = true;
    return message;
}

function isSameUriString(a: string, b: vscode.Uri): boolean {
    const uriA = vscode.Uri.parse(a);

    return process.platform === "win32" ?
        uriA.path.toLowerCase() === b.path.toLowerCase() :
        uriA.path === b.path;
}
