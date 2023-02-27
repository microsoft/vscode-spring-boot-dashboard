import { ExtensionContext } from "vscode";
import { AppDataProvider } from "./views/apps";
import { BeansDataProvider } from "./views/beans";

export namespace dashboard {
    export let context: ExtensionContext;
    export let appsProvider: AppDataProvider;
    export let beansProvider: BeansDataProvider;
}