// Polyfills `process.env.X` access for code ported from the Next.js/Node codebase
// without touching every file. Must be the FIRST import in index.ts (before any
// other module is evaluated) since several files read process.env at module
// top-level (e.g. singleton service constructors run at import time).
//
// This file must have NO other imports so it executes immediately.
declare global {
  // eslint-disable-next-line no-var
  var process: { env: Record<string, string | undefined> };
}

// @ts-ignore - Deno doesn't have `process` by default in the edge runtime
globalThis.process = {
  env: new Proxy({} as Record<string, string | undefined>, {
    get(_target, key: string) {
      return Deno.env.get(key);
    },
    has(_target, key: string) {
      return Deno.env.get(key) !== undefined;
    },
  }),
};

export {};
