import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createBuilder } from "vite";
import { afterEach, expect, it } from "vitest";
import { buildIdOf, readBuildId } from "./build-id.ts";
import { flare } from "./flare.ts";

// Inside the repo's node_modules, so a fixture's imports of the framework and Solid resolve as an app's would.
const FIXTURES = fileURLToPath(new URL("../../../../../node_modules/.flare-fixtures/", import.meta.url));

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const MANIFEST = {
	"src/client.tsx": { file: "assets/client-a1.js", css: ["assets/style-c3.css"] },
	"src/lazy.ts": { file: "assets/b2.js" },
	"style.css": { file: "assets/style-c3.css" },
};

it("dev", () => {
	expect(readBuildId(undefined)).toBe("dev");
});

// sha256 over the sorted, deduped, root-relative JS and CSS URLs (`file` and `css` only), first 12 hex digits.
it("hash", () => {
	const urls = ["/assets/b2.js", "/assets/client-a1.js", "/assets/style-c3.css"];
	const expected = createHash("sha256").update(urls.join("\n")).digest("hex").slice(0, 12);
	expect(buildIdOf(MANIFEST)).toBe(expected);
	expect(expected).toMatch(/^[0-9a-f]{12}$/);
	const reordered = Object.fromEntries(Object.entries(MANIFEST).reverse());
	expect(buildIdOf(reordered)).toBe(expected);
});

it("missing", () => {
	const root = mkdtempSync(join(fixtures(), "id-"));
	roots.push(root);
	const path = join(root, ".vite/manifest.json");
	expect(() => readBuildId(path)).toThrow(path);
	mkdirSync(join(root, ".vite"));
	writeFileSync(path, JSON.stringify(MANIFEST));
	expect(readBuildId(path)).toBe(buildIdOf(MANIFEST));
});

const SERVER = `import { createPage, createRootLayout, createRouter } from "@lovrozagar/flare";
import { createServer } from "@lovrozagar/flare/server";

const root = createRootLayout("_root_").render((props) => props.children);
const home = createPage("_root_/").render(() => "home");
const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/", path: "/", module: home }] });
export const server = createServer({ router });
`;

// A real client and ssr build: the server holds the manifest's id and the hashed client entry, every pipeline response
// carries the id, and the document state names it.
it("wired", async () => {
	const root = mkdtempSync(join(fixtures(), "app-"));
	roots.push(root);
	mkdirSync(join(root, "src"));
	writeFileSync(join(root, "src/client.tsx"), "console.log(1);\n");
	writeFileSync(join(root, "src/server.ts"), SERVER);
	const app = await createBuilder({ root, configFile: false, logLevel: "silent", plugins: flare() });
	await app.buildApp();
	const id = readBuildId(join(root, "dist/client/.vite/manifest.json"));
	expect(id).toMatch(/^[0-9a-f]{12}$/);
	const built: { server: { fetch: (request: Request) => Promise<Response> } } = await import(
		pathToFileURL(join(root, "dist/server/server.js")).href
	);
	const document = await built.server.fetch(new Request("http://localhost/"));
	const html = await document.text();
	expect(document.headers.get("flare-build")).toBe(id);
	expect(html).toContain(`"build":"${id}"`);
	expect(html).toMatch(/import\("\/assets\/client-[\w-]+\.js"\)/);
	for (const path of ["/?_flare=data", "/missing"]) {
		expect((await built.server.fetch(new Request(`http://localhost${path}`))).headers.get("flare-build")).toBe(id);
	}
}, 120_000);

function fixtures(): string {
	mkdirSync(FIXTURES, { recursive: true });
	return FIXTURES;
}
