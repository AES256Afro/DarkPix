import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const scannedDirectories = [".github", "deploy", "scripts", "public", "src", "tests"];
const scannedFiles = ["README.md", "MILESTONES.md", "DEPLOY_BIGBOX.md", "package.json", "Dockerfile", "compose.yml", ".env", "index.html"];
const forbiddenCharacter = String.fromCodePoint(0x2014);

async function filesBelow(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const paths = [...scannedFiles];
for (const directory of scannedDirectories) paths.push(...await filesBelow(directory));

let failed = false;
for (const path of paths) {
  const contents = await readFile(path, "utf8");
  const lines = contents.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index]?.includes(forbiddenCharacter)) continue;
    console.error(`${path}:${index + 1}: prohibited U+2014 character`);
    failed = true;
  }
}

if (failed) process.exitCode = 1;
else console.log(`PASS copy style: ${paths.length} files contain no U+2014 characters`);
