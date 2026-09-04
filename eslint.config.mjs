import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: [
            ".vscode-test/**",
            "test/**",
            "out/**",
            "node_modules/**",
            "scripts/**",
            "webpack.config.js",
            "dist/**",
            "resources/**",
        ],
    },
    ...tseslint.configs.recommended,
    {
        rules: {
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-require-imports": ["error", { allowAsImport: true }],
            "@typescript-eslint/no-unused-vars": "warn",
        },
    },
);
