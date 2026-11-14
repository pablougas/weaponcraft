/**
 * Flags read from the URL hash, e.g. `#test` or `#test&dev`.
 * `#test` exposes the `window.wc` test API in production builds;
 * `#dev` will show the dev menu (M1).
 */
export function hashFlags(hash: string = window.location.hash): Set<string> {
  return new Set(
    hash
      .replace(/^#/, '')
      .split(/[&,]/)
      .map((flag) => flag.trim().toLowerCase())
      .filter(Boolean),
  );
}
