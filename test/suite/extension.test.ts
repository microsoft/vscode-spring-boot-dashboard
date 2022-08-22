// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.
import * as assert from "assert";
import * as vscode from "vscode";
import { AppState } from "../../src/BootApp";
import { initSymbols } from "../../src/controllers/SymbolsController";
import { StaticEndpoint } from "../../src/models/StaticSymbolTypes";
import { appsProvider } from "../../src/views/apps";
import { Bean, beansProvider } from "../../src/views/beans";
import { Endpoint, mappingsProvider } from "../../src/views/mappings";
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
        assert.strictEqual(rootBean.length, 1, "There should be 1 project node in bean explorer.");
        // verify beans list
        const beans = await beansProvider.getChildren(rootBean[0]);
        assert.strictEqual(beans?.length, 14, "There should be 14 static beans in total.");
        // verify bean name
        const bean0 = beans[0] as Bean;
        assert.strictEqual(bean0.id, "cacheConfiguration", "The 1st bean should be cacheConfiguration.");
        // verify clicking bean item
        await vscode.commands.executeCommand("spring.dashboard.bean.navigate", bean0);
        await sleep(5 * 1000 /** ms */);
        let openedEditor = vscode.window.activeTextEditor;
        assert.ok(openedEditor?.document.fileName.endsWith("CacheConfiguration.java"), "CacheConfiguration.java are opened.");
        assert.strictEqual(openedEditor?.selection.anchor.line, 30, "The definition of cacheConfiguration should be at line 30.");
        assert.strictEqual(openedEditor?.selection.anchor.character, 0, "The definition of cacheConfiguration should be at character 0.");

        let rootMap = await mappingsProvider.getChildren();
        while (!rootMap || rootMap.length === 0) {
            await sleep(5 * 1000 /** ms */);
            rootMap = await mappingsProvider.getChildren();
        }
        assert.strictEqual(rootMap.length, 1, "There should be 1 project node in mapping explorer.");
        // verify maps list
        const maps = await mappingsProvider.getChildren(rootMap[0]);
        assert.strictEqual(maps?.length, 17, "There should be 17 static mappings in total.");
        // verify map name
        const map1 = maps[1] as StaticEndpoint;
        assert.strictEqual(map1.label, "/oups [GET]", "The 1st mapping should be /oups [GET].");
        // verify clicking map item
        await vscode.commands.executeCommand("spring.dashboard.endpoint.navigate", map1);
        await sleep(5 * 1000 /** ms */);
        openedEditor = vscode.window.activeTextEditor;
        assert.ok(openedEditor?.document.fileName.endsWith("CrashController.java"), "CrashController.java are opened.");
        assert.strictEqual(openedEditor?.selection.anchor.line, 30, "The definition of CrashController should be at line 30.");
        assert.strictEqual(openedEditor?.selection.anchor.character, 1, "The definition of CrashController should be at character 0.");
    }).timeout(120 * 1000 /** ms */);

    test("Can view dynamic beans and mappings", async () => {
        const apps = appsProvider.manager.getAppList();
        assert.strictEqual(apps.length, 1, "There are 1 app in the app list.");
        const app = apps[0];
        await vscode.commands.executeCommand("spring-boot-dashboard.localapp.run", app);
        while (app.state !== AppState.LAUNCHING) {
            await sleep(5 * 1000 /** ms */);
        }
        assert.strictEqual(app.state, AppState.LAUNCHING, "The state of the app is launching.");
        // verify all beans
        beansProvider.showAll = true;
        await sleep(20 * 1000 /** ms */);
        let rootBeanAll = await beansProvider.getChildren();
        while (!rootBeanAll || rootBeanAll.length === 0) {
            await sleep(5 * 1000 /** ms */);
            rootBeanAll = await beansProvider.getChildren();
        }
        assert.strictEqual(rootBeanAll.length, 1, "There should be 1 project node in bean explorer.");
        const allBeans = await beansProvider.getChildren(rootBeanAll[0]);
        assert.strictEqual(allBeans?.length, 376, "There should be 376 beans in total.");
        // verify active bean name
        const allBean0 = allBeans[0] as Bean;
        assert.strictEqual(allBean0.id, "applicationAvailability", "The 1st bean should be applicationAvailability.");
        // verify clicking bean item
        await vscode.commands.executeCommand("spring.dashboard.bean.open", allBean0);
        await sleep(5 * 1000 /** ms */);
        let openedEditor = vscode.window.activeTextEditor;
        assert.ok(openedEditor?.document.fileName.endsWith("ApplicationAvailabilityBean.class"), "ApplicationAvailabilityBean.class are opened.");

        // verify all maps
        mappingsProvider.showAll = true;
        await sleep(20 * 1000 /** ms */);
        let rootMap = await mappingsProvider.getChildren();
        while (!rootMap || rootMap.length === 0) {
            await sleep(5 * 1000 /** ms */);
            rootMap = await mappingsProvider.getChildren();
        }
        assert.strictEqual(rootMap.length, 1, "There should be 1 project node in mapping explorer.");
        // verify maps list
        const allMaps = await mappingsProvider.getChildren(rootMap[0]);
        assert.strictEqual(allMaps?.length, 45, "There should be 45 mappings in total.");
        // verify map name
        const allMap2 = allMaps[2] as Endpoint;
        assert.strictEqual(allMap2.label, "/actuator [GET]", "The 3rd mapping should be /actuator [GET].");
        assert.strictEqual(allMap2.handler, "Actuator root web endpoint", "The 3rd mapping's handler should be 'Actuator root web endpoint'.");
        // verify clicking map item
        await vscode.commands.executeCommand("spring.dashboard.endpoint.open", allMap2);
        await sleep(5 * 1000 /** ms */);
        openedEditor = vscode.window.activeTextEditor;
        // open in simple browser
        assert.ok(!openedEditor, "Should open a simple browser.");
    }).timeout(120 * 1000 /** ms */);
});
