// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { dashboard } from "../global";
import { getBeans, getMappings, init } from "../models/symbols";

export async function initSymbols(maxTimeout?: number, refresh?:boolean) {
    await init(maxTimeout);
    dashboard.appsProvider.manager.getAppList().forEach(app => {
        if (refresh) {
            dashboard.mappingsProvider.refreshStatic(app, getMappings(app.path));
            dashboard.beansProvider.refreshStatic(app, getBeans(app.path));
        } else {
            dashboard.mappingsProvider.updateStaticData(app, getMappings(app.path));
            dashboard.beansProvider.updateStaticData(app, getBeans(app.path));
        }
    });
}
