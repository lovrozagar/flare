# Changelog

## 0.3.1

- The server (Worker) build emits source maps. `@cloudflare/vite-plugin` then sets `upload_source_maps`, so Cloudflare remaps minified stack traces in Workers Logs and `wrangler tail` to the original files and lines. The client build stays without maps, so no source ships as a static asset.

## 0.3.0

- `cn` resolves Tailwind conflicts. The last utility in a group wins.
- A static `class="px-2 px-4"` compiles to `px-4`. Dynamic class lists keep a runtime `cn` call.
- Runtime `cn` is tree-shaken unless a dynamic class list exists.
- Non-Tailwind tokens are not deduped. Hashed atomics and `group` / `peer` markers stay.
