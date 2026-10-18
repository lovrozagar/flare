import { expect, it } from "vitest"
import type { Deferred } from "../../shared/route-builder/register.ts"
import { createDefer, type DeferScope } from "./defer.ts"

const live: DeferScope = { stored: false, dev: false }

function wire(value: Deferred<unknown>): unknown {
	return JSON.parse(JSON.stringify(value))
}

function settledYet(promise: Promise<unknown>): Promise<boolean> {
	const pending = Symbol("pending")
	return Promise.race([promise, Promise.resolve(pending)]).then((value) => value !== pending)
}

it("placeholder", async () => {
	const loader = createDefer(live)
	const value = loader.defer(() => Promise.resolve(1))
	expect(wire(value)).toEqual({ __deferred: true, key: "d0" })
	await expect(value.promise).resolves.toBe(1)
	expect(loader.held).toEqual([])
})

it("key default", () => {
	const { defer } = createDefer(live)
	expect(defer(() => Promise.resolve(1)).key).toBe("d0")
	expect(defer(() => Promise.resolve(2)).key).toBe("d1")
	expect(createDefer(live).defer(() => Promise.resolve(3)).key).toBe("d0")
})

it("nested", async () => {
	const { defer } = createDefer(live)
	const inner: Deferred<number>[] = []
	let innerRan = false
	defer(() => {
		inner.push(
			defer(() => {
				innerRan = true
				return Promise.resolve(2)
			}),
		)
		return Promise.resolve(1)
	})
	expect(innerRan).toBe(false)
	expect(wire(inner[0])).toEqual({ __deferred: true, key: "d1" })
	expect(await settledYet(inner[0].promise)).toBe(false)
	const dev = createDefer({ stored: false, dev: true })
	expect(() =>
		dev.defer(() => {
			dev.defer(() => Promise.resolve(2))
			return Promise.resolve(1)
		}),
	).toThrow("defer")
	await expect(dev.defer(() => Promise.resolve(3)).promise).resolves.toBe(3)
})

it("dedupe", async () => {
	const { defer } = createDefer(live)
	let second = false
	const first = defer(() => Promise.resolve(1), { key: "reviews" })
	const again = defer(
		() => {
			second = true
			return Promise.resolve(2)
		},
		{ key: "reviews" },
	)
	expect(second).toBe(false)
	expect(again.promise).toBe(first.promise)
	await expect(again.promise).resolves.toBe(1)
})

it("call overrides route", async () => {
	const streamRoute = createDefer({ stored: true, route: "stream", dev: false })
	let streamed = false
	const awaited = streamRoute.defer(() => Promise.resolve(1), { prerender: "resolve" })
	const hole = streamRoute.defer(() => {
		streamed = true
		return Promise.resolve(2)
	})
	expect(streamRoute.held).toEqual([awaited.promise])
	await expect(awaited.promise).resolves.toBe(1)
	expect(streamed).toBe(false)
	expect(await settledYet(hole.promise)).toBe(false)
	const resolveRoute = createDefer({ stored: true, dev: false })
	let ran = false
	resolveRoute.defer(
		() => {
			ran = true
			return Promise.resolve(3)
		},
		{ prerender: "stream" },
	)
	const plain = resolveRoute.defer(() => Promise.resolve(5))
	expect(ran).toBe(false)
	expect(resolveRoute.held).toEqual([plain.promise])
	const notStored = createDefer(live)
	await expect(notStored.defer(() => Promise.resolve(4), { prerender: "stream" }).promise).resolves.toBe(4)
	expect(notStored.held).toEqual([])
})

it("started", async () => {
	const loader = createDefer(live)
	const first = loader.defer(() => Promise.resolve("a"))
	loader.defer(() => Promise.reject(new Error("b")))
	loader.defer(() => Promise.resolve("again"), { key: "d0" })
	expect(loader.started.map((entry) => entry.key)).toEqual(["d0", "d1"])
	expect(loader.started[0].promise).toBe(first.promise)
	await expect(loader.started[1].promise).rejects.toThrow("b")
	const stored = createDefer({ stored: true, route: "stream", dev: false })
	stored.defer(() => Promise.resolve(1))
	expect(stored.started).toEqual([])
})

it("prefetch skip", async () => {
	const calls: string[] = []
	const loader = createDefer({ stored: false, dev: false, prefetch: true })
	const value = loader.defer(() => {
		calls.push("ran")
		return Promise.resolve(1)
	})
	expect(wire(value)).toEqual({ __deferred: true, key: "d0" })
	expect(calls).toEqual([])
	expect(loader.started).toEqual([])
	expect(await settledYet(value.promise)).toBe(false)
})

// A stored render inlines each value it resolved, so the stored state is the client's one source for it and the fill
// need not run it again (BUGS.md 94). A hole stays a placeholder, and a live scope never inlines.
it("stored value inline", async () => {
	const stored = createDefer({ stored: true, route: "stream", dev: false })
	const latest = stored.defer(() => Promise.resolve({ version: "1.0.0" }), { key: "latest", prerender: "resolve" })
	const stats = stored.defer(() => Promise.resolve(1), { key: "stats" })
	expect(wire(latest)).toEqual({ __deferred: true, key: "latest" })
	await latest.promise
	expect(wire(latest)).toEqual({ __deferred: true, key: "latest", value: { version: "1.0.0" } })
	expect(wire(stats)).toEqual({ __deferred: true, key: "stats", hole: true })
	const value = createDefer(live).defer(() => Promise.resolve(1))
	await value.promise
	expect(wire(value)).toEqual({ __deferred: true, key: "d0" })
})

// A fill runs only the values the stored page left as holes, by the store write's own rule: a call's `prerender`
// wins, else the route's mode. A value the stored page holds runs nothing and travels as `kept`, so the client keeps
// the one it shows (BUGS.md 94).
it("fill runs the holes only", async () => {
	const calls: string[] = []
	const run = (name: string) => () => {
		calls.push(name)
		return Promise.resolve(name)
	}
	const fill = createDefer({ stored: false, route: "stream", dev: false, fill: true })
	const latest = fill.defer(run("latest"), { key: "latest", prerender: "resolve" })
	const stats = fill.defer(run("stats"), { key: "stats" })
	expect(calls).toEqual(["stats"])
	expect(fill.started.map((value) => value.key)).toEqual(["stats"])
	expect(JSON.parse(JSON.stringify({ latest, stats }))).toEqual({
		latest: { __deferred: true, key: "latest", kept: true },
		stats: { __deferred: true, key: "stats" },
	})
	await expect(stats.promise).resolves.toBe("stats")
	expect(await settledYet(latest.promise)).toBe(false)
})

// The store write and the fill draw the same line through a route that mixes the two modes: each value runs in
// exactly one of them.
it("store and fill agree", () => {
	for (const route of ["stream", "resolve", undefined] as const) {
		const ran = { stored: [] as string[], fill: [] as string[] }
		for (const kind of ["stored", "fill"] as const) {
			const scope = createDefer({ stored: kind === "stored", route, dev: false, fill: kind === "fill" })
			const run = (name: string) => () => {
				ran[kind].push(name)
				return Promise.resolve(name)
			}
			scope.defer(run("a"), { key: "a", prerender: "resolve" })
			scope.defer(run("b"), { key: "b", prerender: "stream" })
			scope.defer(run("c"), { key: "c" })
		}
		expect([...ran.stored, ...ran.fill].toSorted()).toEqual(["a", "b", "c"])
		expect(ran.stored.filter((name) => ran.fill.includes(name))).toEqual([])
	}
})

const projected = (thrown: unknown) => ({ name: "Error", message: (thrown as Error).message })

// A document's render reads a view of each started value: a rejection resolves to its projected failure, a value stays
// itself, and the started entry keeps the original promise for a data answer's `e` frame. A second view is the first
// (BUGS.md 374).
it("document view", async () => {
	const loader = createDefer(live)
	const error = new Error("down")
	const broken = loader.defer(() => Promise.reject(error))
	const fine = loader.defer(() => Promise.resolve("ok"))
	for (const entry of loader.started) entry.document(projected)
	const first = broken.promise
	loader.started[0]?.document(() => ({ name: "Error", message: "other" }))
	expect(broken.promise).toBe(first)
	await expect(broken.promise).resolves.toEqual({ __deferredFailure: true, error: { name: "Error", message: "down" } })
	await expect(fine.promise).resolves.toBe("ok")
	await expect(loader.started[0]?.promise).rejects.toBe(error)
})
