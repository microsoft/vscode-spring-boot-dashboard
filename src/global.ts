import { ExtensionContext } from "vscode";
import { AppDataProvider } from "./views/apps";
import { BeansDataProvider } from "./views/beans";
import { MappingsDataProvider } from "./views/mappings";

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace dashboard {
    export let context: ExtensionContext;
    export let appsProvider: AppDataProvider;
    export let beansProvider: BeansDataProvider;
    export let mappingsProvider: MappingsDataProvider;
}
