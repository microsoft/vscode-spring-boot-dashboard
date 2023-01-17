// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Event, Uri } from 'vscode';

export type GetClasspathsCommand = (uri: string, options: ClasspathQueryOptions) => Promise<ClasspathResult>;

export type ClasspathQueryOptions = {
	/**
	 * Determines the scope of the classpath. Valid scopes are "runtime" and "test".
	 * If the given scope is not supported, "runtime" will be used.
	 */
	scope: string;
};

export type ClasspathResult = {
	/**
	 * Uri string of the project root path.
	 */
	projectRoot: string;
	/**
	 * File path array for the classpaths.
	 */
	classpaths: string[];
	/**
	 * File path array for the modulepaths.
	 */
	modulepaths: string[];
};

export interface ExtensionAPI {
	readonly getClasspaths: GetClasspathsCommand;

	/**
	 * An event which fires on classpath update. This API is not supported in light weight server mode so far.
	 *
	 * Note:
	 *   1. This event will fire when the project's configuration file (e.g. pom.xml for Maven) get changed,
	 *      but the classpaths might still be the same as before.
	 *   2. The Uri points to the project root path.
	 */
	readonly onDidClasspathUpdate: Event<Uri>;

	/**
	 * A promise that will be resolved when the standard language server is ready.
	 * Note: The server here denotes for the standard server, not the lightweight.
	 * @since API version 0.7
	 * @since extension version 1.7.0
	 */
	readonly serverReady: () => Promise<boolean>;
}