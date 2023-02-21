// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
export class FolderItem extends vscode.TreeItem {
    constructor(
        name: string
    ) {
        super(name, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = vscode.ThemeIcon.Folder;
        this.contextValue = "spring:folder";
    }
}

export class WorkspaceFolderItem extends FolderItem {
    constructor() {
        super("Current Workspace");
        this.iconPath = new vscode.ThemeIcon("device-desktop");
        this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        this.contextValue = "spring:workspaceFolder";
    }
}