# Spring Boot Dashboard for VS Code
[![Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/vscjava.vscode-spring-boot-dashboard.svg)](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-spring-boot-dashboard)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/vscjava.vscode-spring-boot-dashboard.svg)](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-spring-boot-dashboard)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/vscjava.vscode-spring-boot-dashboard.svg)](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-spring-boot-dashboard)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/Microsoft/vscode-spring-boot-dashboard/blob/main/LICENSE)

Spring Boot Dashboard is a lightweight extension in Visual Studio Code (VS Code). With an explorer in the side bar, you can view and manage all available Spring Boot projects in your workspace. It also supports the features to quickly start, stop or debug a Spring Boot project. For more advanced Spring support in VS Code, please check the [Spring Boot Extension Pack](https://marketplace.visualstudio.com/items?itemName=vmware.vscode-boot-dev-pack).

![Screenshot](images/boot-dashboard-vsc.gif)

## Feature List

* View Spring Boot apps in workspace
* Start / Stop a Spring Boot app
* Debug a Spring Boot app
* Open a Spring Boot app in browser
* List beans/endpoint mappings
* View bean dependencies

## Prerequisites
- JDK (version 1.8.0 or later)
- VS Code (version 1.19.0 or later)

## How to install

Open VS Code and press `F1` or `Ctrl + Shift + P` to open command palette, select **Install Extension** and type `vscode-spring-boot-dashboard`.

Or launch VS Code Quick Open (`Ctrl + P`), paste the following command, and press enter.
```bash
ext install vscode-spring-boot-dashboard
```
> Note: this extension has a dependency on VS Code extensions of [Debugger for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-debug) and [Spring Boot Tools](https://marketplace.visualstudio.com/items?itemName=vmware.vscode-spring-boot).

## How to get started

- Launch VS Code
- Expand the Spring Boot Dashboard explorer in the side bar
- View all available Spring Boot apps in current workspace
- Right click on a certain app and choose to start, stop or debug it
- Right click on a certain app and open the website in a browser

## Data/Telemetry
VS Code collects usage data and sends it to Microsoft to help improve our products and services. Read our [privacy statement](http://go.microsoft.com/fwlink/?LinkId=521839) to learn more. If you don’t wish to send usage data to Microsoft, you can set the `telemetry.enableTelemetry` setting to `false`. Learn more in our [FAQ](https://code.visualstudio.com/docs/supporting/faq#_how-to-disable-telemetry-reporting).

## Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.microsoft.com.

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Instructions to develop locally

## Setup

1. Clone this repository and open it in VS Code.
2. Install dependencies:

```bash
npm install
```

3. Ensure the following extensions are installed in VS Code (required by this extension):
   - [Language Support for Java](https://marketplace.visualstudio.com/items?itemName=redhat.java)
   - [Debugger for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-debug)
   - [Spring Boot Tools](https://marketplace.visualstudio.com/items?itemName=vmware.vscode-spring-boot)

4. Initialize the Git submodules (sample Spring Boot projects used for local debugging and tests):

```bash
git submodule update --init --recursive
```

This clones and checks out:

- `test/projects/spring-petclinic` → https://github.com/spring-projects/spring-petclinic
- `test/projects/gs-rest-service` → https://github.com/spring-guides/gs-rest-service

When cloning this repository for the first time, you can fetch the submodules in one step:

```bash
git clone --recurse-submodules https://github.com/Microsoft/vscode-spring-boot-dashboard.git
```

If you already cloned without submodules, run `git submodule update --init --recursive` from the repository root. A leading `-` in `git submodule status` means a submodule is not initialized yet.

## Choose a sample project to load

By default, the **Extension\<Spring-PetClinic\>** launch configuration opens the bundled sample at `test/projects/spring-petclinic`.

To debug against your own Spring Boot project instead:

1. Open `.vscode/launch.json`.
2. Find the launch configuration you want to use (for example, **Extension\<Spring-PetClinic\>**).
3. In its `args` array, replace the first path (the workspace folder opened in the Extension Development Host) with the absolute path to your project:

```json
"args": [
    "/absolute/path/to/your-spring-boot-project",
    "--extensionDevelopmentPath=${workspaceFolder}"
]
```

## Debug the extension

1. Open this repository in VS Code.
2. Open the **Run and Debug** view (or press `Ctrl+Shift+D` / `Cmd+Shift+D` on macOS).
3. Select a launch configuration from the dropdown (for example, **Extension\<Spring-PetClinic\>**).
4. Start debugging using one of these methods:
   - Press `F5`
   - Choose **Run → Start Debugging**
   - Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **Debug: Start Debugging**
5. A new **Extension Development Host** window opens with this extension loaded and your chosen project as the workspace.
6. Wait for the Java language server to finish starting, then open the **Spring Boot Dashboard** icon in the activity bar to exercise the extension.

## Build and run tests from the command line

```bash
npm run compile   # TypeScript compile to out/
npm run webpack   # Webpack build to dist/
npm test          # Compile and run the extension test suite
```

