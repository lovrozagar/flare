import { expect, it } from "vitest"
import { streamOptions } from "./stream-options.ts"

// Solid reports each error it handles to the stream's hook. A fragment that rejected after the shell reaches
// `onRenderError`; a failed render, which the slot boundary reports, a value Solid could not serialize, and any other
// kind do not. The hook maps nothing, so Solid's own handling stays (plan 21 3.2).
it("render errors", () => {
	const errors: unknown[] = []
	const signal = new AbortController().signal
	const hook = streamOptions(signal, "", (error) => void errors.push(error)).onError ?? (() => undefined)
	const sites = [
		{ kind: "render", handling: "client" },
		{ kind: "render", handling: "failed" },
		{ kind: "render", handling: "serialize" },
		{ kind: "serialize" },
	] as const
	const mapped = sites.map((site) => Reflect.apply(hook, undefined, [Reflect.get(site, "handling") ?? site.kind, site]))
	expect([errors, mapped]).toEqual([["client"], [undefined, undefined, undefined, undefined]])
	const quiet = streamOptions(signal, "abc", undefined)
	expect([Reflect.apply(quiet.onError ?? (() => undefined), undefined, ["x", sites[0]]), quiet.nonce]).toEqual([
		undefined,
		"abc",
	])
})
