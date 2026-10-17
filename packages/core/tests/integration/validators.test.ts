import { type } from "arktype"
import { Schema } from "effect"
import { object, size, string, validate, type Struct } from "superstruct"
import Type, { type TSchema } from "typebox"
import { Compile } from "typebox/compile"
import * as v from "valibot"
import { expect, it } from "vitest"
import * as z from "zod"
import { createServer } from "../../src/server/lifecycle/create.ts"
import { createServerFn } from "../../src/server/server-fn/dispatch.ts"
import { fromWire, toWire } from "../../src/shared/protocol/value.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter } from "../../src/shared/router/create-router.ts"

// Six validator libraries, each through a route's `.input({ searchParams })` and a server function's `.input()`, through
// the real createServer (B96): the same `{ q: string of 3 or more }` passes valid input to the render and the handler,
// and fails invalid input as a 400 whose `fieldErrors` names `q` (plan 21 5.4). Zod, Valibot, ArkType, and Effect are
// Standard Schemas. TypeBox and Superstruct are not, so each goes through `{ parse }`, throwing `{ issues }` the way
// dx/server-fn.md shows.

const ORIGIN = "http://localhost"

// TypeBox: a compiled check, its errors as issues by their JSON pointer.
function typebox(schema: TSchema): { parse: (value: unknown) => unknown } {
	const checked = Compile(schema)
	return {
		parse(value) {
			if (checked.Check(value)) return value
			const issues = [...checked.Errors(value)].map((error) => ({
				message: error.message,
				path: error.instancePath.split("/").filter((segment) => segment !== ""),
			}))
			throw { issues }
		},
	}
}

// Superstruct: `validate` gives the failure or the value, its failures as issues.
function superstruct<T>(struct: Struct<T>): { parse: (value: unknown) => T } {
	return {
		parse(value) {
			const [failure, valid] = validate(value, struct)
			if (failure === undefined) return valid
			throw { issues: failure.failures().map((each) => ({ message: each.message, path: each.path.map(String) })) }
		},
	}
}

const LIBRARIES: ReadonlyArray<readonly [string, unknown]> = [
	["zod", z.object({ q: z.string().min(3) })],
	["valibot", v.object({ q: v.pipe(v.string(), v.minLength(3)) })],
	["arktype", type({ q: "string >= 3" })],
	["effect", Schema.standardSchemaV1(Schema.Struct({ q: Schema.String.pipe(Schema.minLength(3)) }))],
	["typebox", typebox(Type.Object({ q: Type.String({ minLength: 3 }) }))],
	["superstruct", superstruct(object({ q: size(string(), 3, Infinity) }))],
]

function app(name: string, validator: unknown) {
	const page = createPage("_root_/p")
		.input({ searchParams: validator as never })
		.render((props) => `got ${String(Reflect.get(Object(props.search), "q"))}`)
	const fn = createServerFn({ method: "post", __id: `${name}fn000000000000`.slice(0, 16), __name: name } as never)
		.input(validator as never)
		.handler(({ input }) => input)
	const router = createRouter({
		layouts: { _root_: createRootLayout("_root_").render((props) => props.children) },
		routeTree: [{ id: "_root_/p", path: "/p", module: page }],
	})
	return { server: createServer({ router, serverFns: { [fn.id]: async () => fn } }), fn }
}

function call(fn: { id: string }, input: unknown): Request {
	return new Request(`${ORIGIN}/_flare/fn/${fn.id}`, {
		method: "POST",
		body: JSON.stringify(toWire(input)),
		headers: { origin: ORIGIN, "content-type": "application/json" },
	})
}

it.each(LIBRARIES)("%s", async (name, validator) => {
	const { server, fn } = app(name, validator)
	const page = await server.fetch(new Request(`${ORIGIN}/p?q=long`))
	expect([page.status, await page.text()]).toEqual([200, expect.stringContaining("got long")])
	const badPage = await server.fetch(new Request(`${ORIGIN}/p?q=a`))
	expect(badPage.status).toBe(400)
	expect(Object.keys(Object((await badPage.json()).fieldErrors))).toEqual(["q"])
	const answer = await server.fetch(call(fn, { q: "long" }))
	const envelope: { status: number; data: unknown } = await answer.json()
	expect([answer.status, fromWire(envelope.data)]).toEqual([200, { q: "long" }])
	const refused = await server.fetch(call(fn, { q: "a" }))
	expect(refused.status).toBe(400)
	expect(Object.keys(Object((await refused.json()).errors.fieldErrors))).toEqual(["q"])
})
