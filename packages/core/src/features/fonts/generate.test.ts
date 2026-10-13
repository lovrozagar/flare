import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { registryFont, type RegistryFontData } from "./shared/create-font.ts";
import { generateFonts, writeFonts, type FontRegistryFile } from "./generate.ts";

const here = new URL(".", import.meta.url).pathname;
const temp = mkdtempSync(join(tmpdir(), "flare-fonts-gen-"));

afterAll(() => rmSync(temp, { recursive: true, force: true }));

function family(name: string, id: string): RegistryFontData {
	return {
		family: name,
		category: "sans-serif",
		files: [
			{
				subset: "latin",
				style: "normal",
				weight: "400",
				url: `/fonts/${id}/latin-400.woff2`,
				unicodeRange: "U+0000-00FF",
			},
		],
	};
}

// The JSON literal a module passes to registryFont, read back from the module text.
function literal(text: string): unknown {
	const start = text.indexOf("registryFont(") + "registryFont(".length;
	return JSON.parse(text.slice(start, text.lastIndexOf(");")));
}

it("fixture", () => {
	const registry: FontRegistryFile = { inter: family("Inter", "inter"), abel: family("Abel", "abel") };
	const modules = generateFonts(registry);
	expect(modules.map((module) => module.fileName)).toEqual(["abel.ts", "inter.ts"]);
	for (const module of modules) {
		expect(module.text).toContain('import { registryFont, type Font } from "../create-font.ts";');
		expect(module.text).toContain("const font: Font = /* @__PURE__ */ registryFont(");
		expect(module.text).toMatch(/\nexport default font;\n$/);
	}
	expect(literal(modules[1]?.text ?? "")).toEqual(registry.inter);
	// A key the package path cannot hold is refused.
	expect(() => generateFonts({ "Open Sans": family("Open Sans", "open-sans") })).toThrow(
		'font id "Open Sans" is not lowercase words joined by hyphens',
	);
});

it("hyphen", () => {
	expect(generateFonts({ "open-sans": family("Open Sans", "open-sans") })[0]?.fileName).toBe("open-sans.ts");
});

it("escape", () => {
	const [module] = generateFonts({ odd: family("Odd</style><script>", "odd") });
	const text = module?.text ?? "";
	expect(text).not.toContain("</style>");
	expect(text).not.toContain("<script>");
	const data = literal(text);
	expect(Reflect.get(Object(data), "family")).toBe("Odd</style><script>");
	expect(registryFont(family("Odd</style><script>", "odd")).css()).not.toMatch(/<\/style>|<script>/);
});

it("root clean", () => {
	expect(readFileSync(join(here, "shared/index.ts"), "utf8")).not.toContain("generated");
});

it("real registry", async () => {
	const registry: FontRegistryFile = JSON.parse(readFileSync(join(here, "registry.json"), "utf8"));
	const generated = join(here, "shared/generated");
	const expected = generateFonts(registry);
	expect(readdirSync(generated).toSorted()).toEqual(
		Object.keys(registry)
			.map((id) => `${id}.ts`)
			.toSorted(),
	);
	for (const module of expected) expect(readFileSync(join(generated, module.fileName), "utf8")).toBe(module.text);
	// A module's default export is its family, built by registryFont.
	const [first] = Object.keys(registry).toSorted();
	const loaded: unknown = (await import(join(generated, `${first}.ts`))).default;
	expect(Reflect.get(Object(loaded), "family")).toBe(registry[first ?? ""]?.family);
});

it("write", () => {
	const fonts = join(temp, "src/features/fonts");
	mkdirSync(join(fonts, "shared/generated"), { recursive: true });
	writeFileSync(join(fonts, "shared/generated/stale.ts"), "stale");
	writeFileSync(join(fonts, "registry.json"), JSON.stringify({ abel: family("Abel", "abel") }));
	writeFonts(temp);
	expect(readdirSync(join(fonts, "shared/generated"))).toEqual(["abel.ts"]);
});
