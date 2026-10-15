import { expect, expectTypeOf, it, vi } from "vitest"
import { createMiddleware, runMiddleware, type RunInput } from "./run.ts"
import type { Middleware, MiddlewareEntry } from "./types.ts"

const ok = (body: string, status = 200): Response => new Response(body, { status })

function input(extra: Partial<RunInput> = {}): RunInput {
	return {
		request: new Request("http://localhost/about?q=1"),
		env: { site: "s" },
		kind: "page",
		fail: () => ok("", 500),
		...extra,
	}
}

const twice: Middleware = async (ctx) => {
	await ctx.next()
	await ctx.next()
}

const throwsAfter: Middleware = async (ctx) => {
	await ctx.next()
	throw new Error("after")
}

const keep: Middleware = async (ctx) => {
	await ctx.next()
	return undefined
}

const odd: Middleware = async (ctx) => {
	await ctx.next()
	return JSON.parse("1")
}

it("order", async () => {
	const seen: string[] = []
	const first: Middleware = async (ctx) => {
		seen.push("first")
		const response = await ctx.next()
		seen.push("first after")
		return response
	}
	const second: Middleware = () => void seen.push("second")
	const result = await runMiddleware([first, second], input(), async () => {
		seen.push("router")
		return ok("page")
	})
	expect(seen).toEqual(["first", "second", "router", "first after"])
	expect(await result.text()).toBe("page")
})

it("respond", async () => {
	const second = vi.fn<Middleware>()
	const router = vi.fn<() => Promise<Response>>(async () => ok("page"))
	const result = await runMiddleware([(ctx) => ctx.respond(ok("early")), second], input(), router)
	expect(await result.text()).toBe("early")
	expect(second).not.toHaveBeenCalled()
	expect(router).not.toHaveBeenCalled()
})

it("bypass", async () => {
	const router = vi.fn<() => Promise<Response>>(async () => ok("page"))
	const result = await runMiddleware([(ctx) => ctx.bypass(ok("mine", 202))], input(), router)
	expect(result.status).toBe(202)
	expect(router).not.toHaveBeenCalled()
})

it("second next", async () => {
	const fail = vi.fn<RunInput["fail"]>(() => ok("", 500))
	const result = await runMiddleware([twice], input({ fail }), async () => ok("page"))
	expect(result.status).toBe(500)
	expect(String(fail.mock.calls[0]?.[0])).toMatch(/next\(\) twice/)
})

it("onResponse throw", async () => {
	const cancel = vi.fn<() => void>()
	const body = new ReadableStream({ cancel })
	const result = await runMiddleware([throwsAfter], input(), async () => new Response(body))
	expect(result.status).toBe(500)
	expect(cancel).toHaveBeenCalledOnce()
})

it("after sees redirect", async () => {
	const statuses: number[] = []
	const watch: Middleware = async (ctx) => void statuses.push((await ctx.next()).status)
	const result = await runMiddleware([watch], input(), async () => new Response(null, { status: 303 }))
	expect(statuses).toEqual([303])
	expect(result.status).toBe(303)
})

it("throw before", async () => {
	const after = vi.fn<() => void>()
	const fail = vi.fn<RunInput["fail"]>(() => ok("", 500))
	const wrap: Middleware = async (ctx) => {
		await ctx.next()
		after()
	}
	const result = await runMiddleware([wrap], input({ fail }), async () => {
		throw new Error("router broke")
	})
	expect(after).not.toHaveBeenCalled()
	expect(result.status).toBe(500)
	expect(String(fail.mock.calls[0]?.[0])).toMatch(/router broke/)
})

// The canonical step runs first (02-system step 2), so `path` is the canonical pathname, without the query.
it("path is canonical", async () => {
	const paths: string[] = []
	await runMiddleware([(ctx) => void paths.push(ctx.path)], input(), async () => ok("page"))
	expect(paths).toEqual(["/about"])
})

const replace: Middleware = async (ctx) => {
	await ctx.next()
	return ok("replaced")
}

it("return replaces", async () => {
	const cancel = vi.fn<() => void>()
	const result = await runMiddleware([replace], input(), async () => new Response(new ReadableStream({ cancel })))
	expect(await result.text()).toBe("replaced")
	expect(cancel).toHaveBeenCalledOnce()
	expect(await (await runMiddleware([keep], input(), async () => ok("page"))).text()).toBe("page")
	// Any other return is ignored. An untyped caller can return a number.
	expect(await (await runMiddleware([odd], input(), async () => ok("page"))).text()).toBe("page")
})

const rewrap: Middleware = async (ctx) => {
	const response = await ctx.next()
	return new Response(response.body, response)
}

// `new Response(res.body, res)` carries the router's own stream, so it is not cancelled.
it("rewrap keeps body", async () => {
	expect(await (await runMiddleware([rewrap], input(), async () => ok("page"))).text()).toBe("page")
})

// Unhandled rejections raised while `run` settles: a `void` promise that rejects ends a Node or Bun server (B1).
async function rejections(run: () => Promise<Response>): Promise<{ text: string; escaped: unknown[] }> {
	const escaped: unknown[] = []
	const record = (reason: unknown): void => void escaped.push(reason)
	process.on("unhandledRejection", record)
	try {
		const text = await (await run()).text()
		await new Promise((resolve) => setTimeout(resolve, 0))
		return { text, escaped }
	} finally {
		process.off("unhandledRejection", record)
	}
}

// Bun's `new Response(res.body, res)` is another stream object, and the hand-off locks the router's.
const piped: Middleware = async (ctx) => {
	const response = await ctx.next()
	return new Response(response.body?.pipeThrough(new TransformStream()), response)
}

it("rewrap new stream", async () => {
	const result = await rejections(() => runMiddleware([piped], input(), async () => ok("page")))
	expect(result).toEqual({ text: "page", escaped: [] })
})

it("discard rejection ignored", async () => {
	const errored = new ReadableStream({
		start(controller) {
			controller.error(new Error("render broke"))
		},
	})
	const result = await rejections(() => runMiddleware([replace], input(), async () => new Response(errored)))
	expect(result).toEqual({ text: "replaced", escaped: [] })
})

// Returning without next, respond, or bypass continues the chain (dx/server.md).
const skip: Middleware = (ctx) => {
	if (ctx.path === "/other") ctx.respond(ok("other"))
}

it("skip continues", async () => {
	expect(await (await runMiddleware([skip], input(), async () => ok("page"))).text()).toBe("page")
})

it("create middleware", async () => {
	const handler = createMiddleware((ctx) => ctx.respond(ok(`kind:${ctx.kind}`)))
	expectTypeOf(handler).toEqualTypeOf<Middleware>()
	const entries: MiddlewareEntry[] = [
		{ filter: { prefix: ["/admin"] }, handler },
		{ filter: { kind: ["page"] }, handler },
	]
	const result = await runMiddleware(entries, input(), async () => ok("page"))
	expect(await result.text()).toBe("kind:page")
	const filtered = await runMiddleware([{ filter: { prefix: ["/admin"] }, handler }], input(), async () => ok("x"))
	expect(await filtered.text()).toBe("x")
})
