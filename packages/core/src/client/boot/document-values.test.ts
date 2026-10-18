import { expect, it } from "vitest"
import { deferredFailure, documentValueKey } from "../../shared/protocol/deferred-failure.ts"
import type { HydrationValue } from "@solidjs/web"
import type { Pending } from "../navigation/frames.ts"
import { settleDocumentValues } from "./document-values.ts"

// Each slot the document wrote a value for settles from it: a value resolves it, a failure rejects it with the error an
// `e` frame gives, a pending value settles when it streams in, and a slot with no value is left alone (BUGS.md 375).
it("settles slots", async () => {
	const ids = ["_root_/p\na", "_root_/p\nb", "_root_/p\nc", "_root_/p\nd", "_root_/p\ne", "_root_/p\nf", "_root_/p\ng"]
	const pending: Pending = new Map(ids.map((id) => [id, Promise.withResolvers<unknown>()]))
	for (const slot of pending.values()) slot.promise.catch(() => undefined)
	const failure = deferredFailure({ name: "TypeError", message: "stats down" })
	const thrown = new Error("raw")
	const values: Record<string, HydrationValue> = {
		[documentValueKey("_root_/p\na")]: { status: "resolved", value: "five stars" },
		[documentValueKey("_root_/p\nb")]: { status: "resolved", value: failure },
		[documentValueKey("_root_/p\nc")]: { status: "rejected", error: thrown },
		[documentValueKey("_root_/p\nd")]: { status: "pending", promise: Promise.resolve("later") },
		[documentValueKey("_root_/p\ne")]: { status: "pending", promise: Promise.resolve(failure) },
		[documentValueKey("_root_/p\nf")]: { status: "pending", promise: Promise.reject(thrown) },
	}
	const taken: string[] = []
	settleDocumentValues(pending, (key) => (taken.push(key), values[key]))
	expect(taken).toEqual(ids.map((id) => `flare:${id}`))
	const slot = (id: string) => pending.get(`_root_/p\n${id}`)?.promise
	await expect(slot("a")).resolves.toBe("five stars")
	await expect(slot("b")).rejects.toMatchObject({ name: "TypeError", message: "stats down" })
	await expect(slot("c")).rejects.toBe(thrown)
	await expect(slot("d")).resolves.toBe("later")
	await expect(slot("e")).rejects.toMatchObject({ name: "TypeError", message: "stats down" })
	await expect(slot("f")).rejects.toBe(thrown)
	const race = await Promise.race([slot("g"), Promise.resolve("open")])
	expect(race).toBe("open")
})
