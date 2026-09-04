import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: [
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
            "@typescript-eslint/no-require-imports": "off",
            "@typescript-eslint/no-unused-vars": "warn",
            "@typescript-eslint/no-var-requires": "error",
        },
    },
);
