import { cp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const built = spawnSync("npm", ["run", "build"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, ASTRO_SITE: "https://oldphilly.org", ASTRO_BASE_PATH: "/menus/" },
});
if (built.status !== 0) throw new Error("Menu build failed; the existing site was not changed");

// Only this generated subtree belongs to the menu app. Photo files/data stay in place.
const destination = new URL("../../site/menus/", import.meta.url);
await rm(destination, { recursive: true, force: true });
await cp(new URL("../dist/", import.meta.url), destination, { recursive: true });
process.stdout.write("Installed the static menu app at site/menus/.\n");
