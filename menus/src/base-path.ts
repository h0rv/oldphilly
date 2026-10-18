export function basePath(value: string | undefined): string {
  const path = value ?? "/";
  if (!/^\/(?:[A-Za-z0-9_-]+\/?)*$/u.test(path))
    throw new Error("ASTRO_BASE_PATH must be a site path such as / or /repository/");
  return path.endsWith("/") ? path : `${path}/`;
}
