export default [
  {
    ignores: ["node_modules/**", "coverage/**"],
  },
  {
    languageOptions: {
      sourceType: "module",
      ecmaVersion: "latest",
      globals: {
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        URL: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-console": "off",
    },
  },
];
