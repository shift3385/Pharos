/* ESLint config (eslintrc format). Code and comments must be in English (spec §15). */
module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: "18.3" } },
  plugins: ["@typescript-eslint", "react-hooks", "react-refresh"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
    "prettier",
  ],
  ignorePatterns: [
    "dist",
    "node_modules",
    "src-tauri",
    "coverage",
    ".eslintrc.cjs",
  ],
  rules: {
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true },
    ],
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    // Enforce modular boundaries: a module must not deep-import another
    // module's internals. Cross-module use goes through the public barrel
    // (@modules/<name>) only. (spec §2)
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@modules/*/*"],
            message:
              "Import a module only through its public API (@modules/<name>), never its internals (spec §2).",
          },
        ],
      },
    ],
  },
};
