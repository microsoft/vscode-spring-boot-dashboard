// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as cp from "child_process";
import * as os from "os";
import * as path from 'path';
import { promisify } from "util";
import * as vscode from 'vscode';
import { ExtensionAPI } from "../types/sts-api";
const execFile = promisify(cp.execFile);

export let stsApi: ExtensionAPI;

export async function initialize() {
    if (stsApi === undefined) {
        const stsExt = vscode.extensions.getExtension("pivotal.vscode-spring-boot");
        stsApi = await stsExt?.activate();
    }
}

export async function getBeansDependingOn(processKey: string, beanName: string) {
    const beans = await stsApi.getLiveProcessData({
        processKey,
        endpoint: "beans",
        dependingOn: beanName
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

export async function getBeanDetail(processKey: string, beanName: string) {
    const bean = await stsApi.getLiveProcessData({
        processKey,
        endpoint: "beans",
        beanName
    });
    return bean;
}

export async function getMappings(processKey: string) {
    const result = await stsApi.getLiveProcessData({
        processKey: processKey,
        endpoint: "mappings"
    });
    return result;
}

export async function getGcPausesMetrics(processKey: string) {
    const result = await stsApi.getLiveProcessMetricsData({
        processKey: processKey,
        endpoint: "metrics",
        metricName: "gcPauses"
    });
    return result;
}

export async function getMemoryMetrics(processKey: string, memory: string) {
    const result = await stsApi.getLiveProcessMetricsData({
        processKey: processKey,
        endpoint: "metrics",
        metricName: memory
    });
    return result;
}

export async function getPort(processKey: string) {
    const result = await stsApi.getLiveProcessData({
        processKey: processKey,
        endpoint: "port"
    });
    return result;
}

export async function getContextPath(processKey: string) {
    const result = await stsApi.getLiveProcessData({
        processKey: processKey,
        endpoint: "contextPath"
    });
    return result;
}


// workaround before livedata carries location
/**
 * @param beanType full qualified name of a class
 */
export async function getUrlOfBeanType(beanType: string) {
    const bindingKey = `L${beanType.replace(/\./g, "/")};`;
    const uriString = await vscode.commands.executeCommand<string>("sts.java.javadocHoverLink", {
        bindingKey,
        lookInOtherProjects: true
    });
    return uriString;
}

/**
 * below are workaround for spring-tools v1.33 as `processKey` equals to `pid`.
 */
export function getPid(processKey: string) {
    return processKey.split(" - ")?.[0];
}

export async function getMainClass(processKey: string) {
    const mainClass = processKey.split(" - ")?.[1];
    if (!mainClass) {
        const pid = getPid(processKey);
        return await getMainClassFromPid(pid);
    }
    return mainClass;
}

async function getMainClassFromPid(pid: string) {
    // workaround: parse output from  `jps -l`
    const jreHome = await getJreHome();
    if (jreHome) {
        const jpsExecRes = await execFile(path.join(jreHome, "bin", "jps"), ["-l"]);
        const targetLine = jpsExecRes.stdout.split(os.EOL).find(line => line.startsWith(pid));
        if (targetLine) {
            const segments = targetLine.trim().split(/\s+/);
            return segments[segments.length - 1];
        }
    }

    return "";
}

async function getJreHome() {
    const javaExt = vscode.extensions.getExtension("redhat.java");
    if (!javaExt) {
        return undefined;
    }
    return javaExt.exports.javaRequirement?.tooling_jre;
}

export async function requestWorkspaceSymbols(_projectPath?: string): Promise<{
    beans: any[],
    mappings: any[]
}> {
    const beans = await stsApi.client.sendRequest("workspace/symbol", {"query": "@+"}) as any[];
    const mappings = await stsApi.client.sendRequest("workspace/symbol", {"query": "@/"}) as any[];

    return {
        beans,
        mappings
    };
}
