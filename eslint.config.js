// Lint rules. The browser scripts share globals across files (like <script>
// tags do), so undefined-name checks are left to TypeScript (npm run typecheck).
const js = require("@eslint/js");

module.exports = [
   { ignores: ["node_modules/", "cache/", "logs/", "data/"] },
   js.configs.recommended,
   {
      files: ["**/*.js"],
      languageOptions: {
         ecmaVersion: 2022,
         sourceType: "script",
      },
      rules: {
         "no-undef": "off",
         "no-unused-vars": ["error", { vars: "local", args: "none", caughtErrors: "none" }],
         "no-empty": ["error", { allowEmptyCatch: true }],
         "eqeqeq": "off", // the course style uses == throughout
      },
   },
];
