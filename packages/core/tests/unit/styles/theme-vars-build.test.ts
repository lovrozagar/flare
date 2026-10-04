/** @vitest-environment node */
/* sx.themeVars: "reference" on a real build: rules keep var(), and every var they use is defined. */
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";

const ROOT = fileURLToPath(new URL("../../fixtures/ui-contract-app/", import.meta.url));
let css = "";

function rule(selector: string): string | null {
	const at = css.indexOf(`${selector} {`);
	return at === -1 ? null : css.slice(at, css.indexOf("}", at) + 1);
}

beforeAll(async () => {
	const out = join(ROOT, "dist");
	await rm(out, { recursive: true, force: true });
	try {
		await build({ configFile: join(ROOT, "vite.reference.config.ts"), logLevel: "silent", root: ROOT });
		const files = (await readdir(join(out, "client"), { recursive: true })).map(String);
		const sheet = files.find((name) => name.endsWith(".css")) as string;
		css = (await readFile(join(out, "client", sheet), "utf8")).replace(/\s+/g, " ");
	} finally {
		await rm(out, { recursive: true, force: true });
	}
}, 180_000);

describe("themeVars: reference build", () => {
	it("keeps theme references in utility rules", () => {
		expect(rule(".bg-canvas")).toBe(".bg-canvas { background-color: var(--background-color-canvas); }");
		expect(rule(".bg-surface\\/80")).toContain("var(--background-color-surface)");
		expect(rule(".bg-surface\\/80")).toContain("color-mix(");
	});

	it("defines every non-local var referenced without a fallback", () => {
		/* `var(--x, fallback)` (Tailwind's preflight uses these) is valid while --x is undefined. */
		const referenced = new Set([...css.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1] as string));
		expect(referenced.size).toBeGreaterThan(0);
		const undefinedVars = [...referenced].filter((name) => !name.startsWith("--tw-") && !css.includes(`${name}:`));
		expect(undefinedVars).toEqual([]);
	});

	it("defines the semantic token in the theme layer, pointing at its scale", () => {
		expect(css).toContain("--background-color-canvas: var(--gray-2);");
		expect(css).toContain("--gray-2: light-dark(#f9f9fb, #18191b);");
	});
});
