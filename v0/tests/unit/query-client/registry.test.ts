/**
 * Registry Unit Tests
 *
 * Tests type-safe QueryClient registration system.
 */

import { describe, expect, it } from "vitest"
import type {
	FlareQueryClientRegistry,
	ResolvedQueryClient,
} from "../../../src/query-client/registry"

describe("FlareQueryClientRegistry", () => {
	it("default registry is empty interface", () => {
		/* Registry should be defined but empty by default */
		const registry: FlareQueryClientRegistry = {}
		expect(registry).toEqual({})
	})
})

describe("ResolvedQueryClient type", () => {
	it("resolves to null when registry is empty", () => {
		/* Without augmentation, ResolvedQueryClient should be null */
		type Expected = null
		const assertType: ResolvedQueryClient extends Expected ? true : false = true
		expect(assertType).toBe(true)
	})
})
