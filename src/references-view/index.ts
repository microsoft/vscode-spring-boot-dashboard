// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import { getBeanDetail, getUrlOfBeanType } from '../models/stsApi';
import { Bean } from '../views/beans';
import { BeanItem, BeansDirection, BeansTreeInput } from './model';
import { SymbolTree } from './references-view';
import { asLocation } from './utils';

let currentBean: Bean;

/**
 * @param bean
 * Bean: from spring.beans view
 * BeanItem: from references-view
 * undefined: from references-view.title
 */
export async function showDependencies(bean?: Bean | BeanItem) {
    await vscode.commands.executeCommand("setContext", "beanHierarchy:direction", "dependencies");
    if (bean) {
        currentBean = bean instanceof BeanItem ? bean.item : bean;
    }
    await showBeanHierarchy(currentBean, BeansDirection.Dependencies);
}

/**
 * @param bean
 * Bean: from spring.beans view
 * BeanItem: from references-view
 * undefined: from references-view.title
 */
export async function showInjectedInto(bean?: Bean | BeanItem) {
    await vscode.commands.executeCommand("setContext", "beanHierarchy:direction", "injectedInto");
    if (bean) {
        currentBean = bean instanceof BeanItem ? bean.item : bean;
    }
    await showBeanHierarchy(currentBean, BeansDirection.InjectedInto);
}

export async function showBeanHierarchy(bean: Bean, direction?: BeansDirection) {
    const tree = await vscode.extensions.getExtension<SymbolTree>('ms-vscode.references-view')?.activate();
    if (tree) {
        const detail = await getBeanDetail(bean.processKey, bean.id);
        if (detail?.length) {
            const beanWithDetail = { ...bean, ...detail[0] };
            const uriString = await getUrlOfBeanType(beanWithDetail.type);
            const location = asLocation(uriString);
            // const textEdit = await vscode.window.showTextDocument(location.uri);
            // const range = textEdit.document.getWordRangeAtPosition(location.range.start);
            // const newLocation = new vscode.Location(textEdit.document.uri, range ?? location.range);
            const input = new BeansTreeInput(location, beanWithDetail, direction ?? BeansDirection.Dependencies);
            tree.setInput(input);
        }
    }
}
