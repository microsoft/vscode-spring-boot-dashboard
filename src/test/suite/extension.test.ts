// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import * as assert from "assert";
import * as vscode from "vscode";
import { AppState } from "../../BootApp";
import { initSymbols } from "../../controllers/SymbolsController";
import { appsProvider } from "../../views/apps";
import { Bean, beansProvider } from "../../views/beans";
import { Endpoint, mappingsProvider, StaticEndpoint } from "../../views/mappings";
import { setupTestEnv, sleep } from "../utils";

suite("Extension Test Suite", () => {

    suiteSetup(async function() {
        await setupTestEnv();
    });

    test("Can view static beans and mappings", async () => {
        await vscode.commands.executeCommand("spring-boot-dashboard.focus");
        // workaround for https://github.com/microsoft/vscode-spring-boot-dashboard/issues/195
        await initSymbols(5000);
        let rootBean = await beansProvider.getChildren();
        while (!rootBean || rootBean.length === 0) {
            await sleep(5 * 1000 /** ms */);
            rootBean = await beansProvider.getChildren();
        }
        assert.strictEqual(rootBean.length, 1);
        // verify beans list
        const beans = await beansProvider.getChildren(rootBean[0]);
        assert.strictEqual(beans?.length, 14);
        // verify bean name
        const bean0 = beans[0] as Bean;
        assert.strictEqual(bean0.id, "cacheConfiguration");
        // verify clicking bean item
        await vscode.commands.executeCommand("spring.dashboard.bean.navigate", bean0);
        await sleep(5 * 1000 /** ms */);
        let openedEditor = vscode.window.activeTextEditor;
        assert.ok(openedEditor?.document.fileName.endsWith("CacheConfiguration.java"));
        assert.strictEqual(openedEditor?.selection.anchor.line, 30);
        assert.strictEqual(openedEditor?.selection.anchor.character, 0);

        let rootMap = await mappingsProvider.getChildren();
        while (!rootMap || rootMap.length === 0) {
            await sleep(5 * 1000 /** ms */);
            rootMap = await mappingsProvider.getChildren();
        }
        assert.strictEqual(rootMap.length, 1);
        // verify maps list
        const maps = await mappingsProvider.getChildren(rootMap[0]);
        assert.strictEqual(maps?.length, 17);
        // verify map name
        const map1 = maps[1] as StaticEndpoint;
        assert.strictEqual(map1.label, "/oups [GET]");
        // verify clicking map item
        await vscode.commands.executeCommand("spring.dashboard.endpoint.navigate", map1);
        await sleep(5 * 1000 /** ms */);
        openedEditor = vscode.window.activeTextEditor;
        assert.ok(openedEditor?.document.fileName.endsWith("CrashController.java"));
        assert.strictEqual(openedEditor?.selection.anchor.line, 30);
        assert.strictEqual(openedEditor?.selection.anchor.character, 0);
    }).timeout(120 * 1000 /** ms */);

    test("Can view dynamic beans and mappings", async () => {
        const apps = appsProvider.manager.getAppList();
        assert.strictEqual(apps.length, 1);
        const app = apps[0];
        await vscode.commands.executeCommand("spring-boot-dashboard.localapp.run", app);
        while (app.state !== AppState.LAUNCHING) {
            await sleep(5 * 1000 /** ms */);
        }
        assert.strictEqual(app.state, AppState.LAUNCHING);
        // verify all beans
        beansProvider.showAll = true;
        await sleep(20 * 1000 /** ms */);
        let rootBeanAll = await beansProvider.getChildren();
        while (!rootBeanAll || rootBeanAll.length === 0) {
            await sleep(5 * 1000 /** ms */);
            rootBeanAll = await beansProvider.getChildren();
        }
        assert.strictEqual(rootBeanAll.length, 1);
        const allBeans = await beansProvider.getChildren(rootBeanAll[0]);
        assert.strictEqual(allBeans?.length, 376);
        // verify active bean name
        const allBean0 = allBeans[0] as Bean;
        assert.strictEqual(allBean0.id, "applicationAvailability");
        // verify clicking bean item
        await vscode.commands.executeCommand("spring.dashboard.bean.open", allBean0);
        await sleep(5 * 1000 /** ms */);
        let openedEditor = vscode.window.activeTextEditor;
        assert.ok(openedEditor?.document.fileName.endsWith("ApplicationAvailabilityBean.class"));

        // verify all maps
        mappingsProvider.showAll = true;
        await sleep(20 * 1000 /** ms */);
        let rootMap = await mappingsProvider.getChildren();
        while (!rootMap || rootMap.length === 0) {
            await sleep(5 * 1000 /** ms */);
            rootMap = await mappingsProvider.getChildren();
        }
        assert.strictEqual(rootMap.length, 1);
        // verify maps list
        const allMaps = await mappingsProvider.getChildren(rootMap[0]);
        assert.strictEqual(allMaps?.length, 45);
        // verify map name
        const allMap2 = allMaps[2] as Endpoint;
        assert.strictEqual(allMap2.label, "/actuator [GET]");
        assert.strictEqual(allMap2.handler, "Actuator root web endpoint");
        // verify clicking map item
        await vscode.commands.executeCommand("spring.dashboard.endpoint.open", allMap2);
        await sleep(5 * 1000 /** ms */);
        openedEditor = vscode.window.activeTextEditor;
        // open in simple browser
        assert.ok(!openedEditor);
    }).timeout(120 * 1000 /** ms */);
});
