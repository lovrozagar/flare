/** @vitest-environment node */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewServerPlugin } from "../../../src/plugins/dev-server.ts";

type Middleware = (req: { url?: string }, res: unknown, next: () => void) => unknown;

const roots: string[] = [];
afterEach(() => {
	for (const r of roots.splice(0)) rmSync(r, { force: true, recursive: true });
});

function previewWithAsset() {
	const root = mkdtempSync(join(tmpdir(), "flare-preview-"));
	roots.push(root);
	mkdirSync(join(root, "dist/client/assets"), { recursive: true });
	writeFileSync(join(root, "dist/client/assets/route-abc.js"), "export {}");
	const pre: Middleware[] = [];
	const server = { config: { root }, middlewares: { use: (fn: Middleware) => pre.push(fn) } };
	const post = (createPreviewServerPlugin("/assets").configurePreviewServer as (s: unknown) => unknown)(server);
	return { post, pre };
}

describe("preview server — hashed assets", () => {
	it("serves them immutable before Vite's own static handler (like a production host)", async () => {
		const { post, pre } = previewWithAsset();

		/* Registered synchronously = runs before Vite's static middleware; the returned hook runs after it. */
		expect(pre).toHaveLength(1);
		expect(typeof post).toBe("function");

		const headers: Record<string, string> = {};
		const res = {
			end: vi.fn(),
			writeHead: (_status: number, h: Record<string, string>) => Object.assign(headers, h),
		};
		const next = vi.fn();
		await pre[0]?.({ url: "/assets/route-abc.js" }, res, next);

		expect(next).not.toHaveBeenCalled();
		expect(headers["cache-control"]).toBe("public, max-age=31536000, immutable");
	});
});
