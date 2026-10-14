import { expect, it, vi } from "vitest";
import { cloudflareOptions, workersDevPlugins } from "./workers-dev.ts";

// The Cloudflare plugin runs flare's worker entry in flare's worker environment, so build-info serves it and the
// app's wrangler config needs no `main` (B95).
it("cloudflare options", async () => {
	expect(cloudflareOptions("virtual:flare/worker")).toEqual({
		viteEnvironment: { name: "worker" },
		config: { main: "virtual:flare/worker" },
	});
	const cloudflare = vi.fn<(options: unknown) => unknown>(() => [{ name: "cf" }]);
	const plugins = workersDevPlugins("virtual:flare/worker", {
		resolve: () => "file:///cf.mjs",
		load: async () => ({ cloudflare }),
	});
	expect(await plugins).toEqual([{ name: "cf" }]);
	expect(cloudflare).toHaveBeenCalledWith(cloudflareOptions("virtual:flare/worker"));
});

// A missing peer fails when flare() is created and names the install. A module without `cloudflare()` fails the load.
it("peer missing", async () => {
	const missing = {
		resolve: (): string => {
			throw new Error("ERR_MODULE_NOT_FOUND");
		},
		load: async () => ({}),
	};
	expect(() => workersDevPlugins("virtual:flare/worker", missing)).toThrow(
		"flare({ workersDev: true }) needs @cloudflare/vite-plugin: npm install -D @cloudflare/vite-plugin",
	);
	const empty = { resolve: () => "file:///cf.mjs", load: async () => ({}) };
	await expect(workersDevPlugins("virtual:flare/worker", empty)).rejects.toThrow("exports no cloudflare()");
});
