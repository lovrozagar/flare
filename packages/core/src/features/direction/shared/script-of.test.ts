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

// `und` parses, so it does not take the default.
it("unknown", () => {
	expect(dirOf("und", "rtl")).toBe("ltr");
});

it("absent", () => {
	expect(dirOf(undefined, "rtl")).toBe("rtl");
	expect(dirOf("", "rtl")).toBe("rtl");
});

it("throws", () => {
	expect(dirOf("en_US", "rtl")).toBe("rtl");
});

it("text info", () => {
	const info = vi.spyOn(Intl.Locale.prototype, "getTextInfo");
	info.mockImplementation(() => {
		throw new Error("no text info");
	});
	expect(dirOf("ar", "rtl")).toBe("rtl");
	expect(dirOf("ar", "ltr")).toBe("ltr");
	// A direction other than ltr or rtl is the default too.
	info.mockReturnValue({ direction: "ttb" });
	expect(dirOf("ar", "rtl")).toBe("rtl");
});
