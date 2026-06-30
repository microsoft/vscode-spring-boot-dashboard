
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
    try {

        const vscodeExecutablePath = await downloadAndUnzipVSCode();

        /**
         * Install dependency extensions
         */
        const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

        cp.spawnSync(cli, [...args, '--install-extension', 'redhat.java'], {
            encoding: 'utf-8',
            stdio: 'inherit',
            shell: process.platform === 'win32'
        });

        cp.spawnSync(cli, [...args, '--install-extension', 'vmware.vscode-spring-boot'], {
            encoding: 'utf-8',
            stdio: 'inherit',
            shell: process.platform === 'win32'
        });

        cp.spawnSync(cli, [...args, '--install-extension', 'vscjava.vscode-java-debug'], {
            encoding: 'utf-8',
            stdio: 'inherit',
            shell: process.platform === 'win32'
        });

        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath: string = path.resolve(__dirname, "../../");

        // clone spring-petclinic
        const vscodeTestPath = path.resolve(extensionDevelopmentPath, 'test/projects');
        const repositoryPath = path.resolve(vscodeTestPath, "spring-petclinic");

        cp.execSync('git submodule update --init --recursive', {
            stdio: [0, 1, 2],
            cwd: repositoryPath,
        });

        // Disable Gradle importer so JDTLS auto-selects Maven without prompting
        // (petclinic has both pom.xml and build.gradle)
        const vscodeDir = path.resolve(repositoryPath, ".vscode");
        if (!fs.existsSync(vscodeDir)) {
            fs.mkdirSync(vscodeDir, { recursive: true });
        }
        fs.writeFileSync(
            path.resolve(vscodeDir, "settings.json"),
            JSON.stringify({ "java.import.gradle.enabled": false }, null, 4),
            "utf-8"
        );

        // The path to the extension test script
        // Passed to --extensionTestsPath
        const extensionTestsPath: string = path.resolve(__dirname, "./suite/index");

        // VS Code creates its IPC handle as a Unix-domain socket *inside* the
        // user-data-dir (e.g. `<user-data-dir>/<version>-main.sock`). On macOS the
        // socket path is capped at ~103 bytes (`sun_path`), so if the user-data-dir
        // is derived from a long path the socket overflows and the launch fails with
        // `listen EINVAL: invalid argument`. The default user-data-dir lives under
        // the workspace (`.vscode-test/user-data`), whose length depends on where the
        // repository happens to be checked out — arbitrarily long on CI.
        //
        // Root-cause fix (POSIX only): relocate the user-data-dir to a short base
        // that is independent of the checkout path so the socket path can never
        // approach the platform limit. On Windows there is no Unix-domain socket
        // limit, so we keep the default location — this preserves the CI log-upload
        // path (`.vscode-test/user-data/.../redhat.java/jdt_ws/.metadata/.log`).
        const launchArgs: string[] = [repositoryPath];
        if (process.platform !== "win32") {
            launchArgs.push("--user-data-dir", createShortUserDataDir());
        }

        // Download VS Code, unzip it and run the integration test
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs
        });

        process.exit(0);

    } catch (err) {
        process.stdout.write(`${err}${os.EOL}`);
        process.exit(1);
    }
}

/**
 * Create a fresh user-data directory whose path is short enough that VS Code's
 * IPC socket (`<user-data-dir>/<version>-main.sock`) stays within the platform's
 * Unix-domain socket path limit. POSIX only — callers skip this on Windows.
 *
 * macOS limits `sun_path` to 104 bytes (≈103 usable chars) and Linux to 108. The
 * socket name VS Code appends is short (e.g. `1.12-main.sock`), so we only need a
 * compact base directory that does NOT depend on the (potentially long) checkout
 * path. We try the shortest base first (`/tmp`) and fall back to the OS temp dir,
 * then validate the resulting socket path fits.
 */
function createShortUserDataDir(): string {
    // Conservative budget for the socket path.
    //
    // macOS `struct sockaddr_un` declares `sun_path[104]`, so the kernel (and
    // Node/libuv/Electron, which create VS Code's IPC socket) accept paths up to
    // 103 bytes + 1 NUL. OpenJDK is stricter, effectively allowing only 102
    // (`sizeof(sun_path) - 2`) — see redhat-developer/vscode-java#4433. We use the
    // tightest real-world value (102) so the budget holds for any consumer.
    // Linux is roomier (`sun_path[108]`), so macOS is the binding constraint.
    const SOCKET_PATH_LIMIT = 102;
    // Generous headroom for the `<version>-main.sock` suffix VS Code appends.
    const SOCKET_NAME_RESERVE = 30;

    // `/tmp` is the shortest path typically writable on POSIX; fall back to the OS
    // temp dir. Try creating the dir in each base rather than probing with
    // `existsSync` — a base may exist but be non-writable, in which case we must
    // move on to the next candidate.
    const candidateBases: string[] = ["/tmp", os.tmpdir()];
    let userDataDir: string | undefined;
    const failures: string[] = [];
    for (const base of candidateBases) {
        try {
            userDataDir = fs.mkdtempSync(path.join(base, "vsct-"));
            break;
        } catch (e) {
            failures.push(`${base}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    if (userDataDir === undefined) {
        throw new Error(
            `Could not create a temporary user-data-dir in any of ` +
            `[${candidateBases.join(", ")}]: ${failures.join("; ")}`
        );
    }

    // Guard: `sun_path` is a BYTE limit, so measure bytes (not JS char count) to
    // stay correct for non-ASCII temp paths. Fail fast with an actionable message
    // instead of the opaque `listen EINVAL`.
    const byteLength = Buffer.byteLength(userDataDir);
    if (byteLength + SOCKET_NAME_RESERVE > SOCKET_PATH_LIMIT) {
        throw new Error(
            `Resolved user-data-dir is too long for a Unix-domain socket: ` +
            `"${userDataDir}" (${byteLength} bytes). The IPC socket would ` +
            `exceed the ${SOCKET_PATH_LIMIT}-byte platform limit. Set TMPDIR to a ` +
            `shorter path and re-run.`
        );
    }

    return userDataDir;
}

main();
