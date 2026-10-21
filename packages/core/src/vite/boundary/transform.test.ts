import { expect, it } from "vitest"
import { fnId } from "../route-meta/index.ts"
import type { Graph } from "./env.ts"
import { boundaryTransform } from "./transform.ts"

const FILE = "src/fns/echo.ts"

function transform(source: string, graph: Graph): string {
	return boundaryTransform(FILE, source, { graph })?.code ?? source
}

const ENV = 'import { createServerOnlyFn, createIsomorphicFn } from "@lovrozagar/flare";\n'
const FN = 'import { createServerFn } from "@lovrozagar/flare/server-fn";\n'

it("env prunes import", () => {
	const source = `${ENV}import { db } from "./db.server";\nexport const load = createServerOnlyFn(() => db.query());\n`
	const client = transform(source, "client")
	expect(client).not.toContain("db.server")
	expect(client).toContain("This server-only function was called outside the server")
	expect(transform(source, "server")).toContain("db.server")
})

it("ssr prunes client import", () => {
	const source = `${ENV}import { confetti } from "browser-only";
export const cheer = createIsomorphicFn().server(() => "quiet").client(() => confetti());
`
	const ssr = transform(source, "server")
	expect(ssr).not.toContain("browser-only")
	expect(ssr).toContain('(() => "quiet")')
	expect(ssr).not.toContain("createIsomorphicFn")
	expect(transform(source, "client")).toContain("browser-only")
	// A helper only the removed body read goes with it, and its import too (plan 21 2.4).
	const helper = `${ENV}import { confetti } from "browser-only";
const burst = () => confetti();
export const cheer = createIsomorphicFn().server(() => "quiet").client(() => burst());
`
	expect(transform(helper, "server")).not.toContain("browser-only")
	expect(transform(helper, "server")).not.toContain("burst")
})

it("shared import kept", () => {
	const source = `${ENV}import { db } from "./db.server";
export const load = createServerOnlyFn(() => db.query());
export const name = db.name;
`
	expect(transform(source, "client")).toContain('import { db } from "./db.server";')
})

it("ids", () => {
	const id = fnId(FILE, "echo")
	const source = `${FN}export const echo = createServerFn({ method: "get" }).handler(async () => 1);\n`
	expect(transform(source, "server")).toContain(`createServerFn({ method: "get", __id: "${id}", __name: "echo" })`)
	expect(transform(source, "client")).toContain(
		`createServerFn({ method: "get", __id: "${id}", __name: "echo", __client: true }).handler(undefined)`,
	)
	const bare = `${FN}export const echo = createServerFn().handler(h);\n`
	expect(transform(bare, "client")).toContain(`createServerFn({ __id: "${id}", __name: "echo", __client: true })`)
	const trailing = `${FN}export const echo = createServerFn({ method: "post", }).handler(h);\nexport const empty = createServerFn({}).handler(h);\n`
	const both = transform(trailing, "server")
	// The fields follow the last property, so the config's own trailing comma stays after them.
	expect(both).toContain(`createServerFn({ method: "post", __id: "${id}", __name: "echo", })`)
	expect(both).toContain(`createServerFn({ __id: "${fnId(FILE, "empty")}", __name: "empty" })`)
	expect(() => transform(`${FN}export const echo = createServerFn("get").handler(h);\n`, "server")).toThrow(
		"src/fns/echo.ts: echo createServerFn() takes a literal object",
	)
	expect(boundaryTransform(FILE, "export const a = 1;\n", { graph: "client" })).toBeUndefined()
	expect(() => boundaryTransform(FILE, "export const = ;", { graph: "client" })).toThrow(/^src\/fns\/echo\.ts: /)
})

it("env inside a removed body", () => {
	// The handler is blanked in the client graph, so the env call inside it is checked but not edited twice.
	const source = `${FN}${ENV}export const echo = createServerFn().handler(() => createServerOnlyFn(() => 1)());\n`
	const client = transform(source, "client")
	expect(client).toContain(".handler(undefined)")
	expect(client).not.toContain("createServerOnlyFn")
})

// A `.ts` module parses as TypeScript, not TSX: a generic arrow, which TSX reads as a tag, splits like any other code
// (plan 21 8.1).
it("ts generic", () => {
	const source = `${ENV}const id = <T>(value: T): T => value;\nexport const read = createServerOnlyFn(() => id(SECRET));\n`
	expect(transform(source, "client")).not.toContain("SECRET")
})

// The id goes in after the config's last property, so a comment after it, a line comment above all, cannot swallow
// it: every call would 404 (plan 21 13.1, BUGS.md 204).
it("config comment", () => {
	const id = fnId(FILE, "echo")
	const ids = `__id: "${id}", __name: "echo"`
	for (const [config, written] of [
		['{ method: "get" // read\n}', `{ method: "get", ${ids} // read\n}`],
		['{ method: "get", /* read */ }', `{ method: "get", ${ids}, /* read */ }`],
		["{ // nothing\n}", `{ ${ids} // nothing\n}`],
		["{}", `{ ${ids} }`],
	]) {
		const source = `${FN}export const echo = createServerFn(${config}).handler(() => 1);\n`
		expect(transform(source, "server")).toContain(`createServerFn(${written})`)
	}
})
