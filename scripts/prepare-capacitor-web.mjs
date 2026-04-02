import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const webDir = path.join(rootDir, "web-build");

const filesToCopy = [
  "index.html",
  "styles.css",
  "app.js",
  "data.js",
  "manifest.webmanifest",
  "sw.js"
];

const dirsToCopy = ["assets"];

async function main() {
  await rm(webDir, { recursive: true, force: true });
  await mkdir(webDir, { recursive: true });

  for (const file of filesToCopy) {
    await cp(path.join(rootDir, file), path.join(webDir, file));
  }

  for (const dir of dirsToCopy) {
    await cp(path.join(rootDir, dir), path.join(webDir, dir), { recursive: true });
  }

  const entries = await readdir(webDir);
  console.log(`Prepared Capacitor web bundle in ${webDir}`);
  console.log(entries.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
