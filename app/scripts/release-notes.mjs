import { readFileSync, writeFileSync } from "node:fs";
const { version } = JSON.parse(readFileSync("app/package.json", "utf8"));
const template = readFileSync(".github/release-notes.md", "utf8");
writeFileSync(
  "release-assets/RELEASE_NOTES.md",
  template.replaceAll("__VERSION__", version),
);
