import { ExtensionContext } from "vscode";
import { AppDataProvider } from "./views/apps";
import { BeansDataProvider } from "./views/beans";
import { MappingsDataProvider } from "./views/mappings";
import { MemoryViewProvider } from "./views/memory";
import { PropertiesProvider } from "./views/properties";

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace dashboard {
    export let context: ExtensionContext;
    export let appsProvider: AppDataProvider;
    export let beansProvider: BeansDataProvider;
    export let mappingsProvider: MappingsDataProvider;
    export let memoryViewProvider: MemoryViewProvider;
    export let propertiesProvider: PropertiesProvider;
}
