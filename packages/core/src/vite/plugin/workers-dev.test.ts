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
	const plugins = workersDevPlugins(
		"virtual:flare/worker",
		{},
		{
			resolve: () => "file:///cf.mjs",
			load: async () => ({ cloudflare }),
			hooks: () => true,
		},
	);
	expect(await plugins).toEqual([{ name: "cf" }]);
	expect(cloudflare).toHaveBeenCalledWith(cloudflareOptions("virtual:flare/worker"));
});

// The inspector port reaches the Cloudflare plugin as given: 0 for an OS-assigned port, which two dev servers started
// together cannot both take, false for none. Absent, the plugin keeps 9229 for chrome://inspect (BUGS.md 85).
it("inspector port", async () => {
	expect(cloudflareOptions("virtual:flare/worker", {})).not.toHaveProperty("inspectorPort");
	expect(cloudflareOptions("virtual:flare/worker", { inspectorPort: 0 })).toMatchObject({ inspectorPort: 0 });
	expect(cloudflareOptions("virtual:flare/worker", { inspectorPort: false })).toMatchObject({ inspectorPort: false });
	// Persisted worker state passes through too: false keeps it in memory, so two dev servers of one app do not share
	// the SQLite state under `.wrangler` in the app.
	expect(cloudflareOptions("virtual:flare/worker", {})).not.toHaveProperty("persistState");
	expect(cloudflareOptions("virtual:flare/worker", { persistState: false })).toMatchObject({ persistState: false });
	expect(cloudflareOptions("virtual:flare/worker", { persistState: { path: "s" } })).toMatchObject({
		persistState: { path: "s" },
	});
	const cloudflare = vi.fn<(options: unknown) => unknown>(() => []);
	const loader = { resolve: () => "file:///cf.mjs", load: async () => ({ cloudflare }), hooks: () => true };
	await workersDevPlugins("virtual:flare/worker", { inspectorPort: 0 }, loader);
	expect(cloudflare).toHaveBeenCalledWith(expect.objectContaining({ inspectorPort: 0 }));
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
	expect(() => workersDevPlugins("virtual:flare/worker", {}, missing)).toThrow(
		"flare({ workersDev: true }) needs @cloudflare/vite-plugin: npm install -D @cloudflare/vite-plugin",
	);
	const empty = { ...missing, resolve: () => "file:///cf.mjs" };
	await expect(workersDevPlugins("virtual:flare/worker", {}, empty)).rejects.toThrow("exports no cloudflare()");
});

// A runtime whose node:module has no registerHooks (Bun 1.4.3, Node before 22.15) cannot run the Cloudflare plugin:
// the error says so with the runtime's name and version, and the peer is not loaded (B95).
it("hooks missing", () => {
	const load = vi.fn<(specifier: string) => Promise<unknown>>(async () => ({}));
	const loader = { resolve: () => "file:///cf.mjs", load, hooks: () => false };
	expect(() => workersDevPlugins("virtual:flare/worker", {}, loader)).toThrow(
		/^flare\(\{ workersDev: true \}\) runs Vite on Node 22\.15 or later; this runtime is (Node|Bun) \d/,
	);
	expect(load).not.toHaveBeenCalled();
	expect(runtimeName({ node: "22.12.0" })).toBe("Node 22.12.0");
	expect(runtimeName({ node: "24.3.0", bun: "1.4.3" })).toBe("Bun 1.4.3");
});
