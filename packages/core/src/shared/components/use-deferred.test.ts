import { createComponent, Loading, type Element } from "solid-js"
import { expect, expectTypeOf, it } from "vitest"
import { createRouter } from "../router/create-router.ts"
import { renderDocument } from "../../server/render/document.ts"
import { createDefer } from "../../server/loaders/defer.ts"
import type { Deferred } from "../route-builder/register.ts"
import { useDeferred } from "./use-deferred.ts"

const router = createRouter({ layouts: {}, routeTree: [] })

// A slot that reads one deferred value under <Loading>, as dx/defer.md shows.
function slot(deferred: Deferred<string>): Element {
	return createComponent(Loading, {
		fallback: "waiting",
		get children() {
			const value = useDeferred(() => deferred)
			return [() => value()]
		},
	})
}

async function rendered(deferred: Deferred<string>): Promise<{ shell: string; whole: () => Promise<string> }> {
	const body = await renderDocument({
		request: new Request("http://localhost/"),
		router,
		matches: [],
		render: () => slot(deferred),
	})
	const reader = body.getReader()
	const decoder = new TextDecoder()
	const shell = decoder.decode((await reader.read()).value)
	return {
		shell,
		whole: async () => {
			let rest = shell
			for (let next = await reader.read(); !next.done; next = await reader.read()) rest += decoder.decode(next.value)
			return rest
		},
	}
}

// A live deferred value is an ordinary async read: the document streams it, and no client boundary is handed over.
it("live value", async () => {
	const held = Promise.withResolvers<string>()
	const live = createDefer({ stored: false, dev: false }).defer(() => held.promise)
	expect(live.hole).toBeUndefined()
	const document = await rendered(live)
	expect(document.shell).toContain("waiting")
	held.resolve("LIVE")
	const whole = await document.whole()
	expect(whole).toContain("LIVE")
	expect(whole).not.toContain("$$f")
})

// A deferred value with no document view, as the client's slot is, is read through its promise (BUGS.md 375).
it("slot value", async () => {
	const slot: Deferred<string> = { __deferred: true, key: "k", promise: Promise.resolve("SLOT") }
	const document = await rendered(slot)
	expect(await document.whole()).toContain("SLOT")
})

// A stored `"stream"` value the render did not run is a hole: the server renders the fallback and hands the
// position to the client as a final boundary, so the document ends and hydration never waits on it.
it("stored hole", async () => {
	const hole = createDefer({ stored: true, route: "stream", dev: false }).defer(() => Promise.resolve("never run"))
	expect(hole.hole).toBe(true)
	const document = await rendered(hole)
	const whole = await document.whole()
	expect(whole).toContain("waiting")
	expect(whole).toContain("$$f")
	expect(whole).not.toContain("never run")
})

// A document's value that rejected reaches the render as its failure, which the read throws: Solid contains the
// region for the client to render again, and the hydration data carries the failure as a resolved value, so the client
// throws the same error into its <Errored> (tests/integration/defer.test.ts `streamed rejection early`). The
// rejection itself never reaches Solid, whose data would leave the client nothing to read (BUGS.md 374).
it("failed value", async () => {
	const live = createDefer({ stored: false, dev: false })
	const failing = live.defer(() => Promise.reject(new Error("down")))
	live.started[0]?.document((error) => ({ name: "Error", message: (error as Error).message }))
	const document = await rendered(failing)
	const whole = await document.whole()
	expect(whole).toContain("__deferredFailure:!0,error:$R")
	expect(whole).toContain('message:"down"')
})

// Only an accessor type-checks. A plain value would read loader data untracked in the component body and keep the
// first value, so it is not accepted.
it("plain value", () => {
	const deferred = createDefer({ stored: false, dev: false }).defer(() => Promise.resolve("x"))
	expectTypeOf(useDeferred<string>)
		.parameter(0)
		.toEqualTypeOf<() => Deferred<string>>()
	// @ts-expect-error a plain Deferred is not an accessor
	expectTypeOf(useDeferred<string>).toBeCallableWith(deferred)
})
