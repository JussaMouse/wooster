// eslint.config.js
import eslintJs from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslintJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Optional: custom rules or overrides can go here
    // For example, to ignore specific files or directories:
    ignores: ["dist/**", "node_modules/**", "*.log"],
  },
  {
    // Ensure TS files are linted
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // Add any specific rule overrides here if needed
      // e.g., "@typescript-eslint/no-explicit-any": "warn"
    }
  }
); 