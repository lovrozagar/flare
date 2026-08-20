import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { escapeJsString, getThemeScript, useTheme } from "../../../src/theme.ts";

describe("getThemeScript", () => {
	it("returns minified inline script string", () => {
		const script = getThemeScript();
		expect(script).toBeTypeOf("string");
		expect(script.length).toBeGreaterThan(0);
	});

	it("script reads localStorage", () => {
		const script = getThemeScript();
		expect(script).toContain("localStorage");
	});

	it('script handles "system" → matchMedia', () => {
		const script = getThemeScript();
		expect(script).toContain("system");
		expect(script).toContain("matchMedia");
		expect(script).toContain("prefers-color-scheme:dark");
	});

	it("script sets data-theme attribute", () => {
		const script = getThemeScript();
		expect(script).toContain("setAttribute");
		expect(script).toContain("data-theme");
	});

	it("script sets colorScheme style behind try/catch (CSP CSSOM)", () => {
		const script = getThemeScript();
		expect(script).toContain("colorScheme");
		expect(script).toContain("try{e.style.colorScheme=t}catch{}");
	});

	it("executed script applies stored theme to documentElement", () => {
		document.documentElement.removeAttribute("data-theme");
		document.documentElement.style.colorScheme = "";
		localStorage.setItem("flare.theme", "dark");
		const script = getThemeScript();
		new Function(script)();
		expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
		expect(document.documentElement.style.colorScheme).toBe("dark");
		localStorage.removeItem("flare.theme");
		document.documentElement.removeAttribute("data-theme");
		document.documentElement.style.colorScheme = "";
	});

	it("executed script resolves system via matchMedia when nothing is stored", () => {
		document.documentElement.removeAttribute("data-theme");
		localStorage.removeItem("flare.theme");
		const original = window.matchMedia;
		window.matchMedia = ((query: string) =>
			({
				addEventListener: () => {},
				matches: query.includes("dark"),
				removeEventListener: () => {},
			}) as MediaQueryList) as typeof matchMedia;
		try {
			new Function(getThemeScript())();
			expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
		} finally {
			window.matchMedia = original;
			document.documentElement.removeAttribute("data-theme");
			document.documentElement.style.colorScheme = "";
		}
	});

	it("custom attribute → used in script", () => {
		const script = getThemeScript({ attribute: "data-mode" });
		expect(script).toContain("data-mode");
	});

	it("custom storageKey → used in script", () => {
		const script = getThemeScript({ storageKey: "my.theme" });
		expect(script).toContain("my.theme");
	});

	it("custom defaultTheme → used in script", () => {
		const script = getThemeScript({ defaultTheme: "dark" });
		expect(script).toContain('"dark"');
	});
});

describe("escapeJsString", () => {
	it("escapes double quotes", () => {
		expect(escapeJsString('key"inject')).toBe('key\\"inject');
	});

	it("escapes closing script tag", () => {
		expect(escapeJsString("</script>")).toBe("<\\/script>");
	});

	it("escapes backslashes", () => {
		expect(escapeJsString("path\\to\\key")).toBe("path\\\\to\\\\key");
	});
});

describe("getThemeScript XSS prevention", () => {
	it("escapes double quotes in config values", () => {
		const script = getThemeScript({ storageKey: 'key"inject' });
		expect(script).not.toContain('key"inject');
		expect(script).toContain('key\\"inject');
	});

	it("escapes closing script tag in config values", () => {
		const script = getThemeScript({ attribute: "</script>" });
		expect(script).not.toContain("</script>");
		expect(script).toContain("<\\/script>");
	});

	it("escapes backslashes in config values", () => {
		const script = getThemeScript({ storageKey: "path\\to\\key" });
		expect(script).toContain("path\\\\to\\\\key");
	});
});

describe("useTheme", () => {
	it("throws when used outside ThemeProvider", () => {
		expect(() => {
			createRoot((dispose) => {
				try {
					useTheme();
				} finally {
					dispose();
				}
			});
		}).toThrow("useTheme() called outside ThemeProvider");
	});
});
