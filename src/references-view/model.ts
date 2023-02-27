// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import { SymbolItemDragAndDrop, SymbolItemEditorHighlights, SymbolItemNavigation, SymbolTreeInput, SymbolTreeModel } from './references-view';

import { getBeanDetail, getBeansDependingOn } from '../models/stsApi';
import { Bean } from "../views/beans";

export class BeansTreeInput implements SymbolTreeInput<BeanItem> {
    readonly contextValue: string = "beanHierarchy";
    readonly title: string;

    constructor(
        readonly location: vscode.Location,
        readonly rootItem: Bean,
        readonly direction: BeansDirection,
    ) {
        this.title = direction === BeansDirection.Dependencies
            ? "Depending On"
            : "Injected Into";
    }


    async resolve(): Promise<BeansModel> {
        const items: Bean[] = [this.rootItem];
        const model = new BeansModel(this.direction, items);
        return model;
    }

    with(location: vscode.Location): BeansTreeInput {
        return new BeansTreeInput(location, this.rootItem, this.direction);
    }

}

export enum BeansDirection {
    Dependencies,
    InjectedInto
}

export class BeanItem {
    children?: BeanItem[];

    constructor(
        readonly model: BeansModel,
        readonly item: Bean,
        readonly parent: Bean | undefined,
        readonly locations: vscode.Location[] | undefined,
    ) { }

}

class BeansModel implements SymbolTreeModel<BeanItem> {
    readonly roots: BeanItem[] = [];

    private readonly _onDidChange = new vscode.EventEmitter<BeansModel>();
	readonly onDidChange = this._onDidChange.event;
    readonly provider: BeanDataProvider;

    constructor(
        readonly direction: BeansDirection,
        items: Bean[],
    ) {
        this.roots = items.map(item => new BeanItem(this, item, undefined, undefined));
        this.provider = new BeanDataProvider(this);
    }

    get message(): string | undefined {
        return undefined;
    }

    // TODO
    navigation?: SymbolItemNavigation<BeanItem> | undefined;
    highlights?: SymbolItemEditorHighlights<BeanItem> | undefined;
    dnd?: SymbolItemDragAndDrop<BeanItem> | undefined;

}

class BeanDataProvider implements vscode.TreeDataProvider<BeanItem> {
    // onDidChangeTreeData?: vscode.Event<void | BeanItem | null | undefined> | undefined;
    constructor(
        readonly model: BeansModel
    ) {}


    public getTreeItem(element: BeanItem): vscode.TreeItem {
        const item = new vscode.TreeItem(element.item.id);
        item.collapsibleState = element.parent ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded;
        const themeColor = new vscode.ThemeColor("charts.green");
        item.iconPath = new vscode.ThemeIcon("spring-bean", themeColor);
        item.contextValue = "spring:bean";
        item.command = {
            command: "spring.dashboard.bean.open",
            title: "Open",
            arguments: [element.item]
        };
        return item;
    }

    public async getChildren(element?: BeanItem | undefined): Promise<BeanItem[] | undefined> {
        if (!element) {
            return this.model.roots;
        }

        const children: Bean[] = [];
        if (this.model.direction === BeansDirection.Dependencies) {
            // Dependencies
            if (element.item.dependencies?.length) {
                for (const dep of element.item.dependencies) {
                    const details = await getBeanDetail(element.item.processKey, dep);
                    if (details?.length) {
                        children.push({ ...details[0], processKey: element.item.processKey });
                    } else {
                        children.push({ id: dep, processKey: element.item.processKey });
                    }
                }
            }
        } else {
            // Injected Into
            const beans: Bean[] = await getBeansDependingOn(element.item.processKey, element.item.id);
            if (beans?.length) {
                for (const b of beans) {
                    children.push({ ...b, processKey: element.item.processKey });
                }
            }
        }

        element.children = children.map(child => new BeanItem(this.model, child, element.item, undefined));
        return element.children;
    }

}
