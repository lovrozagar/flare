import { markSafeError } from "@solidjs/web"
import { expect, it } from "vitest"
import { notFound } from "../../shared/errors/index.ts"
import { streamOptions, thrownBehind } from "./stream-options.ts"

const signal = new AbortController().signal

function hookOf(onRenderError?: (error: unknown) => void) {
	const hook = streamOptions(signal, "", onRenderError).onError ?? (() => undefined)
	return (error: unknown, site: object): unknown => Reflect.apply(hook, undefined, [error, site])
}

// Solid reports each error it handles to the stream's hook. A fragment that rejected after the shell reaches
// `onRenderError`; a failed render, which the slot boundary reports, and a value Solid could not serialize do not. A
// kind that is no render is left to Solid (plan 21 3.2).
it("render errors", () => {
	const errors: unknown[] = []
	const hook = hookOf((error) => void errors.push(error))
	const sites = [
		{ kind: "render", handling: "client" },
		{ kind: "render", handling: "fallback" },
		{ kind: "render", handling: "serialize" },
	] as const
	for (const site of sites) hook(new Error(site.handling), site)
	expect(errors.map((error) => Reflect.get(Object(error), "message"))).toEqual(["client"])
	expect(hook(new Error("x"), { kind: "serialize" })).toBeUndefined()
	const quiet = streamOptions(signal, "abc", undefined)
	expect(quiet.nonce).toBe("abc")
})

// What Solid gets in place of a render error: a bug becomes a generic error tied to the thrown value, which the
// projector reads back; a named status is the app's answer and passes as itself; a safe error keeps Solid's own
// handling (BUGS.md 217).
it("in place", () => {
	const hook = hookOf()
	const site = { kind: "render", handling: "fallback" }
	const bug = new Error("page broke")
	const shown = hook(bug, site)
	expect([Reflect.get(Object(shown), "message"), thrownBehind(shown)]).toEqual(["Internal Server Error", bug])
	const missing = (() => {
		try {
			return notFound()
		} catch (error) {
			return error
		}
	})()
	expect(hook(missing, site)).toBe(missing)
	expect(hook(markSafeError(new Error("shown")), site)).toBeUndefined()
	expect([thrownBehind(bug), thrownBehind("text"), thrownBehind(null)]).toEqual([bug, "text", null])
})
