import * as vscode from 'vscode';
import { ExtensionAPI } from "../types/sts-api";

export let stsApi: ExtensionAPI;

export async function initialize() {
    if (stsApi === undefined) {
        const stsExt = vscode.extensions.getExtension("pivotal.vscode-spring-boot");
        stsApi = await stsExt?.activate();
    }
}

export async function getBeansDependingOn(processKey: string, id: string) {
    const beans = await stsApi.getLiveProcessData({
        processKey,
        endpoint: "beans",
        dependingOn: id
    });
    return beans;
}

export async function getBeans(processKey: string) {
    const result = await stsApi.getLiveProcessData({
        processKey: processKey,
        endpoint: "beans"
    });
    return result;
}

export async function getMappings(processKey: string) {
    const result = await stsApi.getLiveProcessData({
        processKey: processKey,
        endpoint: "mappings"
    });
    return result;
}

export function getPid(processKey: string) {
    return processKey.split(" - ")?.[0];
}

export function getMainClass(processKey: string) {
    return processKey.split(" - ")?.[1];
}
