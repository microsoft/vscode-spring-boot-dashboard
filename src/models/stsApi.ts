import * as cp from "child_process";
import * as os from "os";
import { promisify } from "util";
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ExtensionAPI } from "../types/sts-api";
const execFile = promisify(cp.execFile);

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
      // get embedded JRE Home
      let jreHome: string | undefined;
      try {
         const jreFolder = path.join(javaExt.extensionPath, "jre");
         const jreDistros = await fs.promises.readdir(jreFolder);
         if (jreDistros.length > 0) {
            jreHome = path.join(jreFolder, jreDistros[0]);
         }
      } catch (error) {
         console.error(error);
      }
    return jreHome;
}

