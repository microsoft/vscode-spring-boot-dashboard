import { ExtensionContext } from "vscode";
import { AppDataProvider } from "./views/apps";
import { BeansDataProvider } from "./views/beans";
import { MappingsDataProvider } from "./views/mappings";

export namespace dashboard {
    export let context: ExtensionContext;
    export let appsProvider: AppDataProvider;
    export let beansProvider: BeansDataProvider;
    export let mappingsProvider: MappingsDataProvider;
}