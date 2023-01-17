// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from 'vscode';

export function del<T>(array: T[], e: T): void {
	const idx = array.indexOf(e);
	if (idx >= 0) {
		array.splice(idx, 1);
	}
}

export function tail<T>(array: T[]): T | undefined {
	return array[array.length - 1];
}

export function asResourceUrl(uri: vscode.Uri, range: vscode.Range): vscode.Uri {
	return uri.with({ fragment: `L${1 + range.start.line},${1 + range.start.character}-${1 + range.end.line},${1 + range.end.character}` });
}

/**
 * @param urlLink format: file:///<file-path>#<line>
 */
export function asLocation(urlLink: string): vscode.Location {
	const [uriString, line] = urlLink.split("#");
	const uri = vscode.Uri.parse(uriString);

	const start = new vscode.Position(parseInt(line) - 1, 0);
	const end = start.with(start.line + 1);

	return new vscode.Location(uri, new vscode.Range(start, end));
}

// vscode.SymbolKind.File === 0, Module === 1, etc...
const _themeIconIds = [
	'symbol-file', 'symbol-module', 'symbol-namespace', 'symbol-package', 'symbol-class', 'symbol-method',
	'symbol-property', 'symbol-field', 'symbol-constructor', 'symbol-enum', 'symbol-interface',
	'symbol-function', 'symbol-variable', 'symbol-constant', 'symbol-string', 'symbol-number', 'symbol-boolean',
	'symbol-array', 'symbol-object', 'symbol-key', 'symbol-null', 'symbol-enum-member', 'symbol-struct',
	'symbol-event', 'symbol-operator', 'symbol-type-parameter'
];

export function getThemeIcon(kind: vscode.SymbolKind): vscode.ThemeIcon | undefined {
	const id = _themeIconIds[kind];
	return id ? new vscode.ThemeIcon(id) : undefined;
}
