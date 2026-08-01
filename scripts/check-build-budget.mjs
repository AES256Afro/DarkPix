import { gzipSync } from "node:zlib";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const KIB = 1024;
const budgets = {
  javascriptGzip: 185 * KIB,
  cssGzip: 12 * KIB,
  entryHtml: 5 * KIB,
};

const assetDirectory = new URL("../dist/assets/", import.meta.url);
const entryPath = new URL("../dist/index.html", import.meta.url);
const assetNames = await readdir(assetDirectory);

async function compressedTotal(extension) {
  let total = 0;
  for (const name of assetNames.filter((asset) => asset.endsWith(extension))) {
    total += gzipSync(await readFile(join(assetDirectory.pathname, name))).byteLength;
  }
  return total;
}

const observed = {
  javascriptGzip: await compressedTotal(".js"),
  cssGzip: await compressedTotal(".css"),
  entryHtml: (await readFile(entryPath)).byteLength,
};

let failed = false;
for (const [metric, limit] of Object.entries(budgets)) {
  const bytes = observed[metric];
  const status = bytes <= limit ? "PASS" : "FAIL";
  console.log(`${status} ${metric}: ${(bytes / KIB).toFixed(1)} KiB / ${(limit / KIB).toFixed(0)} KiB`);
  if (bytes > limit) failed = true;
}

if (failed) process.exitCode = 1;
