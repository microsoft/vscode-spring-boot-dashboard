// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import { getBeanDetail, getUrlOfBeanType } from '../models/stsApi';
import { Bean } from '../views/beans';
import { BeanItem, BeansDirection, BeansTreeInput } from './model';
import { SymbolTree } from './references-view';
import { asLocation } from './utils';

const DEFAULT_DIRECTION = BeansDirection.Dependencies;

let currentBean: Bean;
let currentDirection: BeansDirection = DEFAULT_DIRECTION;

/**
 * @param bean
 * Bean: from spring.beans view
 * BeanItem: from references-view
 * undefined: from references-view.title
 */
export async function showDependencies(bean?: Bean | BeanItem) {
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
    if (bean) {
        currentBean = bean instanceof BeanItem ? bean.item : bean;
    }
    await showBeanHierarchy(currentBean, BeansDirection.InjectedInto);
}

export async function showBeanHierarchy(bean: Bean, direction?: BeansDirection) {
    currentBean = bean;
    currentDirection = direction ?? currentDirection ?? DEFAULT_DIRECTION;

    const contextValue = currentDirection === BeansDirection.Dependencies ? "dependencies" : "injectedInto";
    await vscode.commands.executeCommand("setContext", "beanHierarchy:direction", contextValue);


    const tree = await vscode.extensions.getExtension<SymbolTree>('ms-vscode.references-view')?.activate();
    if (tree) {
        const detail = await getBeanDetail(bean.processKey, bean.id);
        if (detail?.length) {
            const beanWithDetail = { ...bean, ...detail[0] };
            const uriString = await getUrlOfBeanType(beanWithDetail.type);
            const location = asLocation(uriString);
            const input = new BeansTreeInput(location, beanWithDetail, currentDirection);
            tree.setInput(input);
        }
    }
}
