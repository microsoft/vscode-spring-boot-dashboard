import * as vscode from "vscode";
import { connectedProcessKeys, getLiveProcess } from "../controllers/LiveDataController";
import { LiveProcess } from "../models/liveProcess";
import { Property, PropertyGroup } from "../models/properties";

type TreeData = Property | PropertyGroup | LiveProcess;

export class PropertiesProvider implements vscode.TreeDataProvider<TreeData> {
    private onDidChangePropertiesEmitter: vscode.EventEmitter<TreeData | undefined> = new vscode.EventEmitter<TreeData | undefined>();

    onDidChangeTreeData = this.onDidChangePropertiesEmitter.event;

    getTreeItem(element: TreeData): vscode.TreeItem{
        if (element instanceof LiveProcess) {
            return element.toTreeItem();
        } else if (element instanceof Property) {
            const item = new vscode.TreeItem(element.name);
            item.description = element.value;
            item.iconPath = new vscode.ThemeIcon("symbol-value");
            item.collapsibleState = vscode.TreeItemCollapsibleState.None;
            return item;
        } else if (element instanceof PropertyGroup) {
            const item = new vscode.TreeItem(element.name);
            item.iconPath = new vscode.ThemeIcon("symbol-namespace");
            item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            return item;
        } else {
            throw new Error("Unsupported data type for tree item.");
        }
    }

    async getChildren(element?: TreeData | undefined): Promise<TreeData[]> {
        if (element === undefined) {
            const keys = connectedProcessKeys();
            const ret = [];
            for (const k of keys) {
                const lp = getLiveProcess(k);
                if (lp) {
                    ret.push(lp);
                }
            }
            return ret;
        } else if (element instanceof LiveProcess) {
            const pgs = await element.getProperties();
            return pgs ?? [];
        } else if (element instanceof PropertyGroup) {
            return element.properties;
        } else {
            throw new Error("Unsupported data type to get children.");
        }
    }

    refresh() {
        this.onDidChangePropertiesEmitter.fire(undefined);
    }
}