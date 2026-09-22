// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { dashboard } from "../global";
import { getBeansOfApp, getMappingsOfApp, init } from "../models/symbols";

export async function initSymbols(maxTimeout?: number, refresh?:boolean) {
    await init(maxTimeout);
    dashboard.appsProvider.manager.getAppList().forEach(app => {
        if (refresh) {
            dashboard.mappingsProvider.refreshStatic(app, getMappingsOfApp(app));
            dashboard.beansProvider.refreshStatic(app, getBeansOfApp(app));
        } else {
            dashboard.mappingsProvider.updateStaticData(app, getMappingsOfApp(app));
            dashboard.beansProvider.updateStaticData(app, getBeansOfApp(app));
        }
    });
}
