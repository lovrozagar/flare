/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { createCssTransformPlugin } from "../../../src/plugins/css-transform.ts";

type Plugin = { transform: (code: string, id: string) => { code: string } | null };

function callTransform(plugin: Plugin, code: string, id: string) {
	return plugin.transform(code, id);
}

describe("createCssTransformPlugin — @layer stripping for .css files", () => {
	it("strips @layer wrapper from a plain .css file", () => {
		const plugin = createCssTransformPlugin() as unknown as Plugin;
		const result = callTransform(plugin, "@layer reset { button { margin: 0 } }", "/src/global.css");
		expect(result).not.toBeNull();
		expect(result?.code).not.toContain("@layer reset");
		expect(result?.code).toContain("button { margin: 0 }");
	});

	it("strips @theme wrapper from a .css file", () => {
		const plugin = createCssTransformPlugin() as unknown as Plugin;
		const result = callTransform(plugin, "@theme { --color: red; }", "/src/theme.css");
		expect(result).not.toBeNull();
		expect(result?.code).toContain(":root");
	});

	it("returns null for non-.css files", () => {
		const plugin = createCssTransformPlugin() as unknown as Plugin;
		expect(callTransform(plugin, "@layer reset { button {} }", "/src/foo.ts")).toBeNull();
		expect(callTransform(plugin, "@layer reset { button {} }", "/src/foo.tsx")).toBeNull();
	});
});

describe("createCssTransformPlugin — html-proxy guard", () => {
	/* Vite virtualises inline <style> blocks in HTML as `?html-proxy...css` IDs.
	 * Stripping @layer from these destroys the @layer reset wrapper that
	 * ResetCSS injects, making the Tailwind preflight unlayered and overriding
	 * every @layer app atomic-class rule on form elements (button, input, etc.). */

	it("does NOT strip @layer from Vite html-proxy virtual CSS ID", () => {
		const plugin = createCssTransformPlugin() as unknown as Plugin;
		const css = "@layer reset { button { background-color: transparent } }";
		const result = callTransform(plugin, css, "/path/to/index.html?html-proxy&direct&index=0.css");
		/* Must return null (no changes) — preserve @layer intact */
		expect(result).toBeNull();
	});

	it("does NOT strip @layer when ID contains html-proxy regardless of path prefix", () => {
		const plugin = createCssTransformPlugin() as unknown as Plugin;
		const css = "@layer reset { * { box-sizing: border-box } }";
		const result = callTransform(plugin, css, "/some/deeply/nested/route.html?html-proxy&index=1.css");
		expect(result).toBeNull();
	});

	it("still strips @layer from a plain .css file that happens to have 'proxy' in path", () => {
		const plugin = createCssTransformPlugin() as unknown as Plugin;
		const css = "@layer reset { p { margin: 0 } }";
		const result = callTransform(plugin, css, "/src/proxy-styles.css");
		expect(result).not.toBeNull();
		expect(result?.code).not.toContain("@layer reset");
	});
});
