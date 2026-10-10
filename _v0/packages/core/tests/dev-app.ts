/*
 * A real Flare dev server over a copy of the cn-bundle static app, serving real HTTP: Solid's SSR
 * compile, the SSR head injection, and Vite's transformIndexHtml all run as in `vite dev`.
 */
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import { flare } from "../src/plugins/index.ts";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

export interface DevApp {
	/** The app root; write files under it to edit the app. */
	app: string;
	/** Stops the server and deletes the app. */
	close: () => Promise<void>;
	/** GETs a path and returns the HTML. */
	get: (path: string) => Promise<string>;
	server: ViteDevServer;
}

/** `files` (app-relative path → source) are written over the fixture before the server starts. */
export async function startDevApp(options: { files?: Record<string, string>; watch?: boolean } = {}): Promise<DevApp> {
	/* Inside the repo so @lovrozagar/flare and solid-js resolve to the workspace. */
	const app = mkdtempSync(join(FIXTURES, ".consumer-dev-"));
	cpSync(join(FIXTURES, "cn-bundle/static-app"), app, { recursive: true });
	for (const [path, source] of Object.entries(options.files ?? {})) writeFileSync(join(app, path), source);
	const server = await createServer({
		configFile: false,
		logLevel: "silent",
		plugins: flare({ codegen: { fsVirtualPaths: false }, dev: false, prerender: false, sx: { tw: true } }),
		root: app,
		server: { hmr: false, host: "127.0.0.1", port: 0, watch: options.watch ? {} : null },
	});
	const close = async () => {
		try {
			await server.close();
		} finally {
			rmSync(app, { force: true, recursive: true });
		}
	};
	await server.listen();
	const address = server.httpServer?.address() as AddressInfo | null | undefined;
	if (!address) {
		await close();
		throw new Error("dev server did not bind a port");
	}
	const get = async (path: string) => {
		const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
		return response.text();
	};
	return { app, close, get, server };
}
