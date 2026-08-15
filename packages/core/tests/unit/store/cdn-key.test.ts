import { describe, expect, it } from "vitest";
import { keyToPath } from "../../../src/store/filesystem.ts";

describe("keyToPath cdn: prefix", () => {
	it("cdn:GET:/about → cdn/GET___about.json", () => {
		expect(keyToPath("cdn:GET:/about")).toBe("cdn/GET___about.json");
	});

	it("cdn:GET:/ → cdn/GET___.json (root)", () => {
		expect(keyToPath("cdn:GET:/")).toBe("cdn/GET___.json");
	});

	it("cdn:GET:/about:accept-language=en → cdn/GET___about__accept-language=en.json", () => {
		expect(keyToPath("cdn:GET:/about:accept-language=en")).toBe("cdn/GET___about__accept-language=en.json");
	});

	it("cdn: prefix routes to cdn/ subdir, not other/", () => {
		const result = keyToPath("cdn:GET:/page");
		expect(result.startsWith("cdn/")).toBe(true);
	});

	it("static: still routes to static/", () => {
		expect(keyToPath("static:/about")).toBe("static/_about.json");
	});

	it("flare: still routes to loader/", () => {
		expect(keyToPath("flare:test")).toBe("loader/test.json");
	});
});
