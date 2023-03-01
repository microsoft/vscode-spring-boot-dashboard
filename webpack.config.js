/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const path = require('path');
const CopyPlugin = require("copy-webpack-plugin");

/**@type {import('webpack').Configuration}*/
const config = {
    target: 'node', // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/

    entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
    output: { // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: "commonjs2",
        devtoolModuleFilenameTemplate: "../[resource-path]",
    },
    devtool: 'source-map',
    externals: {
        vscode: "commonjs vscode",
        'applicationinsights-native-metrics': 'commonjs applicationinsights-native-metrics',
        'diagnostic-channel-publishers': 'commonjs diagnostic-channel-publishers',
    },
    resolve: { // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [{
            test: /\.ts$/,
            exclude: /node_modules/,
            use: [{
                loader: 'ts-loader',
                options: {
                    compilerOptions: {
                        "module": "commonjs" // override `tsconfig.json` so that TypeScript emits native JavaScript modules.
                    }
                }
            }]
        }]
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                {from: "node_modules/@vscode/webview-ui-toolkit/dist/toolkit.js", to:"./memoryViewAssets/@vscode/webview-ui-toolkit/dist/toolkit.js"},
                {from: "node_modules/chart.js/dist/chart.min.js", to: "./memoryViewAssets/chart.js/dist/chart.min.js"},
                {from: "node_modules/chartjs/chart.js", to: "./memoryViewAssets/chartjs/chart.js"},
                {from: "node_modules/chartjs-adapter-moment/dist/chartjs-adapter-moment.min.js", to: "./memoryViewAssets/chartjs-adapter-moment/dist/chartjs-adapter-moment.min.js"},
                {from: "node_modules/chartjs-adapter-moment/dist/chartjs-adapter-moment.js", to: "./memoryViewAssets/chartjs-adapter-moment/dist/chartjs-adapter-moment.js"},
                {from: "node_modules/moment/moment.js", to: "./memoryViewAssets/moment/moment.js"},
            ]
        }),
    ]
}

module.exports = config;
