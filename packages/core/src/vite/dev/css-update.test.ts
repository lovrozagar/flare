import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import solid from "@solidjs/vite-plugin";
import { createServer, isRunnableDevEnvironment, type Plugin, type ViteDevServer } from "vite";
import { afterEach, expect, it } from "vitest";
import { cssUpdate } from "./css-update.ts";

const servers: ViteDevServer[] = [];
const roots: string[] = [];

afterEach(async () => {
	for (const server of servers.splice(0)) await server.close();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

type Hook = (this: unknown, options: { file: string; modules: { url: string }[] }) => unknown;

function hookOf(plugin: Plugin, consumer = "server"): Hook {
	const hook: unknown = Reflect.get(Object(plugin.hotUpdate), "handler");
	if (typeof hook !== "function") throw new Error("hotUpdate");
	return (options) => Reflect.apply(hook, { environment: { config: { consumer } } }, [options]);
}

// A server environment takes a plain stylesheet's update as handled. The client, a CSS module, an import with a
// query, and code keep Vite's own update.
it("css only", () => {
	const hook = hookOf(cssUpdate());
	const plain = [{ url: "/src/styles.css" }];
	expect(hook({ file: "/app/src/styles.css", modules: plain })).toEqual([]);
	expect(hook({ file: "/app/src/theme.scss", modules: [{ url: "/src/theme.scss" }] })).toEqual([]);
	expect(hook({ file: "/app/src/card.module.css", modules: [{ url: "/src/card.module.css" }] })).toBeUndefined();
	expect(hook({ file: "/app/src/styles.css", modules: [...plain, { url: "/src/styles.css?inline" }] })).toBeUndefined();
	expect(hook({ file: "/app/src/page.tsx", modules: [{ url: "/src/page.tsx" }] })).toBeUndefined();
	expect(hookOf(cssUpdate(), "client")({ file: "/app/src/styles.css", modules: plain })).toBeUndefined();
});

// A real dev server whose server module imports a stylesheet and a shared module. Editing the stylesheet sends the
// server no full reload: the stylesheet's importers evaluate again on their next import, as Vite invalidates them, but
// a module that does not import it, as Solid and flare's own contexts do not, keeps its one instance (BUGS.md 99).
it("server kept", async () => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "flare-css-update-")));
	roots.push(root);
	writeFileSync(join(root, "styles.css"), "body { color: red; }\n");
	writeFileSync(join(root, "shared.ts"), "export const shared = {};\n");
	writeFileSync(join(root, "page.ts"), 'import "./styles.css";\nexport { shared } from "./shared.ts";\n');
	const updated = Promise.withResolvers<void>();
	const seen: Plugin = {
		name: "seen",
		hotUpdate() {
			if (this.environment.name === "ssr") updated.resolve();
		},
	};
	const server = await createServer({
		root,
		configFile: false,
		logLevel: "silent",
		server: { middlewareMode: true, ws: false },
		// Solid's plugin before it, as flare() lists them: its own hook sends a server environment a full reload for any
		// update that still has modules when it runs.
		plugins: [...solid({ ssr: true }), cssUpdate(), seen],
	});
	servers.push(server);
	const ssr = server.environments["ssr"];
	if (ssr === undefined || !isRunnableDevEnvironment(ssr)) throw new Error("ssr");
	const sent: string[] = [];
	const send = ssr.hot.send.bind(ssr.hot);
	Reflect.set(ssr.hot, "send", (payload: unknown, ...rest: unknown[]) => {
		sent.push(String(Reflect.get(Object(payload), "type")));
		return Reflect.apply(send, ssr.hot, [payload, ...rest]);
	});
	const shared = async (): Promise<unknown> => Reflect.get(Object(await ssr.runner.import("/page.ts")), "shared");
	const first = await shared();
	writeFileSync(join(root, "styles.css"), "body { color: blue; }\n");
	server.watcher.emit("change", join(root, "styles.css"));
	await updated.promise;
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(sent).not.toContain("full-reload");
	expect(await shared()).toBe(first);
}, 30_000);
