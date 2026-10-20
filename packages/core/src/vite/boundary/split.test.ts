import { SourceMap } from "node:module"
import { expect, it } from "vitest"
import { splitClient } from "./split.ts"

const BUILDER = 'import { createPage } from "@lovrozagar/flare";\n'

function split(source: string): string {
	const result = splitClient("src/routes/a.page.tsx", source)
	if (result === undefined) throw new Error("nothing was split")
	return result.code
}

const loaded = `${BUILDER}import { db } from "../server/db.ts";
import { Card } from "./card.tsx";
export const route = createPage("_root_/a")
	.loader(() => db.read())
	.render(() => <Card />);
`

it("drops the import", () => {
	const code = split(loaded)
	expect(code).not.toContain("../server/db.ts")
	expect(code).not.toContain("db.read")
	expect(code).not.toContain(".loader")
	// A name used in kept code and in removed code stays imported.
	const shared = `${BUILDER}import { db, other } from "./db.ts";
export const route = createPage("_root_/a").loader(() => other()).render(() => db.name);
`
	expect(split(shared)).toContain('import { db } from "./db.ts";')
})

it("keeps render import", () => {
	const code = split(loaded)
	expect(code).toContain('import { Card } from "./card.tsx";')
	expect(code).toContain('import { createPage } from "@lovrozagar/flare";')
	expect(code).toContain(".render(() => <Card />)")
	const named = `${BUILDER}import Shell, * as parts from "./shell.tsx";
import "./side-effect.css";
import type { Props } from "./types.ts";
export const route = createPage("_root_/a").loader(() => parts.load()).render((p: Props) => <Shell {...p} />);
`
	const kept = split(named)
	expect(kept).toContain('import Shell from "./shell.tsx";')
	expect(kept).toContain('import "./side-effect.css";')
	expect(kept).toContain('import type { Props } from "./types.ts";')
	expect(splitClient("x.tsx", 'export const route = 1;\nimport "./a.css";\n')).toBeUndefined()
	// Only a route builder imported from the package starts a route chain.
	const imports = `import * as all from "@lovrozagar/flare";
import { Link, "createPage" as page } from "@lovrozagar/flare";
export declare const typed: number;
export const made = make()(x);
export const route = page("_root_/a").loader(l).render(() => <Link />);
`
	const quoted = split(imports)
	expect(quoted).toContain('page("_root_/a").render(() => <Link />)')
	expect(quoted).not.toContain("import * as all")
})

it("unknown method", () => {
	expect(() => split(`${BUILDER}export const route = createPage("_root_/a").middleware(m).render(r);\n`)).toThrow(
		"src/routes/a.page.tsx: .middleware() is not a route chain method",
	)
	expect(() => split(`${BUILDER}export const route = createPage("_root_/a")["loader"](l).render(r);\n`)).toThrow(
		"src/routes/a.page.tsx: route calls a chain method by element access. Call each method by name",
	)
	expect(() => splitClient("x.tsx", "export const = ;")).toThrow(/^x\.tsx: /)
})

it("response page", () => {
	const source = `${BUILDER}import { secret } from "./secret.ts";
export const route = createPage("_root_/api").authenticate().response(async () => secret());
`
	const code = split(source)
	expect(code).toContain('createPage("_root_/api").response(undefined)')
	expect(code).not.toContain("secret")
	expect(code).not.toContain("authenticate")
	// A removed call with no argument has nothing to blank.
	expect(split(`${BUILDER}export const route = createPage("_root_/api").authenticate().response();\n`)).toContain(
		'createPage("_root_/api").response();',
	)
})

it("cache client", () => {
	const source = `${BUILDER}export const route = createPage("_root_/a")
	.cache({ ssr: { ttl: "1m" }, client: { staleTime: "1s" } })
	.render(r);
export const other = createPage("_root_/b").cache({ ssr: { ttl: "1m" } }).render(r);
`
	const code = split(source)
	expect(code).toContain('.cache({ client: { staleTime: "1s" } })')
	expect(code).not.toContain("ttl")
	for (const argument of ["shared", '"1m"', "", "{ ...shared }", "{ [key]: true }"]) {
		expect(() =>
			split(`${BUILDER}export const route = createPage("_root_/a").cache(${argument}).render(r);\n`),
		).toThrow("src/routes/a.page.tsx: route .cache() takes a literal object")
	}
	// A server field's value may be a function, as an ssg or isr `params` or a `tags` function is (dx/cache.md). It
	// goes with the server fields.
	const listed = `${BUILDER}export const route = createPage("_root_/p/[slug]")
	.cache({ ssg: () => [{ slug: "a" }], cdn: { tags: ({ params }) => [params.slug] }, client: { staleTime: "1s" } })
	.render(r);
export const isr = createPage("_root_/i/[id]").cache({ isr: { params: list } }).render(r);
`
	const kept = split(listed)
	expect(kept).toContain('.cache({ client: { staleTime: "1s" } })')
	expect(kept).not.toContain('slug: "a"')
	expect(kept).not.toContain("params: list")
	expect(kept).toContain('createPage("_root_/i/[id]").render(r)')
})

// A tags function that reads the request is a build error that names the route and the field: inline, through an
// alias or a namespace, or through the module's own helper. A local of the same name, another import of the same
// module, and the request read anywhere else, are not (dx/cache.md, BUGS.md 379).
it("tags read the request", () => {
	const ctx = 'import { serverCtx as ctx } from "@lovrozagar/flare/server";\n'
	const event = 'import { getRequestEvent } from "@solidjs/web";\n'
	const cases = [
		[ctx, "{ ssr: { ttl: '1h', tags: () => [ctx().user] } }", "ssr.tags reads the request through serverCtx"],
		[event, "{ cdn: { maxAge: '1m', tags: who } }", "cdn.tags reads the request through getRequestEvent"],
		[
			'import { "getRequestEvent" as ev } from "@solidjs/web";\n',
			"{ 'ssr': { ttl: '1h', 'tags': () => [String(ev())] } }",
			"ssr.tags reads the request through getRequestEvent",
		],
		[
			'import * as server from "@lovrozagar/flare/server";\n',
			"{ cdn: { tags: () => [server.serverCtx().id] } }",
			"cdn.tags reads the request through serverCtx",
		],
	] as const
	const helper = "function who() { return [String(viaEvent())] }\nconst viaEvent = () => getRequestEvent();\n"
	for (const [imports, cache, message] of cases) {
		const source = `${BUILDER}${imports}${helper}export const route = createPage("_root_/a").cache(${cache}).render(r);\n`
		expect(() => split(source)).toThrow(`src/routes/a.page.tsx: route .cache() ${message}`)
	}
	const web = 'import { isServer } from "@solidjs/web";\n'
	const fine = `${BUILDER}${ctx}${web}export const route = createPage("_root_/a")
	.cache({ ssr: { ttl: "1h", tags: ({ params }) => { const ctx = () => params.id; return [ctx(), String(isServer)] } } })
	.loader(() => ctx())
	.render(r);
`
	expect(split(fine)).not.toContain("tags")
})

it("server fn bodies", () => {
	const source = `import { createServerFn } from "@lovrozagar/flare/server-fn";
import { db } from "../server/db.ts";
export const echo = createServerFn({ method: "get" })
	.authenticate()
	.input((raw) => raw)
	.authorize(({ auth }) => db.can(auth))
	.handler(async () => db.read());
`
	const code = split(source)
	expect(code).toContain(
		'createServerFn({ method: "get" })\n\t.authenticate()\n\t.input(undefined)\n\t.authorize(undefined)\n\t.handler(undefined)',
	)
	expect(code).not.toContain("db")
})

it("source map", () => {
	const source = `${BUILDER}import { db } from "../server/db.ts";
export const route = createPage("_root_/a")
	.loader(async () => {
		const rows = await db.read();
		return { rows };
	})
	.render(() => {
		throw new Error("boom");
	});
`
	const result = splitClient("src/routes/a.page.tsx", source)
	if (result === undefined) throw new Error("nothing was split")
	const generated = result.code.split("\n").findIndex((line) => line.includes('throw new Error("boom")'))
	const original = source.split("\n").findIndex((line) => line.includes('throw new Error("boom")'))
	expect(generated).toBeLessThan(original)
	const column = result.code.split("\n")[generated].indexOf("throw")
	const entry = new SourceMap(JSON.parse(result.map.toString())).findEntry(generated, column)
	expect(entry).toMatchObject({ originalLine: original, originalColumn: column })
})

// The loader is the only real read of `db`. The render only mentions the name.
function mentions(render: string): string {
	return split(`${BUILDER}import { db } from "./db.server.ts";
export const route = createPage("_root_/a")
	.loader(() => db.read())
	.render((p) => ${render});
`)
}

it("member property", () => {
	expect(mentions("p.loaderData.db")).not.toContain("db.server")
	expect(mentions("<ui.db />")).not.toContain("db.server")
})

it("object key", () => {
	expect(mentions("({ db: 1 }).db")).not.toContain("db.server")
	expect(mentions("new (class { db = 1; db2() {} })()")).not.toContain("db.server")
	expect(mentions("((q: { db: string; db3(): void }) => q)")).not.toContain("db.server")
	expect(mentions("(() => { db: for (;;) break db; })()")).not.toContain("db.server")
	expect(mentions("import.meta.env")).not.toContain("db.server")
})

it("declaration", () => {
	for (const render of [
		"((q: ns.db) => q)",
		"(() => { db: for (;;) continue db; })()",
		"(() => { class db {} try {} catch (db) {} try {} catch {} return 1; })()",
		"(([a, ...db], { x: db2 = 1 }: T) => a)",
		"new (class { constructor(private db: number) {} })(1)",
	]) {
		expect(mentions(render)).not.toContain("db.server")
	}
})

it("jsx attribute", () => {
	expect(mentions('<div db="1" />')).not.toContain("db.server")
	expect(mentions('<svg db:x="1" />')).not.toContain("db.server")
})

it("real read", () => {
	for (const render of ["db.name", "({ db })", "<db.Panel />", "p[db]", "({ [db]: 1 })", "<C x={db} />"]) {
		expect(mentions(render)).toContain('import { db } from "./db.server.ts";')
	}
	// A re-export of the import is a read.
	const exported = `${BUILDER}import { db } from "./db.server.ts";
export { db };
export const route = createPage("_root_/a").loader(() => db.read()).render(() => 1);
`
	expect(split(exported)).toContain('import { db } from "./db.server.ts";')
	const renamed = `${BUILDER}import { db } from "./db.server.ts";
export { other as db };
export const route = createPage("_root_/a").loader(() => db.read()).render(() => 1);
`
	expect(split(renamed)).not.toContain("db.server")
})

it("shadowed param", () => {
	expect(mentions("[1].map((db) => db)")).not.toContain("db.server")
	expect(mentions("[1].map(function db() { return db; })")).not.toContain("db.server")
})

it("shadowed block", () => {
	expect(mentions("(() => { { const db = 1; return db; } })()")).not.toContain("db.server")
	expect(mentions("(() => { for (const db of []) db; try {} catch (db) { db; } return 1; })()")).not.toContain(
		"db.server",
	)
})

it("hoisted var", () => {
	expect(mentions("(() => { function f() { db; var db; } return f; })()")).not.toContain("db.server")
	expect(mentions("(() => { if (p) { db(); } function db() {} })()")).not.toContain("db.server")
})

it("outer read", () => {
	expect(mentions("(() => { const x = 1; return db.name; })()")).toContain('import { db } from "./db.server.ts";')
	// A block's own declaration does not reach a read outside it.
	expect(mentions("(() => { { const db = 1; } return db; })()")).toContain('import { db } from "./db.server.ts";')
	expect(mentions("(() => { { function db() {} } return db; })()")).toContain('import { db } from "./db.server.ts";')
})

// A route builder reached through the package's namespace import is a route chain too, and every other shape a
// builder takes, an `export { route }`, a chain bound to a variable, or the builder as a value, is a build error, so
// no route chain reaches the client unsplit (plan 21 2.4).
it("route shapes", () => {
	const namespace = `import * as flare from "@lovrozagar/flare";
import { db } from "./db.server.ts";
export const route = flare.createPage("_root_/a").loader(() => db.read()).render(() => flare.cn("a"));
`
	const code = split(namespace)
	expect(code).not.toContain("db")
	expect(code).toContain('flare.createPage("_root_/a").render(() => flare.cn("a"))')
	const direct = /(createPage|createLayout) must be a direct export: export const route = \1\(\)…/
	const shapes = [
		`${BUILDER}const route = createPage("_root_/a").loader(l).render(r);\nexport { route };\n`,
		`${BUILDER}const base = createPage("_root_/a");\nexport const route = base.loader(l).render(r);\n`,
		`${BUILDER}const make = createPage;\nexport const route = make("_root_/a").loader(l);\n`,
		`import * as flare from "@lovrozagar/flare";\nconst route = flare.createPage("_root_/a").loader(l);\nexport { route };\n`,
		`${BUILDER}export const route = [createPage("_root_/a").loader(l)][0];\n`,
		`import * as flare from "@lovrozagar/flare";\nconst make = flare.createLayout;\nexport const route = make("_root_");\n`,
	]
	for (const shape of shapes) expect(() => split(shape)).toThrow(direct)
	const value = "src/routes/a.page.tsx: the namespace flare is read as a value; use it only as flare.name"
	for (const read of [
		'Reflect.set(globalThis, "f", flare);',
		'export const route = flare["createPage"]("_root_/a");',
	]) {
		expect(() => split(`import * as flare from "@lovrozagar/flare";\n${read}\n`)).toThrow(value)
	}
	// A type position reads neither a builder nor a namespace.
	const typed = `import * as flare from "@lovrozagar/flare";
${BUILDER}type Make = typeof createPage;
type Props = flare.RouteProps;
export const route = createPage("_root_/a").loader(l).render((p: Props) => p);
`
	expect(split(typed)).toContain('createPage("_root_/a").render((p: Props) => p)')
	expect(() => split(`${BUILDER}export function f(createPage) { return createPage(1) }\n`)).toThrow(
		"src/routes/a.page.tsx: a local binding shadows createPage",
	)
})

// A module-scope declaration only removed code read goes with it, and so do the imports only it read, however many
// declarations deep; one kept code reads, one nothing read before the split, and an exported one stay (plan 21 2.4).
it("dead helpers", () => {
	const source = `${BUILDER}import { db } from "./db.server.ts";
import { secret } from "./secret.server.ts";
import { format } from "./format.ts";
import { start } from "./start.ts";
const query = (id: string) => db.read(id);
function walk(n: number): unknown { return n > 0 ? walk(n - 1) : secret; }
async function load({ params }: { params: { id: string } }) { return [query(params.id), walk(2)]; }
class Repo { all() { return db.all(); } }
const [first, second] = [new Repo(), 2];
const label = format("x");
const booted = start();
export const helper = () => db.ping();
export const route = createPage("_root_/a").loader(load).preloader(() => first.all() + second).render(() => label);
`
	const code = split(source)
	for (const gone of ["secret", "query", "walk", "load", "Repo", "first", "second"]) expect(code).not.toContain(gone)
	for (const kept of ["const label", "const booted = start()", "export const helper", "import { format }"]) {
		expect(code).toContain(kept)
	}
	expect(code).toContain('import { db } from "./db.server.ts";')
	const fn = `import { createServerFn } from "@lovrozagar/flare/server-fn";
import { db } from "./db.server.ts";
const read = () => db.read();
export const echo = createServerFn().handler(read);
`
	expect(split(fn)).not.toContain("db")
})
