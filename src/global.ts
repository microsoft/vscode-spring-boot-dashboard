import { ExtensionContext } from "vscode";
import { AppDataProvider } from "./views/apps";

export namespace dashboard {
    export let context: ExtensionContext;
    export let appsProvider: AppDataProvider;
}