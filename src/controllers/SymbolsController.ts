// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { getBeans, getMappings, init } from "../models/symbols";
import { appsProvider } from "../views/apps";
import { beansProvider } from "../views/beans";
import { mappingsProvider } from "../views/mappings";

export async function initSymbols() {
    await init();
    appsProvider.manager.getAppList().forEach(app => {
        mappingsProvider.updateStaticData(app, getMappings(app.path));
        beansProvider.updateStaticData(app, getBeans(app.path));
    });
}
