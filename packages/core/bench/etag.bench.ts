import { bench, describe } from "vitest"
import { weakMatch } from "../src/server-handler/etag"

describe("weakMatch", () => {
	const etag = 'W/"abc123"'

	bench("single value — match", () => {
		weakMatch('W/"abc123"', etag)
	})

	bench("single value — no match", () => {
		weakMatch('W/"xyz789"', etag)
	})

	bench("wildcard", () => {
		weakMatch("*", etag)
	})

	bench("multi-value — match in 3rd position", () => {
		weakMatch('W/"aaa", W/"bbb", W/"abc123", W/"ddd"', etag)
	})

	bench("multi-value — no match", () => {
		weakMatch('W/"aaa", W/"bbb", W/"ccc", W/"ddd"', etag)
	})
})
