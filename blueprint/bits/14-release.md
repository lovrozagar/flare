# Bit 14 — Packaging and release

Creates every `P14` row. Chooses the packager by running the contract below, then adds that packager's config file to `files.tsv` in the same commit. The candidates are `tsdown` and plain `tsc` (B18). The framework sources hold no JSX, so no JSX transform is a candidate's concern.

## Packager spike

Both candidates are run against the contract. The one that passes is the packager. If both pass, `tsdown` is used. If neither passes, this bit stops and a new decision names the next candidate. The spike is not a third way of shipping.

The contract, asserted by `packages/core/tests/structure/exports.test.ts` and `api.test.ts`:

| test | case | result |
| --- | --- | --- |
| `subpath resolves` | every key in `03-surface.md` except the `./fonts/*` pattern | `types` and `default` resolve to files inside the tarball |
| `font subpath` | a real key of `registry.json`, imported as `@lovrozagar/flare/fonts/<id>` | the default export resolves to that generated module. The module does not import another family |
| `font barrel` | `@lovrozagar/flare/fonts` | does not resolve |
| `no solid condition` | every entry | no `solid` and no `browser` key, except `./server-fn`'s conditional exports |
| `compiled default` | every entry | `default` resolves to compiled ESM with no TypeScript syntax, and the root entry renders in both a DOM and a server Solid build from that one file |
| `no src path in dts` | every `.d.ts` | the text contains no `virtual:` and no `packages/core/src` |
| `snapshot` | each entry's public `.d.ts` | matches the committed snapshot. A change is a commit of its own |
| `tarball contents` | `npm pack` | exactly `dist`, `src`, `README.md`, `LICENSE`, `package.json` |
| `consumer strict` | a fixture with `exactOptionalPropertyTypes` and `verbatimModuleSyntax` | `tsc` exits 0 against the packed types |
| `no dependencies` | the packed `package.json` | the `dependencies` key is absent |
| `image module types` | the packed `dist` | `features/image/vite/modules.d.ts` sits where the emitted `exports/vite.d.ts` reference resolves, and the consumer-strict fixture with `vite/client` types `./a.png?image` as the binding. tsc does not copy `.d.ts` inputs, so the packager must |
| `peer floors` | the same manifest | each peer in the B79 table is `>=` its devDependency version. `optional` is true only for `sharp`, `@tanstack/solid-query`, `negotiator`, `isbot`, and `@formatjs/intl-localematcher` |
| `not a peer` | the same manifest | `@babel/parser`, `tailwindcss`, `oxc-resolver`, `node-html-markdown`, `@tanstack/query-broadcast-client-experimental`, and `@types/negotiator` are absent from both peer and dependency keys |

## `scripts/release.test.ts`

| test | case | result |
| --- | --- | --- |
| `fixtures dropped` | a src `x.fixture.ts` and `y.fixture.txt` beside `x.ts` | the staged package holds `x.ts` and neither fixture: test-only files never ship |
| `refuses dirty` | a dirty tree | non-zero |
| `refuses red` | the command is invoked with a flag that points at a failing test fixture | non-zero, nothing published |
| `tag` | a clean green tree | the gates run, the golden test runs on the packed tarball, and that tarball, whose version equals the git tag, goes to `npm publish --dry-run`. `@lovrozagar/flare-fonts` is not published. A tag that is not the manifest's version is refused before anything is packed |
| `publish outside actions` | `--publish` locally, or in GitHub Actions on a branch ref | non-zero, naming the rule. Nothing reaches npm |
| `publish wrong tag` | `--publish` in GitHub Actions on another version's tag, with no `--tarball`, or with a tarball not named `lovrozagar-flare-<version>.tgz` | non-zero, and nothing reaches npm. On `refs/tags/v<version>` with that tarball it runs `npm publish <tgz> --access public --provenance` |

## `tests/e2e/golden.test.ts`

Install from the packed tarball, not from the workspace.

| test | case | result |
| --- | --- | --- |
| `node` | install the packed tarball, then `codegen`, `dev`, `build`, and `createNodeListener` on `apps/minimal` | `/` is 200. `POST /_flare/fn/<id>` of `src/fns/echo.ts` export `echo` returns the envelope whose `data` equals the JSON input. The id is the B41 hash. A data URL returns NDJSON |
| `bun` | the same build, served with `createBunFetch` | the same three requests |
| `workers` | the same build under miniflare | the same three requests |
| `dev from tarball` | the installed tarball under `vite dev`, in Chromium | `/` hydrates with no console error or hydration warning. The response carries the dev policy (`worker-src` with `blob:`) and the `csp-nonce` meta, and `<Stylesheet />` renders nothing, so the packed code's `import.meta.env?.DEV` was replaced on the server and the client alike |

## Font file emit

`emitFonts` (bit 13, `features/fonts/vite/emit.ts`) is composed into `flare()` here, once the generated modules exist. `flare({ fonts: { dir } })` names the directory that holds `<family>/<file>.woff2`. The plugin collects the `features/fonts/shared/generated/<id>.ts` modules the client bundle contains and, in `generateBundle`, emits only those families' files at their registry url. Without `fonts`, it emits nothing and the app serves `/fonts/...` itself (`public/fonts` works). `dx/plugin.md` gains the `fonts` row.

### `vite/plugin/fonts.test.ts`

| test | case | result |
| --- | --- | --- |
| `dev serve` | a dev server with `fonts: { dir }`, GET and HEAD of `/fonts/inter/latin.woff2` | 200, the file's bytes, `content-type: font/woff2`, `cache-control: no-cache`; HEAD has no body (BUGS.md B7) |
| `dev fallthrough` | a registry url whose file `dir` lacks, `/fonts/not-a-family/x.woff2`, `/fonts/inter/../secret.woff2`, and a non-woff2 url | each reaches `next()` unanswered |
| `fonts emit` | a real client run of an app that imports one registry family, with `fonts.dir` holding two families | the output holds that family's woff2 at its url and not the other family's |
| `fonts absent` | the same app without `fonts` | no woff2 is emitted and the run succeeds |
| `fonts dir missing file` | `fonts.dir` lacks a file the used family lists | the run fails and names the file |

## `features/fonts/generate.test.ts`

| test | case | result |
| --- | --- | --- |
| `fixture` | a registry of two families | exactly two modules, each a default export of that family's metadata, and no `index.ts` |
| `real registry` | `registry.json` | the generated directory's filenames equal the registry keys |
| `hyphen` | id `open-sans` | the file is `open-sans.ts` |
| `escape` | a family name containing `</style>` | the generated module's CSS helper receives the escaped name |
| `root clean` | `features/fonts/shared/index.ts` | it does not import `generated/` |

`registry.json` is the metadata moved from `_v0`'s font registry: id, weights, styles, unicode ranges, file urls, and fallback metrics. The move is a data copy checked by `real registry`. A family that cannot be expressed in those fields is dropped and named in the commit, not given a new field. The woff2 bytes are not in this package. A module holds the url.

## Done

The golden test passes on Node, Bun, and Workers from the tarball, using `apps/minimal`. The generated modules match `registry.json`. Release publishes `@lovrozagar/flare` only (B78). `create-flare` is not part of this bit (B75).

This is 1.0. anyrow can move.
