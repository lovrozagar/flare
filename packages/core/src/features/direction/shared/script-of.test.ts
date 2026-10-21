import { afterEach, expect, it, vi } from "vitest"
import { dirOf } from "./script-of.ts"

afterEach(() => {
	vi.restoreAllMocks()
})

it("latin", () => {
	expect(dirOf("en", "rtl")).toBe("ltr")
})

it("arabic", () => {
	expect(dirOf("ar", "ltr")).toBe("rtl")
})

// The script subtag decides, so a language no list names still resolves.
it("script data", () => {
	expect(dirOf("xx-Arab", "ltr")).toBe("rtl")
})

// Arabic in Nastaliq is right-to-left. Bun's ICU maximizes `ur` and `ks` to `Aran`, where Node's gives `Arab`, so a
// Bun server would otherwise render Urdu ltr (BUGS.md B26).
it("aran", () => {
	expect(dirOf("ur-Aran", "ltr")).toBe("rtl")
})

// `und` parses, so it does not take the default.
it("unknown", () => {
	expect(dirOf("und", "rtl")).toBe("ltr")
	// A language with no likely script maximizes to none, and no script is a right-to-left one.
	expect(dirOf("xx", "rtl")).toBe("ltr")
})

it("absent", () => {
	expect(dirOf(undefined, "rtl")).toBe("rtl")
	expect(dirOf("", "rtl")).toBe("rtl")
})

it("throws", () => {
	expect(dirOf("en_US", "rtl")).toBe("rtl")
})

// Firefox 151 has no getTextInfo. The result comes from the maximized script, so it never depends on it.
it("no text info", () => {
	const descriptor = Object.getOwnPropertyDescriptor(Intl.Locale.prototype, "getTextInfo")
	Reflect.deleteProperty(Intl.Locale.prototype, "getTextInfo")
	try {
		expect(["ar", "he", "fa", "ur", "en", "hr"].map((tag) => dirOf(tag, "ltr"))).toEqual([
			"rtl",
			"rtl",
			"rtl",
			"rtl",
			"ltr",
			"ltr",
		])
		expect(dirOf("en", "rtl")).toBe("ltr")
	} finally {
		if (descriptor !== undefined) Object.defineProperty(Intl.Locale.prototype, "getTextInfo", descriptor)
	}
})

// Dari and the tags that canonicalize to it are rtl on every runtime: Bun's ICU canonicalizes `drw` and `tnf` to
// `prs` but maximizes `prs` to no script, so the server and the browser disagreed (dx/features.md Direction, BUGS.md 433).
it("dari", () => {
	for (const tag of ["prs", "drw", "tnf", "prs-AF"]) expect([tag, dirOf(tag, "ltr")]).toEqual([tag, "rtl"])
})

// A runtime that maximizes a tag to no script, as Bun's ICU does for Dari: its alias gives the script, and a language
// with no alias is ltr. Node canonicalizes `prs` before `maximize`, so a one-shot stub stands for Bun there, and the
// alias itself maximizes for real (BUGS.md 433).
it("no likely script", () => {
	const maximize = vi.spyOn(Intl.Locale.prototype, "maximize")
	maximize.mockImplementationOnce(() => ({ language: "prs" }) as Intl.Locale)
	expect(dirOf("prs", "ltr")).toBe("rtl")
	maximize.mockImplementationOnce(() => ({ language: "xq" }) as Intl.Locale)
	expect(dirOf("xq", "rtl")).toBe("ltr")
	maximize.mockRestore()
})
