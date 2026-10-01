/** @vitest-environment node */
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { build } from "vite";

/** Unique span from the vendored `labelText` pool. Absent means the tables were tree-shaken. */
const TABLES_NEEDLE = "nest-clamp-imageabein-lrstxyskx";

const STYLES_ENTRY = fileURLToPath(new URL("../../../src/styles/index.ts", import.meta.url));

const stubLogLevel = {
	name: "stub-flare-log-level",
	resolveId(id: string) {
		if (id === "virtual:flare-log-level") return "\0virtual:flare-log-level";
		return null;
	},
	load(id: string) {
		if (id === "\0virtual:flare-log-level") return "export default 'silent';\n";
		return null;
	},
};

async function bundleLibrary(source: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "flare-cn-lib-"));
	const outDir = join(dir, "dist");
	try {
		await mkdir(outDir, { recursive: true });
		const entry = join(dir, "entry.ts");
		await writeFile(entry, source);
		await build({
			configFile: false,
			logLevel: "silent",
			plugins: [stubLogLevel],
			root: dir,
			build: {
				emptyOutDir: true,
				lib: {
					entry,
					fileName: "out",
					formats: ["es"],
				},
				minify: false,
				outDir,
				rollupOptions: {
					treeshake: true,
				},
				write: true,
			},
		});
		const files = (await readdir(outDir, { recursive: true }))
			.map(String)
			.filter((name) => name.endsWith(".js") || name.endsWith(".mjs"));
		const chunks = await Promise.all(files.map((name) => readFile(join(outDir, name), "utf8")));
		return chunks.join("\n");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

const FIXTURES = fileURLToPath(new URL("../../fixtures/cn-bundle/", import.meta.url));

async function buildFixtureClient(app: "static-app" | "dynamic-app"): Promise<string> {
	const root = join(FIXTURES, app);
	const dist = join(root, "dist");
	await rm(dist, { recursive: true, force: true });
	try {
		await build({
			configFile: join(root, "vite.config.ts"),
			logLevel: "silent",
			root,
		});
		const clientDir = join(dist, "client");
		const files = (await readdir(clientDir, { recursive: true }))
			.map(String)
			.filter((name) => name.endsWith(".js") || name.endsWith(".mjs"));
		expect(files.length).toBeGreaterThan(0);
		const chunks = await Promise.all(files.map((name) => readFile(join(clientDir, name), "utf8")));
		return chunks.join("\n");
	} finally {
		await rm(dist, { recursive: true, force: true });
	}
}

describe("cn fixture vite bundle", () => {
	it("static class= app client JS omits the compiled tables", async () => {
		const code = await buildFixtureClient("static-app");
		expect(code.length).toBeGreaterThan(500);
		expect(code).not.toContain(TABLES_NEEDLE);
	}, 180_000);

	it("dynamic cn() app client JS includes the compiled tables", async () => {
		const code = await buildFixtureClient("dynamic-app");
		expect(code).toContain(TABLES_NEEDLE);
	}, 180_000);
});

describe("cn library tree-shake", () => {
	it("export { styles } does not ship the compiled tables", async () => {
		const code = await bundleLibrary(`export { styles } from ${JSON.stringify(STYLES_ENTRY)};\n`);
		expect(code.length).toBeGreaterThan(500);
		expect(code).toContain("function styles");
		expect(code).not.toContain(TABLES_NEEDLE);
	});

	it("export { cn } ships the compiled tables", async () => {
		const code = await bundleLibrary(`export { cn } from ${JSON.stringify(STYLES_ENTRY)};\n`);
		expect(code.length).toBeGreaterThan(500);
		expect(code).toContain(TABLES_NEEDLE);
	});
});
