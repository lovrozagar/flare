import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { boot, bootChild } from "./boot.ts";

// A test that boots a real vite dev server in a child process. Under the parallel suite that boot can pass the 5 s
// default, so these tests alone get more room. The global timeout stays.
const VITE_BOOT = 30_000;

it(
	"serves",
	async () => {
		const session = await boot({ app: "minimal", runtime: "node", mode: "dev" });
		const response = await fetch(`${session.origin}/`);
		expect(response.status).toBe(200);
		await session.close();
		await expect(fetch(`${session.origin}/`)).rejects.toThrow(/fetch failed|ECONNREFUSED/);
	},
	VITE_BOOT,
);

it(
	"port",
	async () => {
		const [first, second] = await Promise.all([
			boot({ app: "minimal", runtime: "node", mode: "dev" }),
			boot({ app: "minimal", runtime: "node", mode: "dev" }),
		]);
		expect(first.origin).not.toBe(second.origin);
		await first.close();
		await second.close();
	},
	VITE_BOOT,
);

// The i18n app boots like the others (B70): its shared home answers in the path's locale.
it(
	"i18n app",
	async () => {
		const session = await boot({ app: "i18n", runtime: "node", mode: "dev" });
		try {
			const response = await fetch(`${session.origin}/hr`);
			expect(response.status).toBe(200);
			expect(await response.text()).toContain("Bok");
		} finally {
			await session.close();
		}
	},
	VITE_BOOT,
);

it("unknown app", async () => {
	await expect(boot({ app: "product", runtime: "node", mode: "dev" })).rejects.toThrow(/product/);
});

it("deno", async () => {
	await expect(boot({ app: "minimal", runtime: "deno", mode: "dev" })).rejects.toThrow(/deno/);
});

it("browser is not a runtime", async () => {
	await expect(boot({ app: "minimal", runtime: "firefox", mode: "dev" })).rejects.toThrow(/firefox/);
});

it("preview", async () => {
	await expect(boot({ app: "minimal", runtime: "node", mode: "preview" })).rejects.toThrow(/preview/);
});

// A production boot: `vite build` on Node into a temp outDir, then the runtime's adapter over that output (B70). The
// document has no dev client, every response names the build, and the hashed client entry is served. Close removes
// the output.
const PROD_BOOT = 120_000;

async function prod(runtime: "node" | "bun" | "workers"): Promise<void> {
	const session = await boot({ app: "minimal", runtime, mode: "prod" });
	try {
		const response = await fetch(`${session.origin}/`);
		const html = await response.text();
		expect(response.status).toBe(200);
		expect(html).not.toContain("@vite/client");
		expect(response.headers.get("flare-build")).toMatch(/^[0-9a-f]{12}$/);
		const entry = /import\("([^"]+)"\)/.exec(html)?.[1] ?? "";
		expect(entry).toMatch(/^\/assets\/client-[\w-]+\.js$/);
		const script = await fetch(`${session.origin}${entry}`);
		expect(script.status).toBe(200);
		expect(script.headers.get("content-type")).toMatch(/javascript/);
	} finally {
		await session.close();
	}
	expect(existsSync(session.cacheDir)).toBe(false);
	await expect(fetch(`${session.origin}/`)).rejects.toThrow(/fetch failed|ECONNREFUSED/);
}

it("node prod", () => prod("node"), PROD_BOOT);

it("bun prod", () => prod("bun"), PROD_BOOT);

it("workers prod", () => prod("workers"), PROD_BOOT);

it("workers", async () => {
	await expect(boot({ app: "minimal", runtime: "workers", mode: "dev" })).rejects.toThrow(/workers/);
});

it("bun", async () => {
	await expect(boot({ app: "minimal", runtime: "bun", mode: "dev" })).rejects.toThrow(/bun/);
});

it(
	"basepath",
	async () => {
		const session = await boot({ app: "basepath", runtime: "node", mode: "dev" });
		expect(session.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
		const app = await fetch(`${session.origin}/app`);
		expect(app.status).toBe(200);
		const root = await fetch(`${session.origin}/`);
		expect(root.status).toBe(404);
		await session.close();
		await expect(fetch(`${session.origin}/app`)).rejects.toThrow(/fetch failed|ECONNREFUSED/);
	},
	VITE_BOOT,
);

it(
	"no copy",
	async () => {
		const session = await boot({ app: "minimal", runtime: "node", mode: "dev" });
		expect(session.appDir.endsWith("packages/core/tests/e2e/apps/minimal")).toBe(true);
		expect(readdirSync(session.appDir).includes("package.json")).toBe(true);
		expect(readdirSync(new URL("./apps/", import.meta.url)).filter((name) => name.startsWith("minimal"))).toEqual([
			"minimal",
		]);
		await session.close();
	},
	VITE_BOOT,
);

it(
	"temp",
	async () => {
		const session = await boot({ app: "minimal", runtime: "node", mode: "dev" });
		expect(session.cacheDir.startsWith(session.appDir)).toBe(false);
		expect(existsSync(session.cacheDir)).toBe(true);
		await session.close();
		expect(existsSync(session.cacheDir)).toBe(false);
	},
	VITE_BOOT,
);

it("failed boot", async () => {
	const cacheDir = mkdtempSync(join(tmpdir(), "flare-vite-"));
	const appDir = fileURLToPath(new URL("./apps/minimal/", import.meta.url));
	await expect(bootChild({ appDir, cacheDir, bin: "/bin/false" })).rejects.toThrow(/vite exited/);
	expect(existsSync(cacheDir)).toBe(false);
	const missing = mkdtempSync(join(tmpdir(), "flare-vite-"));
	await expect(bootChild({ appDir, cacheDir: missing, bin: "/nonexistent/vite" })).rejects.toThrow(/ENOENT/);
	expect(existsSync(missing)).toBe(false);
});

it(
	"exit cleans",
	async () => {
		const session = await boot({ app: "minimal", runtime: "node", mode: "dev" });
		process.emit("exit", 0);
		expect(existsSync(session.cacheDir)).toBe(false);
		await session.close();
	},
	VITE_BOOT,
);
