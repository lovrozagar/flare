import { afterEach, expect, it, vi } from "vitest";
import { dirOf } from "./script-of.ts";

afterEach(() => {
	vi.restoreAllMocks();
});

it("latin", () => {
	expect(dirOf("en", "rtl")).toBe("ltr");
});

it("arabic", () => {
	expect(dirOf("ar", "ltr")).toBe("rtl");
});

// The script subtag decides, so a language no list names still resolves.
it("script data", () => {
	expect(dirOf("xx-Arab", "ltr")).toBe("rtl");
});

// Arabic in Nastaliq is right-to-left. Bun's ICU maximizes `ur` and `ks` to `Aran`, where Node's gives `Arab`, so a
// Bun server would otherwise render Urdu ltr (BUGS.md B26).
it("aran", () => {
	expect(dirOf("ur-Aran", "ltr")).toBe("rtl");
});

// `und` parses, so it does not take the default.
it("unknown", () => {
	expect(dirOf("und", "rtl")).toBe("ltr");
	// A language with no likely script maximizes to none, and no script is a right-to-left one.
	expect(dirOf("xx", "rtl")).toBe("ltr");
});

it("absent", () => {
	expect(dirOf(undefined, "rtl")).toBe("rtl");
	expect(dirOf("", "rtl")).toBe("rtl");
});

it("throws", () => {
	expect(dirOf("en_US", "rtl")).toBe("rtl");
});

// Firefox 151 has no getTextInfo. The result comes from the maximized script, so it never depends on it.
it("no text info", () => {
	const descriptor = Object.getOwnPropertyDescriptor(Intl.Locale.prototype, "getTextInfo");
	Reflect.deleteProperty(Intl.Locale.prototype, "getTextInfo");
	try {
		expect(["ar", "he", "fa", "ur", "en", "hr"].map((tag) => dirOf(tag, "ltr"))).toEqual([
			"rtl",
			"rtl",
			"rtl",
			"rtl",
			"ltr",
			"ltr",
		]);
		expect(dirOf("en", "rtl")).toBe("ltr");
	} finally {
		if (descriptor !== undefined) Object.defineProperty(Intl.Locale.prototype, "getTextInfo", descriptor);
	}
});
