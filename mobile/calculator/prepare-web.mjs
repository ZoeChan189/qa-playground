import { cp, mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const output = path.join(here, "www");
await mkdir(output, { recursive: true });
await cp(path.join(root, "public/calculator"), output, { recursive: true });
await mkdir(path.join(output, "vendor"), { recursive: true });
await mkdir(path.join(output, "icons"), { recursive: true });
await copyFile(path.join(root, "node_modules/mathjs/lib/browser/math.js"), path.join(output, "vendor/math.js"));
await copyFile(path.join(root, "node_modules/mathjs/LICENSE"), path.join(output, "vendor/mathjs-LICENSE.txt"));
for (const name of ["delete", "eraser", "play"]) await copyFile(path.join(root, `node_modules/lucide-static/icons/${name}.svg`), path.join(output, `icons/${name}.svg`));
const assets = {};
for (const name of ["index.html", "app.js", "styles.css", "engine.js", "vendor/math.js"]) assets[name] = createHash("sha256").update(await readFile(path.join(output, name))).digest("hex");
await writeFile(path.join(output, "asset-hashes.json"), JSON.stringify(assets, null, 2));
console.log("Prepared offline assets from the same calculator files served by QA Lab.");
