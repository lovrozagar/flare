import { SourceMap } from "node:module";
import { expect, it } from "vitest";
import { splitClient } from "./split.ts";

const BUILDER = 'import { createPage } from "@lovrozagar/flare";\n';

function split(source: string): string {
	const result = splitClient("src/routes/a.page.tsx", source);
	if (result === undefined) throw new Error("nothing was split");
	return result.code;
}

const loaded = `${BUILDER}import { db } from "../server/db.ts";
import { Card } from "./card.tsx";
export const route = createPage("_root_/a")
	.loader(() => db.read())
	.render(() => <Card />);
`;

it("drops the import", () => {
	const code = split(loaded);
	expect(code).not.toContain("../server/db.ts");
	expect(code).not.toContain("db.read");
	expect(code).not.toContain(".loader");
	// A name used in kept code and in removed code stays imported.
	const shared = `${BUILDER}import { db, other } from "./db.ts";
export const route = createPage("_root_/a").loader(() => other()).render(() => db.name);
`;
	expect(split(shared)).toContain('import { db } from "./db.ts";');
});

it("keeps render import", () => {
	const code = split(loaded);
	expect(code).toContain('import { Card } from "./card.tsx";');
	expect(code).toContain('import { createPage } from "@lovrozagar/flare";');
	expect(code).toContain(".render(() => <Card />)");
	const named = `${BUILDER}import Shell, * as parts from "./shell.tsx";
import "./side-effect.css";
import type { Props } from "./types.ts";
export const route = createPage("_root_/a").loader(() => parts.load()).render((p: Props) => <Shell {...p} />);
`;
	const kept = split(named);
	expect(kept).toContain('import Shell from "./shell.tsx";');
	expect(kept).toContain('import "./side-effect.css";');
	expect(kept).toContain('import type { Props } from "./types.ts";');
	expect(splitClient("x.tsx", 'export const route = 1;\nimport "./a.css";\n')).toBeUndefined();
	// Only a route builder imported from the package starts a route chain.
	const imports = `import * as all from "@lovrozagar/flare";
import { Link, "createPage" as page } from "@lovrozagar/flare";
export declare const typed: number;
export const made = make()(x);
export const route = page("_root_/a").loader(l).render(() => <Link />);
`;
	const quoted = split(imports);
	expect(quoted).toContain('page("_root_/a").render(() => <Link />)');
	expect(quoted).not.toContain("import * as all");
});

it("unknown method", () => {
	expect(() => split(`${BUILDER}export const route = createPage("_root_/a").middleware(m).render(r);\n`)).toThrow(
		"src/routes/a.page.tsx: .middleware() is not a route chain method",
	);
	expect(() => split(`${BUILDER}export const route = createPage("_root_/a")["loader"](l).render(r);\n`)).toThrow(
		"src/routes/a.page.tsx: route calls a chain method by element access. Call each method by name",
	);
	expect(() => splitClient("x.tsx", "export const = ;")).toThrow(/^x\.tsx: /);
});

it("response page", () => {
	const source = `${BUILDER}import { secret } from "./secret.ts";
export const route = createPage("_root_/api").authenticate().response(async () => secret());
`;
	const code = split(source);
	expect(code).toContain('createPage("_root_/api").response(undefined)');
	expect(code).not.toContain("secret");
	expect(code).not.toContain("authenticate");
	// A removed call with no argument has nothing to blank.
	expect(split(`${BUILDER}export const route = createPage("_root_/api").authenticate().response();\n`)).toContain(
		'createPage("_root_/api").response();',
	);
});

it("cache client", () => {
	const source = `${BUILDER}export const route = createPage("_root_/a")
	.cache({ ssr: { ttl: "1m" }, client: { staleTime: "1s" } })
	.render(r);
export const other = createPage("_root_/b").cache({ ssr: { ttl: "1m" } }).render(r);
`;
	const code = split(source);
	expect(code).toContain('.cache({ client: { staleTime: "1s" } })');
	expect(code).not.toContain("ttl");
	for (const argument of ["shared", '"1m"', "", "{ ...shared }", "{ [key]: true }"]) {
		expect(() =>
			split(`${BUILDER}export const route = createPage("_root_/a").cache(${argument}).render(r);\n`),
		).toThrow("src/routes/a.page.tsx: route .cache() takes a literal object");
	}
	// A server field's value may be a function, as an ssg or isr `params` or a `tags` function is (dx/cache.md). It
	// goes with the server fields.
	const listed = `${BUILDER}export const route = createPage("_root_/p/[slug]")
	.cache({ ssg: () => [{ slug: "a" }], cdn: { tags: ({ params }) => [params.slug] }, client: { staleTime: "1s" } })
	.render(r);
export const isr = createPage("_root_/i/[id]").cache({ isr: { params: list } }).render(r);
`;
	const kept = split(listed);
	expect(kept).toContain('.cache({ client: { staleTime: "1s" } })');
	expect(kept).not.toContain('slug: "a"');
	expect(kept).not.toContain("params: list");
	expect(kept).toContain('createPage("_root_/i/[id]").render(r)');
});

it("server fn bodies", () => {
	const source = `import { createServerFn } from "@lovrozagar/flare/server-fn";
import { db } from "../server/db.ts";
export const echo = createServerFn({ method: "get" })
	.authenticate()
	.input((raw) => raw)
	.authorize(({ auth }) => db.can(auth))
	.handler(async () => db.read());
`;
	const code = split(source);
	expect(code).toContain(
		'createServerFn({ method: "get" })\n\t.authenticate()\n\t.input(undefined)\n\t.authorize(undefined)\n\t.handler(undefined)',
	);
	expect(code).not.toContain("db");
});

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
`;
	const result = splitClient("src/routes/a.page.tsx", source);
	if (result === undefined) throw new Error("nothing was split");
	const generated = result.code.split("\n").findIndex((line) => line.includes('throw new Error("boom")'));
	const original = source.split("\n").findIndex((line) => line.includes('throw new Error("boom")'));
	expect(generated).toBeLessThan(original);
	const column = result.code.split("\n")[generated].indexOf("throw");
	const entry = new SourceMap(JSON.parse(result.map.toString())).findEntry(generated, column);
	expect(entry).toMatchObject({ originalLine: original, originalColumn: column });
});

// The loader is the only real read of `db`. The render only mentions the name.
function mentions(render: string): string {
	return split(`${BUILDER}import { db } from "./db.server.ts";
export const route = createPage("_root_/a")
	.loader(() => db.read())
	.render((p) => ${render});
`);
}

it("member property", () => {
	expect(mentions("p.loaderData.db")).not.toContain("db.server");
	expect(mentions("<ui.db />")).not.toContain("db.server");
});

it("object key", () => {
	expect(mentions("({ db: 1 }).db")).not.toContain("db.server");
	expect(mentions("new (class { db = 1; db2() {} })()")).not.toContain("db.server");
	expect(mentions("((q: { db: string; db3(): void }) => q)")).not.toContain("db.server");
	expect(mentions("(() => { db: for (;;) break db; })()")).not.toContain("db.server");
	expect(mentions("import.meta.env")).not.toContain("db.server");
});

it("declaration", () => {
	for (const render of [
		"((q: ns.db) => q)",
		"(() => { db: for (;;) continue db; })()",
		"(() => { class db {} try {} catch (db) {} try {} catch {} return 1; })()",
		"(([a, ...db], { x: db2 = 1 }: T) => a)",
		"new (class { constructor(private db: number) {} })(1)",
	]) {
		expect(mentions(render)).not.toContain("db.server");
	}
});

it("jsx attribute", () => {
	expect(mentions('<div db="1" />')).not.toContain("db.server");
	expect(mentions('<svg db:x="1" />')).not.toContain("db.server");
});

it("real read", () => {
	for (const render of ["db.name", "({ db })", "<db.Panel />", "p[db]", "({ [db]: 1 })", "<C x={db} />"]) {
		expect(mentions(render)).toContain('import { db } from "./db.server.ts";');
	}
	// A re-export of the import is a read.
	const exported = `${BUILDER}import { db } from "./db.server.ts";
export { db };
export const route = createPage("_root_/a").loader(() => db.read()).render(() => 1);
`;
	expect(split(exported)).toContain('import { db } from "./db.server.ts";');
	const renamed = `${BUILDER}import { db } from "./db.server.ts";
export { other as db };
export const route = createPage("_root_/a").loader(() => db.read()).render(() => 1);
`;
	expect(split(renamed)).not.toContain("db.server");
});

it("shadowed param", () => {
	expect(mentions("[1].map((db) => db)")).not.toContain("db.server");
	expect(mentions("[1].map(function db() { return db; })")).not.toContain("db.server");
});

it("shadowed block", () => {
	expect(mentions("(() => { { const db = 1; return db; } })()")).not.toContain("db.server");
	expect(mentions("(() => { for (const db of []) db; try {} catch (db) { db; } return 1; })()")).not.toContain(
		"db.server",
	);
});

it("hoisted var", () => {
	expect(mentions("(() => { function f() { db; var db; } return f; })()")).not.toContain("db.server");
	expect(mentions("(() => { if (p) { db(); } function db() {} })()")).not.toContain("db.server");
});

it("outer read", () => {
	expect(mentions("(() => { const x = 1; return db.name; })()")).toContain('import { db } from "./db.server.ts";');
	// A block's own declaration does not reach a read outside it.
	expect(mentions("(() => { { const db = 1; } return db; })()")).toContain('import { db } from "./db.server.ts";');
	expect(mentions("(() => { { function db() {} } return db; })()")).toContain('import { db } from "./db.server.ts";');
});
