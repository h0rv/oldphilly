import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import { scansSchema } from "../src/scans.ts";
const targets = z
  .array(z.string().regex(/^nypl-\d+$/u))
  .max(12)
  .parse(
    JSON.parse(
      await readFile(new URL("../snapshots/date-research-targets.json", import.meta.url), "utf8"),
    ),
  );
const scans = scansSchema.parse(
  JSON.parse(await readFile(new URL("../public/scans.json", import.meta.url), "utf8")),
);
const version = spawnSync("tesseract", ["--version"], { encoding: "utf8" });
if (version.status !== 0)
  throw new Error("Tesseract is required for this optional research command");
const engine = version.stdout.split("\n")[0] ?? "Unknown Tesseract version";
const directory = await mkdtemp(join(tmpdir(), "oldphilly-dates-"));
try {
  const pages = targets.flatMap((menuId) =>
    scans.pages.filter((page) => page.menuId === menuId).slice(0, 2),
  );
  await pages.reduce(async (prior, page) => {
    await prior;
    const menuId = page.menuId;
    // Only already cleared, source-hosted NYPL images; no CIA transcript/image output.
    const response = await fetch(page.fullUrl, { signal: AbortSignal.timeout(30000) });
    if (!response.ok)
      throw new Error(
        `Source request denied or unavailable: ${page.fullUrl}, HTTP ${String(response.status)}. Stop; no retry.`,
      );
    const bytes = Buffer.from(await response.arrayBuffer());
    const path = join(directory, `${page.imageId}.image`);
    await writeFile(path, bytes);
    const result = spawnSync("tesseract", [path, "stdout", "-l", "eng", "--psm", "11"], {
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 2_000_000,
    });
    if (result.status !== 0) throw new Error(`OCR failed for ${menuId}/${page.pageId}`);
    const lines = result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    const contexts = lines.flatMap((line, index) =>
      /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|(?:18|19|20)\d{2})\b/iu.test(
        line,
      )
        ? [
            {
              line: index + 1,
              context: lines.slice(Math.max(0, index - 2), index + 3).join(" | "),
            },
          ]
        : [],
    );
    process.stdout.write(
      `MENU_DATE_EVIDENCE ${JSON.stringify({ menuId, pageId: page.pageId, imageId: page.imageId, sourceUrl: page.fullUrl, recordUrl: page.recordUrl, rightsEvidence: page.evidence, imageSha256: createHash("sha256").update(bytes).digest("hex"), engine, method: "machine-transcription; not visually reviewed", header: lines.slice(0, 25).join(" | "), dateContexts: contexts })}\n`,
    );
    await rm(path);
  }, Promise.resolve());
} finally {
  await rm(directory, { recursive: true, force: true });
}
