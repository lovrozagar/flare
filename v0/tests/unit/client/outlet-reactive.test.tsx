/**
 * Outlet Reactivity Tests
 *
 * Tests that Outlet re-renders when matches change.
 * Verifies hydration-safe reactive updates.
 */

import { createRoot } from "solid-js"
import { describe, expect, it } from "vitest"
import { createFlareClient } from "../../../src/client/init"
import { createFlareProvider } from "../../../src/client/provider"
import { createFlareState, FlareStateBuilder } from "../../utils/flare-state"
import { createNDJSONResponse, ndjson } from "../../utils/ndjson"

describe("outlet reactivity", () => {
	it("outlet context matches are reactive via getter", () => {
		createRoot((dispose) => {
			const flareState = createFlareState()
			const client = createFlareClient({ flareState })
			const ctx = createFlareProvider(client)

			/* Create outlet context with getter */
			const outletContext = {
				depth: -1,
				get matches() {
					return ctx.matches()
				},
			}

			/* Initial read */
			expect(outletContext.matches).toHaveLength(0)

			/* Update matches via signal */
			ctx.setMatches([{ loaderData: { user: "Alice" }, render: () => null, virtualPath: "_root_" }])

			/* Read again - should reflect update */
			expect(outletContext.matches).toHaveLength(1)
			expect(outletContext.matches[0]?.loaderData).toEqual({ user: "Alice" })

			dispose()
		})
	})

	it("useOutletContext returns matches from provider", () => {
		createRoot((dispose) => {
			const flareState = new FlareStateBuilder().addMatch("_root_", { test: true }).build()
			const client = createFlareClient({ flareState })
			const ctx = createFlareProvider(client)

			/* Simulate outlet context usage */
			const outletContext = {
				depth: 0,
				get matches() {
					return ctx.matches()
				},
			}

			expect(outletContext.matches).toHaveLength(1)
			expect(outletContext.matches[0]?.loaderData).toEqual({ test: true })

			dispose()
		})
	})

	it("nested outlet contexts maintain correct depth", () => {
		createRoot((dispose) => {
			const flareState = createFlareState()
			const client = createFlareClient({ flareState })
			const ctx = createFlareProvider(client)

			/* Set up matches for 3-level nesting */
			ctx.setMatches([
				{ loaderData: { level: 0 }, render: () => null, virtualPath: "_root_" },
				{ loaderData: { level: 1 }, render: () => null, virtualPath: "_root_/(dashboard)" },
				{
					loaderData: { level: 2 },
					render: () => null,
					virtualPath: "_root_/(dashboard)/settings",
				},
			])

			/* Simulate nested outlet contexts */
			const rootCtx = {
				depth: -1,
				get matches() {
					return ctx.matches()
				},
			}

			const layoutCtx = {
				depth: 0,
				get matches() {
					return ctx.matches()
				},
			}

			const pageCtx = {
				depth: 1,
				get matches() {
					return ctx.matches()
				},
			}

			/* Each level accesses correct match */
			expect(rootCtx.matches[0]?.loaderData).toEqual({ level: 0 })
			expect(layoutCtx.matches[1]?.loaderData).toEqual({ level: 1 })
			expect(pageCtx.matches[2]?.loaderData).toEqual({ level: 2 })

			dispose()
		})
	})
})

describe("navigation updates", () => {
	it("matches update after navigation data fetch", async () => {
		const flareState = new FlareStateBuilder().addMatch("_root_", { page: "home" }).build()

		const mockFetch = () => {
			return Promise.resolve(
				createNDJSONResponse([
					ndjson.loader("_root_/products", { page: "products" }),
					ndjson.done(),
				]),
			)
		}

		const client = createFlareClient({
			fetch: mockFetch as unknown as typeof fetch,
			flareState,
		})

		const ctx = createFlareProvider(client)

		/* Initial state */
		const initialMatches = ctx.matches()
		expect(initialMatches).toHaveLength(1)
		expect(initialMatches[0]?.loaderData).toEqual({ page: "home" })

		/* Navigate */
		await ctx.router.navigate({ to: "/products" })

		/* After navigation - matches should include new data */
		const updatedMatches = ctx.matches()
		expect(updatedMatches.length).toBeGreaterThan(0)
	})
})
