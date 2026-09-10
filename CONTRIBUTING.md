# Contributing

This guide covers building and debugging Spring Boot Dashboard locally. See the
[README contributing section](README.md#contributing) for the Contributor License
Agreement and Code of Conduct.

## Prerequisites

- Git, including submodule support.
- A supported Node.js LTS release, version 22 or newer, with npm. The locked
  `@vscode/test-electron` dependency requires Node.js 22 or newer.
- A current stable version of Visual Studio Code compatible with the dependent
  extensions below. The dashboard's own minimum VS Code version is not sufficient
  to determine the requirements of those extensions.
- A working JDK, with `JAVA_HOME` pointing to the JDK installation and `java` and
  `javac` available on `PATH`, **before running `npm install`**. JDK 21 is a
  practical choice; the pinned PetClinic sample requires Java 17 or newer.

The application's JDK and the language-server runtime are separate. Current
Language Support for Java releases require Java 21 or newer to run the language
server, or use their bundled runtime on supported platforms. Follow the installed
[Java extension's JDK setup guidance](https://github.com/redhat-developer/vscode-java#setting-the-jdk)
and Spring Boot Tools' runtime requirements. Configure a different application JDK
through `java.configuration.runtimes` in your VS Code user settings if needed.

Install and enable these extensions in the VS Code profile used for development:

| Extension | Identifier |
| --- | --- |
| [Language Support for Java by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.java) | `redhat.java` |
| [Debugger for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-debug) | `vscjava.vscode-java-debug` |
| [Spring Boot Tools](https://marketplace.visualstudio.com/items?itemName=vmware.vscode-spring-boot) | `vmware.vscode-spring-boot` |

## Get the source and dependencies

Clone this repository (or your fork) with its sample-project submodules:

```sh
git clone --recurse-submodules https://github.com/microsoft/vscode-spring-boot-dashboard.git
cd vscode-spring-boot-dashboard
```

For an existing clone, run `git submodule update --init --recursive` from the
repository root. Then install dependencies:

```sh
npm install
```

Installation automatically runs the `prepublish` script. It builds the Java helper
with the Maven wrapper in `java-extension` and copies the resulting JAR to
`lib/java-extension.jar`; a separate initial Java build or global Maven installation
is not needed. Allow network access for npm, Maven and their dependencies.

## Run and debug the extension

1. Open the cloned **extension repository** in VS Code.
2. In Run and Debug, select **Extension<Spring-PetClinic>** and press **F5**.
   Its `npm: webpack-dev` pre-launch task watches and bundles the extension into
   `dist`; the new Extension Development Host opens the PetClinic submodule.
3. In the development host, complete any project-import prompts. Choose Maven if
   asked which build tool to use for PetClinic, and wait for Java project import
   and Spring Boot Tools startup before using the dashboard.
4. Set breakpoints in the extension's TypeScript source in the original window,
   then exercise dashboard actions in the development host. Restart the debug
   session to load changes after webpack rebuilds.

### Use your own Spring Boot project

Copy **Extension<Spring-PetClinic>** in [.vscode/launch.json](.vscode/launch.json),
give the copy a distinct name, and replace only its first `args` entry with your
project's absolute path. For example, on Windows:

```json
"args": [
    "C:\\dev\\my-spring-app",
    "--extensionDevelopmentPath=${workspaceFolder}"
]
```

On macOS or Linux, use the project's absolute path in the same entry. Keep
`--extensionDevelopmentPath`, the `dist` source-map paths and `npm: webpack-dev`
from the PetClinic configuration. The other checked-in configurations use `out`
and `npm: watch`, so they are not interchangeable with this bundled workflow.
Keep machine-specific paths and launch changes out of commits.

## Development commands

Run these from the repository root after installing dependencies:

| Command | Purpose |
| --- | --- |
| `npm run compile` | Compile TypeScript, including tests, into `out`. |
| `npm run webpack` | Build the development bundle in `dist`. |
| `npm run webpack-dev` | Rebuild that bundle on changes; also started by the PetClinic F5 configuration. |
| `npm run vscode:prepublish` | Build the production bundle used for packaging. |
| `npm run tslint` | Run ESLint (the script retains its legacy name). |
| `npm run prepublish` | Rebuild and copy the Java helper after changing `java-extension`. |

### Integration tests

```sh
npm test
```

This compiles the TypeScript and runs [the VS Code integration-test runner](test/runTest.ts),
which downloads VS Code, installs the dependent extensions, initializes the
PetClinic submodule and launches an Extension Development Host. Network access
and a graphical display are required; headless Linux needs Xvfb or an equivalent
display setup (see [Linux CI](.github/workflows/linux.yml)).

**Restore the entry point after testing, even if tests fail.** The `pretest`
script changes `package.json`'s `main` to `./out/src/extension` and does not reset
it. Before returning to the PetClinic F5 workflow or packaging, restore just that
field:

```sh
npm pkg set main="./dist/extension"
```

Otherwise, webpack rebuilds `dist` while VS Code still loads the old `out` entry
point. Do not commit this test-induced change or discard unrelated edits to
`package.json`. Review `git diff` and `git status` before submitting your PR,
including any local settings generated inside the sample submodules.
