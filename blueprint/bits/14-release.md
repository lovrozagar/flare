# Bit 14 — Packaging and release

Creates every `P14` row. Chooses the packager by running the contract below, then adds that packager's config file to `files.tsv` in the same commit. The candidates are `tsdown` and plain `tsc` (B18). The framework sources hold no JSX, so no JSX transform is a candidate's concern.

## Packager spike

Both candidates are run against the contract. The one that passes is the packager. If both pass, `tsdown` is used. If neither passes, this bit stops and a new decision names the next candidate. The spike is not a third way of shipping.

The contract, asserted by `packages/core/tests/structure/exports.test.ts` and `api.test.ts`:

| test | case | result |
| --- | --- | --- |
| `subpath resolves` | every key in `03-surface.md` except the `./fonts/*` pattern | `types` and `default` resolve to files inside the tarball |
| `surface names` | every name `03-surface.md` promises: the root table's first column, and each other entry's `Exports:` line | each is exported by that entry's packed declarations, parsed with oxc (export lists, declarations, default). The root once lacked `redirect`, `notFound`, `unauthenticated`, `unauthorized`, `navigate`, `Href`, and `LocationRewrite`, and `./server` `SecurityConfig` (BUGS.md 105) |
| `font subpath` | a real key of `registry.json`, imported as `@lovrozagar/flare/fonts/<id>` | the default export resolves to that generated module. The module does not import another family. An id that is not a key resolves to no existing file: Node gives a URL to an absent file and the Bun runtime `ERR_MODULE_NOT_FOUND` (BUGS.md B47) |
| `font barrel` | `@lovrozagar/flare/fonts`, resolved by the runtime under test | does not resolve: Node answers `ERR_PACKAGE_PATH_NOT_EXPORTED`, the Bun runtime `ERR_MODULE_NOT_FOUND`; the case names each runtime's answer (BUGS.md B47) |
| `no solid condition` | every entry | no `solid` and no `browser` key, except `./server-fn`'s conditional exports |
| `compiled default` | every entry | `default` resolves to compiled ESM with no TypeScript syntax, and the root entry renders in both a DOM and a server Solid build from that one file |
| `no src path in dts` | every `.d.ts` | the text contains no `virtual:` and no `packages/core/src` |
| `snapshot` | each entry's public `.d.ts` | matches the committed snapshot. A change is a commit of its own |
| `worker outside vite` | a plain import of the packed `./worker` | throws, naming it the Wrangler main that runs only inside Vite with `flare()`: the entry re-exports the worker binding, so `sideEffects: false` cannot drop the throwing module as it drops a bare re-export (B109) |
| `readme exports` | the root README's `Package exports` table, row by entry | each packed entry's exports are all in its row, and its row names nothing the entry does not export (plan 14 leaf 12.3) |
| `readme api names` | the first column of every README table headed `export`, and its `from` column | each name is exported by the entry `from` names, so a reader imports it from the right place and a v0 name nobody thought to deny cannot survive there. Once `nonce` sat in the server table, a root export (flare-77) |
| `readme quick start` | each README block after `<!-- quick-start: <path> -->`, written at that path in a fresh app in the stage, then the packed `flare codegen` | `tsc` with the README's own `tsconfig.json` exits 0 with no output |
| `readme node serve` | the README block after `<!-- node-serve: serve.js -->`, run with Node in the stage beside a stub `dist/server/server.js` and a client file, on a free `PORT` | the client file is served with its type, the rest reaches the listener, and `/%E0%A4%A`, a path `decodeURIComponent` rejects, gets a status and the server keeps answering. Red: the rejection inside the async handler ended the process |
| `tarball contents` | `npm pack` | exactly `dist`, `src`, `README.md`, `LICENSE`, `package.json` |
| `consumer strict` | a fixture with `exactOptionalPropertyTypes` and `verbatimModuleSyntax` | `tsc` exits 0 against the packed types |
| `no dependencies` | the packed `package.json` | the `dependencies` key is absent |
| `image module types` | the packed `dist` | `features/image/vite/modules.d.ts` sits where the emitted `exports/vite.d.ts` reference resolves, and the consumer-strict fixture with `vite/client` types `./a.png?image` as the binding. tsc does not copy `.d.ts` inputs, so the packager must |
| `engines` | the packed manifest | `engines.node` is `>=22.12`, the published floor (B3), so a package manager warns an app on an older Node (plan 21 5.5) |
| `peer floors` | the same manifest | each peer in the B79 table is `>=` its devDependency version. `optional` is true only for `sharp`, `@tanstack/solid-query`, `negotiator`, `isbot`, and `@formatjs/intl-localematcher`. `@cloudflare/vite-plugin` is not a peer: the app depends on it and composes it beside `flare()`, which imports none of it (B109) |
| `not a peer` | the same manifest | `@babel/parser`, `tailwindcss`, `oxc-resolver`, `node-html-markdown`, `@tanstack/query-broadcast-client-experimental`, `@types/negotiator`, and `@cloudflare/vite-plugin` (B109) are absent from both peer and dependency keys |

## `tests/structure/dx-options.test.ts` (BUGS.md 113)

| test | case | result |
| --- | --- | --- |
| `option tables` | every `prop` or `key` table in every `blueprint/dx/*.md`, by the heading above it, one source per table in order where a heading has several: an option type, a function's parameters plus its last parameter's keys, or an explicit exemption with its reason (`observability.md`, plan 15). `Link props` names `target` and `rel` as external, from `JSX.AnchorHTMLAttributes` | each backticked name in a table's first column, `entry.client` as a path and `"96x96"` as its key, is a key of its type, read from the source with oxc through aliases, interfaces, imports, intersections, unions, conditionals, arrays, `Partial`, `Readonly`, `Omit`, and `Pick`. A table under `Planned (plan 15)` is exempt; a dx file or a table with no mapping fails |
| `bites` | a router table naming `basePath` and `nope`, then a Planned table naming `later` | only `nope` is reported, and the Planned table is not read |
| `omit and pick` | `NavigateOptions`, an `Omit` of `NavigateTo`, then an inline `Pick` | `replace` and `to` are absent and `scroll` present; the `Pick` keeps only its key |

## `tests/consumers/*.consumer.test.ts` (plan 21 5.5)

The packed tarball installed as an app installs it: into a fresh project under the OS temp dir, never the repo and never a link to the workspace, by the npm bundled with a Node `scripts/node-at.ts` pins (22.12.0, the B3 floor, and 24.22.0 for every other cell), each checked against nodejs.org's SHA-256, so CI, this machine, and the Mac run the same tools. `stage.ts` builds the projects; a cell's commands run in a consumer's shell, without the runner's `NODE_ENV=test` and `VITEST*`. The cells need the registry, so they run as `bun run --filter @lovrozagar/flare test:consumers` (`vitest.consumers.config.ts`), outside `test` and `verify`. Controlled cells install with `--legacy-peer-deps`, so only the peers they name arrive. The shell sets `SHARP_IGNORE_GLOBAL_LIBVIPS=1`, so a sharp install script uses its prebuilt binaries whatever libvips the machine has: miniflare's own sharp 0.34.5 compiled against this machine's libvips 8.18.6 and failed without node-addon-api. The verbose reporter puts every case and its output in the job's log. CI runs the floor cells in ci.yml's `consumers` job on every push, the newest daily in consumers-newest.yml, and both in release.yml's `verify` on the tarball it ships (ci.test `ci consumers`); each run downloads the two pinned Nodes, about 30 MB apiece, rather than adding a cache action and its pin.

| test | case | result | gate, cost |
| --- | --- | --- | --- |
| `readme install, bun` | the README's `bun add` line, the tarball in place of the package name, run with the runner's Bun in a fresh project | exit 0, no `ERESOLVE`; codegen and `vite build` on Node 24.22.0, then the README's `serve.js` answers `/` with the sentinel the request sent (BUGS.md 299) | `consumers` job; the two readme cells 9.5 s here, warm cache |
| `readme install, npm` | the same packages through the pinned npm 11.19.1 at default peer resolution | as above | as above |
| `node floor` | the minimal app with every peer at its floor (or its newest under FLARE_CONSUMER_PEERS=newest), installed by Node 22.12.0's npm 10.9.0 | on Node 22.12.0: codegen and `vite build`; `serve.js` answers `/` with the sentinel and `/about?_flare=data` with an `l` frame first; `vite` dev answers `/` with the sentinel | `consumers` job; 10.6 s here, warm |
| `ts 5 nodenext` | the fixture `fixture/ts5` (typescript 5.9.3 exact, `module` and `moduleResolution` `nodenext`, `consumer strict`'s other settings, skipLibCheck off), every peer at its floor, @types/node at core's version | tsc 5.9.3 over the staged minimal app and `consumer strict`'s sources exits 0 with no output: the README's TypeScript floor | `consumers` job; 7.0 s |
| `i18n without peers` | the minimal app as an i18n app (`createRouter({ locale })`, `createServer({ locale: i18n() })`), none of the optional peers | `vite build` fails naming all three i18n peers, each with its install command (BUGS.md 300) | `consumers` job; the five optional cells 9.1 s together |
| `i18n peers removed after build` | the i18n app built with its peers, which are then removed | `serve.js` answers `/` with the sentinel: the built server bundles them | as above |
| `i18n without peers, dev` | the i18n app, no optional peers, under `vite` dev | `/` is a 500 whose error page names all three peers (the terminal does not yet, BUGS.md 301) | as above |
| `image without sharp` | `flare({ prerender: true, image: {} })`, no sharp | `vite build` fails naming sharp | as above |
| `query without solid-query` | a page calling `createQueryClientGetter()`, no `@tanstack/solid-query` | `vite build` fails naming it | as above |
| `workers bundle` | the minimal app composed with Cloudflare's plugin, its peers at their floors, `@cloudflare/vite-plugin` and `wrangler` at the repo's catalog versions (newest from there under FLARE_CONSUMER_PEERS=newest) | on Node 24.22.0 the build writes the worker and its deploy config; the gzipped upload is at most 3 MiB (5.6, `tests/workers-modules.ts`), and Miniflare, workerd as `wrangler dev` runs it, answers `/` with the sentinel | `consumers` job; the four floor cells 13 s together |
| `newest report` | FLARE_CONSUMER_PEERS=newest only: each peer `node floor` installed, beside `npm view <peer> versions` filtered by `semver.satisfies(v, range, { includePrerelease: true })` | one line per peer, `!=` where the installed version is not the newest the range admits; a mismatch is printed for a B79 range-wording question, not failed. 2026-10-17: all 13 agree, magic-string 1.4.3, oxc-parser 0.154.0, and vite 8.3.4 among them | `consumers-newest` and the release; the newest run of every cell 37 s |
| `no optional peers` | the minimal app with every peer but the five optional ones | none of the five is installed; the app builds and serves as in `node floor`, on Node 24.22.0 | `consumers` job; 3.3 s |

## `tests/structure/readme.test.ts` (plan 14 leaf 12.3)

npm renders the tarball's README, which is the root `README.md`, and has no repository to resolve a relative link against. `readme.ts` reads it for this file and for exports.test's packed checks.

| test | case | result |
| --- | --- | --- |
| `links` | every markdown link in the README | absolute or an anchor on the page; a link into the repo is `https://github.com/lovrozagar/flare/blob/main/<path>` and the path exists |
| `no v0 names` | the README text | no `tracing`, no `dev.*` flag, no v0 CLI command (`flare generate`, `gen`, `add`, `font`, `routes`, `status`, `validate`), no v0 subpath (`codegen`, `generators`, `validation`, `virtual-types`), and no `0.1.1` |
| `quick start marked` | the quick-start markers | `tsconfig.json` and `src/server.ts` are among them, each path once |
| `install names every peer` | the `## Install` section's `bun add` line and its peer table, against `packages/core/package.json` | the line names `@lovrozagar/flare` and every peer that is not optional, each as `name@<declared range>`, since a bare name installs the `latest` tag (BUGS.md 299); the table names every peer with its declared range (plan 21 5.5, BUGS.md 298) |

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
| `workers` | the same build with the Cloudflare plugin, under miniflare from its deploy config (B109) | the same three requests. Skipped on the Bun run, where the plugin cannot load |
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
