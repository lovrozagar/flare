import { describe, expect, it } from "vitest";
import { buildHreflangLinks } from "../../../src/locale.ts";

describe("buildHreflangLinks", () => {
	const config = {
		defaultLocale: "en",
		locales: ["en", "hr", "de"],
	};

	it("generates links for all locales", () => {
		const links = buildHreflangLinks({
			baseUrl: "https://example.com",
			config,
			pathname: "/about",
		});
		expect(links.en).toBe("https://example.com/about");
		expect(links.hr).toBe("https://example.com/hr/about");
		expect(links.de).toBe("https://example.com/de/about");
	});

	it("includes x-default pointing to default locale URL", () => {
		const links = buildHreflangLinks({
			baseUrl: "https://example.com",
			config,
			pathname: "/about",
		});
		expect(links["x-default"]).toBe("https://example.com/about");
	});

	it("default locale has no prefix", () => {
		const links = buildHreflangLinks({
			baseUrl: "https://example.com",
			config,
			pathname: "/products",
		});
		expect(links.en).toBe("https://example.com/products");
		expect(links.en).not.toContain("/en/");
	});

	it("non-default locales have prefix", () => {
		const links = buildHreflangLinks({
			baseUrl: "https://example.com",
			config,
			pathname: "/products",
		});
		expect(links.hr).toBe("https://example.com/hr/products");
		expect(links.de).toBe("https://example.com/de/products");
	});

	it("handles root path correctly", () => {
		const links = buildHreflangLinks({
			baseUrl: "https://example.com",
			config,
			pathname: "/",
		});
		expect(links.en).toBe("https://example.com/");
		expect(links.hr).toBe("https://example.com/hr");
	});

	it("strips trailing slash from baseUrl", () => {
		const links = buildHreflangLinks({
			baseUrl: "https://example.com/",
			config,
			pathname: "/about",
		});
		expect(links.en).toBe("https://example.com/about");
	});

	it("single locale generates just one link + x-default", () => {
		const links = buildHreflangLinks({
			baseUrl: "https://example.com",
			config: { defaultLocale: "en", locales: ["en"] },
			pathname: "/about",
		});
		expect(Object.keys(links)).toHaveLength(2);
		expect(links.en).toBeDefined();
		expect(links["x-default"]).toBeDefined();
	});
});
