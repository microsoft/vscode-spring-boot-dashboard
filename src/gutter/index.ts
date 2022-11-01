import * as vscode from "vscode";
import { StaticBean, StaticEndpoint } from "../models/StaticSymbolTypes";
import { getBeans, getMappings } from "../models/symbols";

let DECORATION_OPTIONS_PLACEHOLDER: vscode.ThemableDecorationInstanceRenderOptions;
let DECORATION_OPTIONS_BEAN: vscode.ThemableDecorationInstanceRenderOptions;
let DECORATION_OPTIONS_ENDPOINT: vscode.ThemableDecorationInstanceRenderOptions;
let DECORATION_TYPE_SPRING: vscode.TextEditorDecorationType;
let disposable: vscode.Disposable | undefined;

function decorateEditor(textEditor: vscode.TextEditor) {
    if (textEditor.document.languageId !== "java") {
        return;
    }

    const beans = (getBeans() ?? []).map(b => new StaticBean(b));
    const mappings = (getMappings() ?? []).map(m => new StaticEndpoint(m));
    const beansInCurrentEditor = beans.filter(b => isSameUriString(b.location.uri, textEditor.document.uri));
    const endpointsInCurrentEditor = mappings.filter(m => isSameUriString(m.location.uri, textEditor.document.uri));
    if (beansInCurrentEditor.length + endpointsInCurrentEditor.length > 0) {
        setDecorationOptions(textEditor, beansInCurrentEditor, endpointsInCurrentEditor);
    }
}

export function init(context: vscode.ExtensionContext) {
    DECORATION_OPTIONS_PLACEHOLDER = {
        before: {
            backgroundColor: new vscode.ThemeColor("editor.background"),
            color: new vscode.ThemeColor("editor.foreground"),
            width: "2em",
            contentText: " "
        }
    };
    DECORATION_OPTIONS_BEAN = {
        before: {
            backgroundColor: new vscode.ThemeColor("editor.background"),
            color: new vscode.ThemeColor("editor.foreground"),
            width: "2em",
            contentIconPath: vscode.Uri.joinPath(context.extensionUri, "resources", "gutter-bean.svg")
        }
    };
    DECORATION_OPTIONS_ENDPOINT = {
        before: {
            backgroundColor: new vscode.ThemeColor("editor.background"),
            color: new vscode.ThemeColor("editor.foreground"),
            width: "2em",
            contentIconPath: vscode.Uri.joinPath(context.extensionUri, "resources", "gutter-endpoint.svg")
        }
    };
    DECORATION_TYPE_SPRING = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        ...DECORATION_OPTIONS_PLACEHOLDER
    });

    vscode.window.visibleTextEditors.forEach(decorateEditor);
    disposable = vscode.window.onDidChangeVisibleTextEditors((textEditors) => {
        textEditors.forEach(decorateEditor);
    });
}

export function dispose() {
    if (disposable) {
        disposable.dispose();
        disposable = undefined;
    }
}

function setDecorationOptions(textEditor: vscode.TextEditor, beans: StaticBean[], mappings: StaticEndpoint[]): void {
    const placeholders: vscode.DecorationOptions[] = [];
    const decorations: vscode.DecorationOptions[] = [];
    const beanLines = beans.map(b => b.location.range.start.line);
    const mappingLines = mappings.map(m => m.location.range.start.line);
    for (let lineNumber = 0; lineNumber < textEditor.document.lineCount; lineNumber++) {
        if (beanLines.includes(lineNumber)) {
            const bean = beans.find(b => b.location.range.start.line === lineNumber)!;
            decorations.push({
                range: bean.location.range,
                hoverMessage: getBeanGutterHover(bean),
                renderOptions: DECORATION_OPTIONS_BEAN
            });
        } else if (mappingLines.includes(lineNumber)) {
            const mapping = mappings.find(m => m.location.range.start.line === lineNumber)!;
            decorations.push({
                range: mapping.location.range,
                hoverMessage: getEndpointGutterHover(mapping),
                renderOptions: DECORATION_OPTIONS_ENDPOINT
            });
        } else {
            placeholders.push({
                range: new vscode.Range(lineNumber, 0, lineNumber, 0),
                renderOptions: DECORATION_OPTIONS_PLACEHOLDER
            });
        }

    }
    textEditor.setDecorations(DECORATION_TYPE_SPRING, [...placeholders, ...decorations]);
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
    return uriA.path === b.path;
}
