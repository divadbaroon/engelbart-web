import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Staged hc source for the E2B template build; not our code.
  // The recorder beside it is @rrweb/record's published build, vendored
  // verbatim and pinned, for the same reason: linting it says nothing
  // about anything anybody here can change.
  { ignores: ["sandbox/.hc/**", "sandbox/trace/rrweb-record.js"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // A Node preload has to be CommonJS: --require cannot load an ES
  // module, and running before the application's first line is the
  // whole mechanism. require() is not a style choice there.
  { files: ["**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
];

export default eslintConfig;
