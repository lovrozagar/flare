# Vendored from shadcn-ui/cn

MIT License

Copyright (c) 2026 shadcn

https://github.com/shadcn-ui/cn

- tag: `cn@0.4.0`
- commit: `84db83298f69a229d6f1ffc5d8c8d99ef451fb49`

Copied files:

- Runtime: `engine.ts`, `tables.generated.ts`, `types.ts`
- Build-time theme compiler (used by `src/plugins/cn-theme.ts` to compile merge tables from an app's Tailwind theme): `compiler.ts`, `config.ts`, `default-config.generated.ts`, `theme-css.ts`, `validators.ts`

Local changes (marked `Flare patch` in the source):

- Relative imports carry a `.ts` extension.
- `theme-css.ts`: follows bare (package) `@import`s through an injected resolver, skipping `tailwindcss`, and ignores per-utility color namespaces (`--text-color-*`, `--background-color-*`, …) so they never land on another scale.

Not copied: `build.ts`, `vite.ts`, `next.ts`, `lite.ts`, `index.ts`.
