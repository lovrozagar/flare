import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBuilder } from "vite";
import { afterEach, expect, it } from "vitest";
import { flare } from "./flare.ts";
import type { FlareOptions } from "./options.ts";

// A real client build of an app under the repo's node_modules, so its imports resolve as an app's would.
const FIXTURES = fileURLToPath(new URL("../../../../../node_modules/.flare-fixtures/", import.meta.url));
const BUILD = 120_000;
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function write(root: string, files: Record<string, string>): void {
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
}

// An app whose one page imports the `abeezee` registry family, and a font directory holding two families.
function fixture(): string {
	mkdirSync(FIXTURES, { recursive: true });
	const app = mkdtempSync(join(FIXTURES, "fonts-"));
	roots.push(app);
	write(app, {
		"src/client.tsx":
			'import { createClient } from "@lovrozagar/flare/client";\nimport { router } from "./router.ts";\ncreateClient(router);\n',
		"src/router.ts":
			'import { createRouter } from "@lovrozagar/flare";\nimport { chunks, layouts, routeTree } from "./_gen/routes.gen.ts";\nexport const router = createRouter({ layouts, routeTree, chunks });\n',
		"src/server.ts":
			'import { createServer } from "@lovrozagar/flare/server";\nimport { router } from "./router.ts";\nexport const server = createServer({ router });\n',
		"src/routes/_root_/root.root-layout.tsx":
			'import { createRootLayout } from "@lovrozagar/flare";\nexport const route = createRootLayout("_root_").render((props) => (\n\t<html>\n\t\t<head></head>\n\t\t<body>{props.children}</body>\n\t</html>\n));\n',
		"src/routes/_root_/home.page.tsx":
			'import { createPage } from "@lovrozagar/flare";\nimport abeezee from "@lovrozagar/flare/fonts/abeezee";\nexport const route = createPage("_root_/").render(() => <p>{abeezee.family}</p>);\n',
		"woff/abeezee/latin-400.woff2": "abeezee latin",
		"woff/abeezee/latin-i-400.woff2": "abeezee latin italic",
		"woff/abeezee/latin-ext-400.woff2": "abeezee latin-ext",
		"woff/abeezee/latin-ext-i-400.woff2": "abeezee latin-ext italic",
		"woff/abel/latin-400.woff2": "abel latin",
	});
	return app;
}

async function build(app: string, options: FlareOptions): Promise<void> {
	const builder = await createBuilder({ root: app, configFile: false, logLevel: "silent", plugins: flare(options) });
	await builder.buildApp();
}

function emitted(app: string): string[] {
	const fonts = join(app, "dist/client/fonts");
	if (!existsSync(fonts)) return [];
	return readdirSync(fonts, { recursive: true, encoding: "utf8" })
		.filter((name) => name.endsWith(".woff2"))
		.toSorted();
}

it(
	"fonts emit",
	async () => {
		const app = fixture();
		await build(app, { fonts: { dir: "woff" } });
		expect(emitted(app)).toEqual([
			"abeezee/latin-400.woff2",
			"abeezee/latin-ext-400.woff2",
			"abeezee/latin-ext-i-400.woff2",
			"abeezee/latin-i-400.woff2",
		]);
	},
	BUILD,
);

it(
	"fonts absent",
	async () => {
		const app = fixture();
		await build(app, {});
		expect(emitted(app)).toEqual([]);
		expect(existsSync(join(app, "dist/client"))).toBe(true);
	},
	BUILD,
);

it(
	"fonts dir missing file",
	async () => {
		const app = fixture();
		rmSync(join(app, "woff/abeezee/latin-ext-i-400.woff2"));
		await expect(build(app, { fonts: { dir: "woff" } })).rejects.toThrow(/abeezee\/latin-ext-i-400\.woff2/);
	},
	BUILD,
);
