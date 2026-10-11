import { existsSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";
import { boot } from "./boot.ts";

it("serves", async () => {
	const session = await boot({ app: "minimal", runtime: "node", mode: "dev" });
	const response = await fetch(`${session.origin}/`);
	expect(response.status).toBe(200);
	await session.close();
	await expect(fetch(`${session.origin}/`)).rejects.toThrow(/fetch failed|ECONNREFUSED/);
});

it("port", async () => {
	const [first, second] = await Promise.all([
		boot({ app: "minimal", runtime: "node", mode: "dev" }),
		boot({ app: "minimal", runtime: "node", mode: "dev" }),
	]);
	expect(first.origin).not.toBe(second.origin);
	await first.close();
	await second.close();
});

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

it("prod", async () => {
	await expect(boot({ app: "minimal", runtime: "node", mode: "prod" })).rejects.toThrow(/prod/);
});

it("workers", async () => {
	await expect(boot({ app: "minimal", runtime: "workers", mode: "dev" })).rejects.toThrow(/workers/);
});

it("bun", async () => {
	await expect(boot({ app: "minimal", runtime: "bun", mode: "dev" })).rejects.toThrow(/bun/);
});

it("basepath", async () => {
	const session = await boot({ app: "basepath", runtime: "node", mode: "dev" });
	expect(session.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
	const app = await fetch(`${session.origin}/app`);
	expect(app.status).toBe(200);
	const root = await fetch(`${session.origin}/`);
	expect(root.status).toBe(404);
	await session.close();
	await expect(fetch(`${session.origin}/app`)).rejects.toThrow(/fetch failed|ECONNREFUSED/);
});

it("no copy", async () => {
	const session = await boot({ app: "minimal", runtime: "node", mode: "dev" });
	expect(session.appDir.endsWith("packages/core/tests/e2e/apps/minimal")).toBe(true);
	expect(readdirSync(session.appDir).includes("package.json")).toBe(true);
	expect(readdirSync(new URL("./apps/", import.meta.url)).filter((name) => name.startsWith("minimal"))).toEqual([
		"minimal",
	]);
	await session.close();
});

it("temp", async () => {
	const session = await boot({ app: "minimal", runtime: "node", mode: "dev" });
	expect(session.cacheDir.startsWith(session.appDir)).toBe(false);
	expect(existsSync(session.cacheDir)).toBe(true);
	await session.close();
	expect(existsSync(session.cacheDir)).toBe(false);
});
