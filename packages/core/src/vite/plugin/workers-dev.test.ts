import { expect, it, vi } from "vitest";
import { cloudflareOptions, runtimeName, workersDevPlugins } from "./workers-dev.ts";

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
		hooks: () => true,
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
		hooks: () => true,
	};
	expect(() => workersDevPlugins("virtual:flare/worker", missing)).toThrow(
		"flare({ workersDev: true }) needs @cloudflare/vite-plugin: npm install -D @cloudflare/vite-plugin",
	);
	const empty = { ...missing, resolve: () => "file:///cf.mjs" };
	await expect(workersDevPlugins("virtual:flare/worker", empty)).rejects.toThrow("exports no cloudflare()");
});

// A runtime whose node:module has no registerHooks (Bun 1.4.3, Node before 22.15) cannot run the Cloudflare plugin:
// the error says so with the runtime's name and version, and the peer is not loaded (B95).
it("hooks missing", () => {
	const load = vi.fn<(specifier: string) => Promise<unknown>>(async () => ({}));
	const loader = { resolve: () => "file:///cf.mjs", load, hooks: () => false };
	expect(() => workersDevPlugins("virtual:flare/worker", loader)).toThrow(
		/^flare\(\{ workersDev: true \}\) runs Vite on Node 22\.15 or later; this runtime is (Node|Bun) \d/,
	);
	expect(load).not.toHaveBeenCalled();
	expect(runtimeName({ node: "22.12.0" })).toBe("Node 22.12.0");
	expect(runtimeName({ node: "24.3.0", bun: "1.4.3" })).toBe("Bun 1.4.3");
});
