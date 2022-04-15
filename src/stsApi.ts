import * as vscode from 'vscode';
import { ExtensionAPI } from "./types/sts-api";
import { BeansDataProvider } from './views/beans';
import { MappingsDataProvider } from './views/mappings';

let stsApi: ExtensionAPI;
export async function initialize(beansProvider: BeansDataProvider, mappingsProvider: MappingsDataProvider) {
    const stsExt = vscode.extensions.getExtension("pivotal.vscode-spring-boot");
    stsApi = await stsExt?.activate();

    stsApi.onDidLiveProcessConnect(async e => {
        console.log("connect", e);

        const beans = await stsApi.getLiveProcessData({
            processKey: e,
            endpoint: "beans"
        });
        beansProvider.refresh(e, beans);
        console.log(beans);

        const mappings = await stsApi.getLiveProcessData({
            processKey: e,
            endpoint: "mappings"
        });
        mappingsProvider.refresh(e, mappings);
        console.log(mappings);
    });
    stsApi.onDidLiveProcessDisconnect(e => {
        console.log("disconnect", e);
        beansProvider.refresh(e, []);
        mappingsProvider.refresh(e, []);
    });
    stsApi.onDidLiveProcessUpdate(async e => {
        console.log("update", e);
        const beans = await stsApi.getLiveProcessData({
            processKey: e,
            endpoint: "beans"
        });
        console.log(beans);
    });
}

export async function beansDependingOn(processKey: string, id: string) {
    const beans = await stsApi.getLiveProcessData({
        processKey,
        endpoint: "beans",
        dependingOn: id
    });
    return beans;
}