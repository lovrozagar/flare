import { bench, describe } from "vitest"
import {
	formatChunkMessage,
	formatDoneMessage,
	formatLoaderMessage,
	formatReadyMessage,
	serializeLoaderData,
} from "../src/ndjson-server"

describe("serializeLoaderData", () => {
	bench("flat object", () => {
		serializeLoaderData({ count: 42, name: "test", tags: ["a", "b"] })
	})

	bench("nested object", () => {
		serializeLoaderData({
			meta: { createdAt: "2026-01-01", updatedAt: "2026-03-01" },
			user: { id: 1, name: "Alice", posts: [{ id: 1, title: "Hello" }] },
		})
	})

	bench("null/undefined values", () => {
		serializeLoaderData({ a: null, b: undefined, c: "valid" })
	})
})

describe("formatLoaderMessage", () => {
	const match = {
		headConfig: undefined,
		headersError: undefined,
		loaderData: { items: [1, 2, 3], total: 100 },
		matchId: '/users/[id]::p={"id":"42"}',
		preloaderContext: undefined,
		route: { virtualPath: "/users/[id]" },
	}

	bench("with loader data", () => {
		formatLoaderMessage(match as never)
	})
})

describe("formatChunkMessage", () => {
	bench("deferred chunk", () => {
		formatChunkMessage("/users/[id]::p={}", "comments", { items: [1, 2, 3] })
	})
})

describe("message formatting", () => {
	bench("ready message", () => {
		formatReadyMessage()
	})

	bench("done message", () => {
		formatDoneMessage()
	})
})
