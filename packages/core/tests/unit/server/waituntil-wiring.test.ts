/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from "vitest"
import type { MiddlewareContext } from "../../../src/middleware/index.ts"

vi.mock("virtual:flare-is-dev", () => ({ default: false }))

import { createServer } from "../../../src/server/index.ts"
import { background } from "../../../src/server-context/index.ts"
import { buildRouter } from "../../integration/fixtures.ts"

function dataReq(path: string): Request {
	return new Request(`http://localhost${path}`, {
		headers: { "x-d": "1" },
	})
}

describe("waitUntil wiring", () => {
	it(".fetch(req, env, { waitUntil }) makes background() delegate to it", async () => {
		const waitUntil = vi.fn()
		let bgPromise: Promise<unknown> | undefined

		const server = createServer(buildRouter()).use(async (ctx: MiddlewareContext) => {
			bgPromise = Promise.resolve("bg-work")
			background(bgPromise)
			return ctx.next()
		})

		await server.fetch(dataReq("/home"), {}, { waitUntil })
		expect(waitUntil).toHaveBeenCalledWith(bgPromise)
	})

	it("without third arg background() fire-and-forgets", async () => {
		let bgRan = false

		const server = createServer(buildRouter()).use(async (ctx: MiddlewareContext) => {
			background(
				new Promise<void>((resolve) => {
					bgRan = true
					resolve()
				}),
			)
			return ctx.next()
		})

		await server.fetch(dataReq("/home"))
		expect(bgRan).toBe(true)
	})
})
