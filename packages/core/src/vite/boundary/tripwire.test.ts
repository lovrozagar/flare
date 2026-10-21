import { symlinkSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createBuilder } from "vite"
import { afterEach, expect, it } from "vitest"
import { flare } from "../plugin/flare.ts"
import { app, appending, boundary, build, ENV, external, fixtures, FN, forcing, KEEP } from "./build.fixture.ts"
import { checkChunk } from "./tripwire.ts"

const PACKAGE_SRC = resolve(fileURLToPath(new URL("../..", import.meta.url)))
const MINIMAL = resolve(fileURLToPath(new URL("../../../tests/e2e/apps/minimal", import.meta.url)))

const roots = fixtures()
const fixture = roots.make

afterEach(() => {
	roots.removeAll()
})

it("handler body", async () => {
	const root = fixture(app(`${FN}export const echo = createServerFn().handler(() => "SENTINEL_FN");\n`))
	const client = await build(root, "client")
	expect(client).toContain("createServerFn")
	expect(client).not.toContain("SENTINEL_FN")
	await expect(
		build(root, "client", [forcing("mod.ts", ".handler(undefined)", '.handler(() => "SENTINEL_FN")')]),
	).rejects.toThrow(/src\/mod\.ts holds code the client graph must not contain \(B45\)/)
})

// A root reached through a symlink: Vite gives the modules' ids as real paths, and they are still the app's modules,
// so the boundary transform strips the body instead of leaving it for the tripwire (BUGS.md B51).
it("symlinked root", async () => {
	const real = fixture(app(`${FN}export const echo = createServerFn().handler(() => "SENTINEL_FN");\n`))
	const link = `${real}-link`
	symlinkSync(real, link)
	roots.track(link)
	const client = await build(link, "client")
	expect(client).toContain("createServerFn")
	expect(client).not.toContain("SENTINEL_FN")
})

it("server path", async () => {
	const root = fixture({
		"src/client.ts": KEEP(`${PACKAGE_SRC}/server/lifecycle/create.ts`),
	})
	await expect(build(root, "client")).rejects.toThrow(
		/src\/server\/.+ is server code and cannot be in the client graph \(B45\)/,
	)
})

// Prerender's Node build of the server is a server graph, checked like ssr: it holds server bodies and the package's
// server modules, and a client-only body fails it (B109).
it("prerender graph", async () => {
	const root = fixture(app(`${FN}export const echo = createServerFn().handler(() => "SENTINEL_FN");\n`))
	expect(await build(root, "flare_prerender")).toContain("SENTINEL_FN")
	const path = fixture({ "src/server.ts": KEEP(`${PACKAGE_SRC}/server/context/ctx.ts`) })
	await expect(build(path, "flare_prerender")).resolves.toContain("serverCtx")
	const client = fixture(app(`${ENV}export const focus = createClientOnlyFn(() => "SENTINEL_CLIENT");\n`))
	expect(await build(client, "flare_prerender")).not.toContain("SENTINEL_CLIENT")
	const force = appending(
		"mod.ts",
		'import { createClientOnlyFn as put } from "@lovrozagar/flare";\nexport const back = put(() => "SENTINEL_CLIENT");',
	)
	await expect(build(client, "flare_prerender", [force])).rejects.toThrow(/the server graph must not contain/)
})

it("server only body", async () => {
	const root = fixture(app(`${ENV}export const read = createServerOnlyFn(() => "SENTINEL_ENV");\n`))
	expect(await build(root, "client")).not.toContain("SENTINEL_ENV")
	expect(await build(root, "flare_prerender")).toContain("SENTINEL_ENV")
	expect(await build(root, "ssr")).toContain("SENTINEL_ENV")
	const force = appending(
		"mod.ts",
		'import { createServerOnlyFn as put } from "@lovrozagar/flare";\nexport const back = put(() => "SENTINEL_ENV");',
	)
	await expect(build(root, "client", [force])).rejects.toThrow(/B45/)
})

// A helper reached through the app's own barrels is the helper: a re-export, renamed or not, `export *`, and a namespace
// import of a barrel, at any depth. The client chunk holds no server-only body, and the server keeps it (BUGS.md 461).
it("barrel helpers", async () => {
	const barrels = {
		"src/h1.ts": 'export { createServerOnlyFn as serverOnly, createIsomorphicFn } from "@lovrozagar/flare";\n',
		"src/h2.ts": 'export * from "./h1.ts";\nexport * as flare from "@lovrozagar/flare";\n',
		"src/helpers.ts": 'export { createServerOnlyFn } from "@lovrozagar/flare";\n',
	}
	const module = [
		'import { createServerOnlyFn } from "./helpers.ts";',
		'import { serverOnly, createIsomorphicFn } from "./h2.ts";',
		'import * as h from "./helpers.ts";',
		'import { flare } from "./h2.ts";',
		'export const a = createServerOnlyFn(() => "SECRET_BARREL");',
		'export const b = serverOnly(() => "SECRET_DEPTH");',
		'export const c = h.createServerOnlyFn(() => "SECRET_NAMESPACE");',
		'export const d = createIsomorphicFn().server(() => "SECRET_ISO").client(() => "iso client");',
		'export const e = flare.createServerOnlyFn(() => "SECRET_STAR_AS");',
		"",
	].join("\n")
	const root = fixture({ ...app(module), ...barrels })
	const client = await build(root, "client")
	for (const secret of ["SECRET_BARREL", "SECRET_DEPTH", "SECRET_NAMESPACE", "SECRET_ISO", "SECRET_STAR_AS"]) {
		expect([secret, client.includes(secret)]).toEqual([secret, false])
	}
	expect(client).toContain("iso client")
	expect(await build(root, "ssr")).toContain("SECRET_BARREL")
	// The tripwire reads the barrels too: a body a later plugin puts back fails the build.
	const force = appending(
		"mod.ts",
		'import { serverOnly as put } from "./h2.ts";\nexport const back = put(() => "SECRET_DEPTH");',
	)
	await expect(build(root, "client", [force])).rejects.toThrow(/B45/)
})

// A barrel helper read other than as a direct call, and a dynamic import that reaches a helper or that the analysis
// cannot follow, fail the build naming the module and the helper; a dynamic import that takes only other names builds
// (BUGS.md 461).
it("unfollowable helpers", async () => {
	const barrel = { "src/helpers.ts": 'export { createServerOnlyFn } from "@lovrozagar/flare";\n' }
	const copied = fixture({
		...app('import { createServerOnlyFn } from "./helpers.ts";\nexport const f = createServerOnlyFn;\n'),
		...barrel,
	})
	await expect(build(copied, "client")).rejects.toThrow("createServerOnlyFn must be called directly")
	const destructured = fixture(
		app(
			'const { createServerOnlyFn } = await import("@lovrozagar/flare");\nexport const r = createServerOnlyFn(() => "SECRET_DYNAMIC");\n',
		),
	)
	await expect(build(destructured, "client")).rejects.toThrow(
		/mod\.ts: a dynamic import of @lovrozagar\/flare reaches createServerOnlyFn/,
	)
	const whole = fixture(
		app(
			'const flare = await import("@lovrozagar/flare");\nexport const r = flare.createServerOnlyFn(() => "SECRET_WHOLE");\n',
		),
	)
	await expect(build(whole, "client")).rejects.toThrow(/mod\.ts: a dynamic import of @lovrozagar\/flare/)
	const viaBarrel = fixture({ ...app('export const m = import("./helpers.ts").then((h) => h);\n'), ...barrel })
	await expect(build(viaBarrel, "client")).rejects.toThrow(/mod\.ts: a dynamic import of \.\/helpers\.ts/)
	const other = fixture(app('const { Link } = await import("@lovrozagar/flare");\nexport const l = Link;\n'))
	expect(await build(other, "client")).toContain("Link")
})

it("client only body", async () => {
	const root = fixture(app(`${ENV}export const focus = createClientOnlyFn(() => "SENTINEL_CLIENT");\n`))
	expect(await build(root, "ssr")).not.toContain("SENTINEL_CLIENT")
	expect(await build(root, "client")).toContain("SENTINEL_CLIENT")
	const force = appending(
		"mod.ts",
		'import { createClientOnlyFn as put } from "@lovrozagar/flare";\nexport const back = put(() => "SENTINEL_CLIENT");',
	)
	await expect(build(root, "ssr", [force])).rejects.toThrow(/the server graph must not contain/)
})

it("iso server body", async () => {
	const root = fixture(
		app(`${ENV}export const pick = createIsomorphicFn().server(() => "SENTINEL_ISO").client(() => "CLIENT_SIDE");\n`),
	)
	expect(await build(root, "client")).not.toContain("SENTINEL_ISO")
	expect(await build(root, "flare_prerender")).toContain("SENTINEL_ISO")
	expect(await build(root, "ssr")).toContain("SENTINEL_ISO")
	const chain =
		'import { createIsomorphicFn as iso } from "@lovrozagar/flare";\nexport const back = iso().server(() => "SENTINEL_ISO").client(() => "CLIENT_SIDE");'
	await expect(build(root, "client", [appending("mod.ts", chain)])).rejects.toThrow(/B45/)
	await expect(build(root, "ssr", [appending("mod.ts", chain)])).rejects.toThrow(/B45/)
	// Through the namespace import too: the client graph holds no server body (plan 21 13.15).
	const namespaced = fixture(
		app(
			'import * as flare from "@lovrozagar/flare";\nexport const pick = flare.createIsomorphicFn().server(() => "SENTINEL_ISO").client(() => "CLIENT_SIDE");\n',
		),
	)
	expect(await build(namespaced, "client")).not.toContain("SENTINEL_ISO")
	const viaNamespace =
		'import * as again from "@lovrozagar/flare";\nexport const back = again.createIsomorphicFn().server(() => "SENTINEL_ISO").client(() => "CLIENT_SIDE");'
	await expect(build(namespaced, "client", [appending("mod.ts", viaNamespace)])).rejects.toThrow(/B45/)
})

it("clean", async () => {
	const builder = await createBuilder({
		root: MINIMAL,
		configFile: false,
		logLevel: "silent",
		plugins: [flare()],
		environments: {
			client: { build: { write: false, rollupOptions: { input: join(MINIMAL, "src/client.tsx"), external } } },
			ssr: { build: { write: false, ssr: true, rollupOptions: { input: join(MINIMAL, "src/server.ts"), external } } },
		},
	})
	await expect(builder.build(builder.environments.client)).resolves.toBeDefined()
	await expect(builder.build(builder.environments.ssr)).resolves.toBeDefined()
})

it("four bodies", async () => {
	const module = `${FN}export const echo = createServerFn()
	.input(() => "SENTINEL_INPUT")
	.authorize(({ auth }) => auth === "SENTINEL_AUTH")
	.handler(() => "SENTINEL_FN");
export const numbers = createServerFn().stream(async function* () {
	yield "SENTINEL_STREAM";
});
`
	const root = fixture(app(module))
	const sentinels = ["SENTINEL_INPUT", "SENTINEL_AUTH", "SENTINEL_FN", "SENTINEL_STREAM"]
	const client = await build(root, "client")
	for (const sentinel of sentinels) expect(client).not.toContain(sentinel)
	for (const server of ["ssr", "flare_prerender"] as const) {
		const code = await build(root, server)
		for (const sentinel of sentinels) expect(code).toContain(sentinel)
	}
	const bodies: Array<[string, string]> = [
		[".input(undefined)", '.input(() => "SENTINEL_INPUT")'],
		[".authorize(undefined)", '.authorize(({ auth }) => auth === "SENTINEL_AUTH")'],
		[".handler(undefined)", '.handler(() => "SENTINEL_FN")'],
		[".stream(undefined)", '.stream(async function* () { yield "SENTINEL_STREAM"; })'],
	]
	for (const [from, to] of bodies) {
		await expect(build(root, "client", [forcing("mod.ts", from, to)])).rejects.toThrow(/B45/)
	}
})

// A bare import except the package itself, which this case bundles.
function bundled(id: string): boolean {
	return external(id) && !id.startsWith("@lovrozagar/flare")
}

// A page that imports a server function, built for the browser with the package itself in the chunk. The client
// entry of `./server-fn` holds no `src/server` module (03-surface). The fixture sits under the repo's ignored .tmp
// so the package resolves through its export conditions.
it("server fn import", async () => {
	const repo = resolve(PACKAGE_SRC, "../../..")
	const root = fixture(
		app(`${FN}export const echo = createServerFn().handler(() => "SENTINEL_FN");\n`),
		join(repo, ".tmp"),
	)
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: "silent",
		plugins: [boundary()],
		environments: {
			client: {
				build: {
					write: false,
					minify: false,
					rollupOptions: { input: join(root, "src/client.ts"), external: bundled },
				},
			},
		},
	})
	await expect(builder.build(builder.environments.client)).resolves.toBeDefined()
})

it("outside root", async () => {
	// A workspace module outside the app root is never transformed, so its server-only body reaches the chunk and fails
	// it. A server function there fails sooner, at the transform, since no server would register it (BUGS.md 201).
	const workspace = fixture({
		"lib/only.ts": `${ENV}export const read = createServerOnlyFn(() => "SENTINEL_ONLY");\n`,
		"lib/fns.ts": `${FN}export const echo = createServerFn().handler(() => "SENTINEL_FN");\n`,
	})
	const root = fixture({ "src/client.ts": KEEP(`${workspace}/lib/only.ts`) })
	await expect(build(root, "client")).rejects.toThrow(/lib\/only\.ts holds code the client graph must not contain/)
	const fns = fixture({ "src/client.ts": KEEP(`${workspace}/lib/fns.ts`) })
	await expect(build(fns, "client")).rejects.toThrow(/lib\/fns\.ts: echo is a server function outside src\//)
})

// A loader helper at module scope, and the server module only it imports, stay out of the built client chunk; the
// server module runs code on import, so a kept import would bring it in (plan 21 2.4).
it("loader helper", async () => {
	const root = fixture({
		"src/db.ts": 'Reflect.set(globalThis, "db", "SENTINEL_DB");\nexport const read = () => "SENTINEL_READ";\n',
		"src/mod.ts": `import { createPage } from "@lovrozagar/flare";
import { read } from "./db.ts";
const load = () => read();
export const route = createPage("_root_/a").loader(load).render(() => "page");
`,
		"src/client.ts": KEEP("./mod.ts"),
		"src/server.ts": KEEP("./mod.ts"),
	})
	const client = await build(root, "client")
	expect(client).toContain("page")
	expect(client).not.toContain("SENTINEL_DB")
	expect(await build(root, "ssr")).toContain("SENTINEL_READ")
})

function route(chain: string): string {
	return `import { createPage } from "@lovrozagar/flare";\nexport const route = createPage("_root_/a")${chain};\n`
}

// One client chunk with one module, checked directly.
function check(code: string | null): void {
	checkChunk({
		graph: "client",
		chunk: "c.js",
		modules: [{ id: "/app/src/a.page.ts?v=1", code }],
		packageSrc: "/pkg/src",
	})
}

it("route method", () => {
	expect(() => check(route(".loader(load).render(r)"))).toThrow(
		"c.js: /app/src/a.page.ts holds code the client graph must not contain (B45)",
	)
	expect(() => check(route(".response(answer)"))).toThrow(/B45/)
	expect(() => check(route(".response(undefined)"))).not.toThrow()
	expect(() => check(route(".render(r)"))).not.toThrow()
	// A chain through the namespace import is read too, and a shape the split cannot see fails (plan 21 2.4).
	const namespace = 'import * as flare from "@lovrozagar/flare";\nexport const route = flare.createPage("_root_/a")'
	expect(() => check(`${namespace}.loader(load).render(r);\n`)).toThrow(/B45/)
	expect(() => check(`${route(".loader(load)").replace("export const", "const")}export { route };\n`)).toThrow(
		/must be a direct export/,
	)
	expect(() => check(null)).not.toThrow()
	expect(() => check("export const = ;")).toThrow(
		/c\.js: \/app\/src\/a\.page\.ts could not be read by the tripwire: .+ \(B45\)/,
	)
})
