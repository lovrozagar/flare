import { afterEach, expect, it } from "vitest"
import { app, build, ENV, fixtures } from "../../src/vite/boundary/build.fixture.ts"

// dx/env.md's shapes through a real Vite build with flare()'s boundary transform (B96): each case builds a fixture
// app's graphs and reads the emitted chunks, or the build's rejection, for one row of the shapes table.

const roots = fixtures()

afterEach(() => {
	roots.removeAll()
})

function root(module: string): string {
	return roots.make(app(module))
}

it("server alias", async () => {
	const aliased = root(
		'import { createServerOnlyFn as mark } from "@lovrozagar/flare";\nexport const read = mark(() => "SECRET_ALIAS");\n',
	)
	expect(await build(aliased, "client")).not.toContain("SECRET_ALIAS")
	expect(await build(aliased, "ssr")).toContain("SECRET_ALIAS")
	const quoted = root(
		'import { "createServerOnlyFn" as mark } from "@lovrozagar/flare";\nexport const read = mark(() => "SECRET_QUOTED");\n',
	)
	expect(await build(quoted, "client")).not.toContain("SECRET_QUOTED")
})

it("server namespace", async () => {
	const named = root(
		'import * as flare from "@lovrozagar/flare";\nexport const read = flare.createServerOnlyFn(function () { return "SECRET_NS"; });\nexport const other = flare.other(() => "KEPT_NS");\n',
	)
	const client = await build(named, "client")
	expect(client).not.toContain("SECRET_NS")
	// A namespace member that is not a helper is not rewritten.
	expect(client).toContain("KEPT_NS")
	expect(await build(named, "ssr")).toContain("SECRET_NS")
})

it("server shadow", async () => {
	const shadowed = root(`${ENV}export function wrap(createServerOnlyFn) { return createServerOnlyFn; }\n`)
	await expect(build(shadowed, "client")).rejects.toThrow(/src\/mod\.ts: a local binding shadows createServerOnlyFn/)
})

it("server indirect", async () => {
	const copied = root(`${ENV}const mark = createServerOnlyFn;\nexport const read = mark(() => "SECRET");\n`)
	await expect(build(copied, "client")).rejects.toThrow(/src\/mod\.ts: createServerOnlyFn must be called directly/)
})

it("server identifier", async () => {
	const passed = root(`${ENV}const readDb = () => "SECRET";\nexport const read = createServerOnlyFn(readDb);\n`)
	await expect(build(passed, "client")).rejects.toThrow(
		/src\/mod\.ts: createServerOnlyFn takes an inline function expression or arrow/,
	)
})

// The prerender environment, the Node build a Workers app prerenders from, is a server graph (B109).
it("iso prerender", async () => {
	const iso = root(
		`${ENV}export const pick = createIsomorphicFn().server(() => "SERVER_SIDE").client(() => "CLIENT_SIDE");\n`,
	)
	const prerender = await build(iso, "flare_prerender")
	expect(prerender).toContain("SERVER_SIDE")
	expect(prerender).not.toContain("CLIENT_SIDE")
})

it("iso split", async () => {
	const split = root(
		`${ENV}const start = createIsomorphicFn();\nexport const pick = start.server(() => "SERVER_SIDE").client(() => "CLIENT_SIDE");\n`,
	)
	await expect(build(split, "client")).rejects.toThrow(
		/src\/mod\.ts: createIsomorphicFn needs \.server\(\) and \.client\(\) in one expression/,
	)
})

it("iso order", async () => {
	const order = root(
		`${ENV}export const pick = createIsomorphicFn().client(() => "CLIENT_SIDE").server(() => "SERVER_SIDE");\n`,
	)
	const client = await build(order, "client")
	expect(client).toContain("CLIENT_SIDE")
	expect(client).not.toContain("SERVER_SIDE")
	const server = await build(order, "ssr")
	expect(server).toContain("SERVER_SIDE")
	expect(server).not.toContain("CLIENT_SIDE")
})

it("quote in a regex", async () => {
	const quoted = root(
		`const quote = /"'\`/;\nReflect.set(globalThis, "quote", quote);\n${ENV}export const read = createServerOnlyFn(() => "SECRET_REGEX");\n`,
	)
	const client = await build(quoted, "client")
	expect(client).not.toContain("SECRET_REGEX")
	expect(await build(quoted, "ssr")).toContain("SECRET_REGEX")
})
