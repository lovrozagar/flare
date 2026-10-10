/** @vitest-environment node */
/*
 * themeVars "reference" in dev: the SSR stylesheet must define every theme var the registered
 * modules reference. The stylesheet module is imported once and cached by the server runtime
 * while later routes transform; a theme var map baked into it at import time left the vars of
 * every later-compiled class undefined (a live theme lab painted transparent accents and square
 * corners).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createSxAstPlugin } from "../../../../src/plugins/sx-ast/index.ts";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

const THEME = [
	'@import "tailwindcss";',
	"@theme {",
	"\t--color-*: initial;",
	"\t--background-color-accent: var(--accent-solid);",
	"\t--radius-control: calc(var(--ui-radius) * 0.75);",
	"}",
	":root {",
	"\t--accent-solid: light-dark(#06f, #39f);",
	"\t--ui-radius: 0.5rem;",
	"}",
].join("\n");

type Plugin = ReturnType<typeof createSxAstPlugin>;
type Transform = (
	this: object,
	code: string,
	id: string,
	options?: { ssr?: boolean },
) => { code: string; map: null } | null;

async function devPlugin(): Promise<{ plugin: Plugin; dir: string }> {
	const dir = mkdtempSync(join(tmpdir(), "flare-dev-theme-vars-"));
	dirs.push(dir);
	const twCssPath = join(dir, "theme.css");
	writeFileSync(twCssPath, THEME);
	const plugin = createSxAstPlugin({ themeVars: "reference", tw: true, twCssPath });
	(plugin.configResolved as (config: object) => void)({ command: "serve", root: dir });
	await (plugin.buildStart as (this: object) => Promise<void>).call({});
	return { dir, plugin };
}

/** The dev stylesheet module as the server runtime imports it (once, then cached). */
async function importDevCss(plugin: Plugin, dir: string) {
	const loaded = (plugin.load as (id: string) => { code: string } | null)("\0virtual:flare-sx-dev-css");
	if (!loaded) throw new Error("no dev css module");
	const file = join(dir, "dev-css.mjs");
	writeFileSync(file, loaded.code);
	return (await import(pathToFileURL(file).href)) as {
		registerDevSx: (...args: unknown[]) => void;
		getDevSxCss: () => string;
	};
}

/** Transforms a server module and runs its registration against the imported stylesheet. */
function runServerModule(
	plugin: Plugin,
	devCss: { registerDevSx: (...args: unknown[]) => void },
	source: string,
	id: string,
) {
	const result = (plugin.transform as Transform).call({}, source, id, { ssr: true });
	const call = result?.code.match(/__flareRegisterDevSx__\(\.\.\.(.+)\);\n$/);
	if (!call?.[1]) throw new Error(`no registration in ${id}`);
	devCss.registerDevSx(...(JSON.parse(call[1]) as unknown[]));
}

describe("dev SSR stylesheet in themeVars reference mode", () => {
	it("defines the vars of classes compiled after the stylesheet module was imported", async () => {
		const { dir, plugin } = await devPlugin();
		const devCss = await importDevCss(plugin, dir);
		runServerModule(
			plugin,
			devCss,
			`export const A = () => <b class="bg-accent rounded-control" />`,
			join(dir, "a.tsx"),
		);
		const css = devCss.getDevSxCss();
		expect(css).toContain("--background-color-accent: var(--accent-solid);");
		expect(css).toContain("--radius-control: calc(var(--ui-radius) * 0.75);");
	});

	it("injects the vars a client-loaded module needs, once per page", async () => {
		const { dir, plugin } = await devPlugin();
		const snippetOf = (source: string, id: string) => {
			const code = (plugin.transform as Transform).call({}, source, id)?.code ?? "";
			return code.slice(code.indexOf('if (typeof document !== "undefined")'));
		};
		const style = { textContent: "" };
		const window = {};
		const document = { getElementById: () => style };
		const run = (snippet: string) => new Function("window", "document", snippet)(window, document);
		run(snippetOf(`export const A = () => <b class="bg-accent" />`, join(dir, "a.tsx")));
		run(snippetOf(`export const B = () => <i class="bg-accent rounded-control" />`, join(dir, "b.tsx")));
		expect(style.textContent).toContain("@layer theme{:root,:host{--background-color-accent:var(--accent-solid);}}");
		expect(style.textContent.match(/--background-color-accent:/g)).toHaveLength(1);
		expect(style.textContent).toContain("--radius-control:calc(var(--ui-radius) * 0.75);");
	});
});
