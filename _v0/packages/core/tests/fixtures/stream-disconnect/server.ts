/*
 * Runs `vite preview` with Flare's preview middleware (under Bun when spawned with bun).
 * A request with `x-slow: 1` streams 30 chunks 20ms apart; any other answers "ok" (Vite's HTML
 * fallback rewrites paths, so the header routes). Prints `port <n>` when listening and `cancelled`
 * when a slow body is cancelled.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Plugin, preview } from "vite";
import { createPreviewServerPlugin } from "../../../src/plugins/dev-server.ts";

const root = mkdtempSync(join(tmpdir(), "flare-stream-disconnect-"));
mkdirSync(join(root, "dist/server"), { recursive: true });
mkdirSync(join(root, "dist/client"), { recursive: true });
writeFileSync(
	join(root, "dist/server/server.js"),
	`export const server = {
	fetch(request) {
		if (request.headers.get("x-slow") !== "1") return new Response("ok");
		let i = 0;
		let timer;
		const body = new ReadableStream({
			pull(controller) {
				return new Promise((done) => {
					timer = setTimeout(() => {
						if (i++ === 30) controller.close();
						else controller.enqueue(new TextEncoder().encode("x".repeat(1024)));
						done();
					}, 20);
				});
			},
			cancel() {
				clearTimeout(timer);
				console.log("cancelled");
			},
		});
		return new Response(body, { headers: { "content-type": "text/html" } });
	},
};
`,
);

/* Vite's real preview stack (connect, compression, static) with Flare's preview middleware. */
const server = await preview({
	configFile: false,
	logLevel: "silent",
	plugins: [createPreviewServerPlugin() as Plugin],
	preview: { host: "127.0.0.1", port: 0 },
	root,
});
const address = server.httpServer.address();
if (address && typeof address === "object") console.log(`port ${address.port}`);
