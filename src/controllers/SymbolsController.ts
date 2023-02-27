// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { dashboard } from "../global";
import { getBeans, getMappings, init } from "../models/symbols";
import { beansProvider } from "../views/beans";
import { mappingsProvider } from "../views/mappings";

export async function initSymbols(maxTimeout?: number, refresh?:boolean) {
    await init(maxTimeout);
    dashboard.appsProvider.manager.getAppList().forEach(app => {
        if (refresh) {
            mappingsProvider.refreshStatic(app, getMappings(app.path));
            beansProvider.refreshStatic(app, getBeans(app.path));
        } else {
            mappingsProvider.updateStaticData(app, getMappings(app.path));
            beansProvider.updateStaticData(app, getBeans(app.path));
        }
    });
}
