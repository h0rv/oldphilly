import { test } from "node:test";
import assert from "node:assert/strict";
import { basePath } from "../src/base-path.ts";

await test("root and GitHub project paths retain an explicit trailing slash", () => {
  assert.equal(basePath(undefined), "/");
  assert.equal(basePath("/"), "/");
  assert.equal(basePath("/pages-check"), "/pages-check/");
  assert.equal(basePath("/pages-check/"), "/pages-check/");
  assert.equal(
    new URL(`${basePath("/pages-check/")}menus.json`, "https://example.org/map/").pathname,
    "/pages-check/menus.json",
  );
});

await test("base paths reject external URLs, traversal and malformed paths", () => {
  for (const value of ["https://example.org/", "//example.org/", "../", "/../", "/repo?x=1", ""])
    assert.throws(() => basePath(value));
});
