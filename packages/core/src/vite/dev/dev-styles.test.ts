import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Plugin } from "vite";
import { expect, it, vi } from "vitest";
import { STYLES_EVENT, type DevStyle } from "../../shared/protocol/index.ts";
import { directStyle, installDevStyles, type GraphNode, type StylesServer } from "./dev-styles.ts";

// The docs app's routes are the route map; the module graph and the served CSS are the test's.
const ROOT = fileURLToPath(new URL("../../../tests/e2e/apps/docs/", import.meta.url));
const ROUTES = `${ROOT}src/routes/[[locale]]/_root_`;

function node(id: string, imports: GraphNode[] = []): GraphNode {
	return { id, url: id.replace(ROOT, "/"), importedModules: new Set(imports) };
}

function fake() {
	const app = node(`${ROOT}src/styles.css`);
	const block = node(`${ROOT}src/components/code-block.module.css`);
	const header = node(`${ROOT}src/components/header.tsx`, [block, app]);
	const print = node(`${ROOT}src/print.css?media`);
	const reset = node("\0virtual:flare/reset.css");
	const unresolved: GraphNode = { id: null, url: "", importedModules: new Set() };
	const entry = node(`${ROOT}src/client.tsx`, [reset, unresolved, node(`${ROOT}src/client-boot.ts`, [app])]);
	const graph = new Map<string, GraphNode>([
		[`${ROUTES}/locale.root-layout.tsx`, node(`${ROUTES}/locale.root-layout.tsx`, [header, app])],
		[`${ROUTES}/(guide)/docs/[slug]/doc.page.tsx`, node(`${ROUTES}/(guide)/docs/[slug]/doc.page.tsx`, [block, print])],
	]);
	const listeners = new Map<
		string,
		(payload: unknown, client: { send: (event: string, payload: unknown) => void }) => void
	>();
	const changed: (() => void)[] = [];
	const transformRequest = vi.fn<(url: string) => Promise<{ code: string } | null>>(async (url) => ({
		code: `css of ${url}`,
	}));
	const environment = (on: typeof listeners) => ({
		hot: {
			on: (event: string, listener: typeof on extends Map<string, infer L> ? L : never) => void on.set(event, listener),
		},
		moduleGraph: {
			getModulesByFile: (file: string) => (graph.has(file) ? new Set([graph.get(file) as GraphNode]) : undefined),
		},
	});
	const client = {
		transformRequest,
		moduleGraph: {
			getModulesByFile: (file: string) => (file === entry.id ? new Set([entry]) : undefined),
			ensureEntryFromUrl: async () => undefined,
		},
	};
	const server: StylesServer = {
		config: { root: ROOT },
		watcher: { on: (_event, listener) => void changed.push(listener) },
		environments: { client, ssr: environment(listeners) },
	};
	return { server, listeners, changed, transformRequest };
}

async function ask(
	listener: ((payload: unknown, client: { send: (event: string, payload: unknown) => void }) => void) | undefined,
	routes: string[],
	request = 1,
): Promise<DevStyle[]> {
	return new Promise((resolve) => {
		listener?.(
			{ request, routes },
			{
				send: (event, payload) => {
					expect(event).toBe(STYLES_EVENT);
					expect(Reflect.get(Object(payload), "request")).toBe(request);
					resolve(Reflect.get(Object(payload), "styles") as DevStyle[]);
				},
			},
		);
	});
}

// The client entry's own CSS imports first (flare's reset), then the chain's CSS modules in import order, root first and
// once each, read as Vite serves them with `?direct` (B104). The entry's other imports are not walked.
it("chain styles", async () => {
	const { server, listeners, transformRequest } = fake();
	installDevStyles(server, `${ROOT}src/client.tsx`);
	const chain = ["[[locale]]/_root_", "[[locale]]/_root_/(guide)", "[[locale]]/_root_/(guide)/docs/[slug]"];
	expect(await ask(listeners.get(STYLES_EVENT), chain)).toEqual([
		{ id: "\0virtual:flare/reset.css", css: "css of \0virtual:flare/reset.css?direct" },
		{ id: `${ROOT}src/components/code-block.module.css`, css: "css of /src/components/code-block.module.css?direct" },
		{ id: `${ROOT}src/styles.css`, css: "css of /src/styles.css?direct" },
		{ id: `${ROOT}src/print.css?media`, css: "css of /src/print.css?media&direct" },
	]);
	expect(transformRequest.mock.calls.map(([url]) => url)).toContain("/src/client.tsx");
	expect(transformRequest).toHaveBeenCalledTimes(5);
	// A route the scan does not know gets the root's styles only.
	expect(await ask(listeners.get(STYLES_EVENT), ["[[locale]]/_root_/unknown"])).toEqual([
		{ id: "\0virtual:flare/reset.css", css: "css of \0virtual:flare/reset.css?direct" },
	]);
});

// One walk per chain until a watched file changes, which every HMR update follows.
it("cache", async () => {
	const { server, listeners, changed, transformRequest } = fake();
	installDevStyles(server, `${ROOT}src/client.tsx`);
	const listener = listeners.get(STYLES_EVENT);
	await ask(listener, ["[[locale]]/_root_"]);
	await ask(listener, ["[[locale]]/_root_"], 2);
	// The entry, the reset, and the root's two CSS modules.
	expect(transformRequest).toHaveBeenCalledTimes(4);
	for (const change of changed) change();
	await ask(listener, ["[[locale]]/_root_"], 3);
	expect(transformRequest).toHaveBeenCalledTimes(8);
});

// A malformed request gets no answer. A failed read answers no styles and is not cached.
it("bad request", async () => {
	const { server, listeners, transformRequest } = fake();
	installDevStyles(server, `${ROOT}src/client.tsx`);
	const send = vi.fn<(event: string, payload: unknown) => void>();
	listeners.get(STYLES_EVENT)?.({ routes: "x" }, { send });
	expect(send).not.toHaveBeenCalled();
	transformRequest.mockRejectedValueOnce(new Error("no css"));
	expect(await ask(listeners.get(STYLES_EVENT), ["[[locale]]/_root_"])).toEqual([]);
	transformRequest.mockResolvedValue(null);
	expect(await ask(listeners.get(STYLES_EVENT), ["[[locale]]/_root_"], 2)).toEqual([
		{ id: "\0virtual:flare/reset.css", css: "" },
		{ id: `${ROOT}src/components/code-block.module.css`, css: "" },
		{ id: `${ROOT}src/styles.css`, css: "" },
	]);
});

// An entry the client graph does not hold yet adds no CSS of its own; the chain's still come.
it("entry not in graph", async () => {
	const { server, listeners } = fake();
	installDevStyles(server, `${ROOT}src/missing.tsx`);
	const styles = await ask(listeners.get(STYLES_EVENT), ["[[locale]]/_root_"]);
	expect(styles.map((style) => style.id)).toEqual([
		`${ROOT}src/components/code-block.module.css`,
		`${ROOT}src/styles.css`,
	]);
});

// A real dev server whose stylesheet transform is held open, as a first Tailwind compile holds it: an edit of the file
// before the transform ends sends the clients no full reload, and the served CSS still arrives (BUGS.md 111).
it("edit mid compile", async () => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "flare-dev-styles-")));
	const file = join(root, "styles.css");
	writeFileSync(file, "body { color: red; }\n");
	const started = Promise.withResolvers<void>();
	const held = Promise.withResolvers<void>();
	const updated = Promise.withResolvers<void>();
	const plugin: Plugin = {
		name: "held",
		async transform(_code, id) {
			if (!id.includes("styles.css")) return;
			started.resolve();
			await held.promise;
		},
		hotUpdate() {
			if (this.environment.name === "client") updated.resolve();
		},
	};
	const server = await createServer({
		root,
		configFile: false,
		logLevel: "silent",
		server: { middlewareMode: true, ws: false },
		plugins: [plugin],
	});
	try {
		const client = server.environments.client;
		const sent: string[] = [];
		const send = client.hot.send.bind(client.hot);
		Reflect.set(client.hot, "send", (payload: unknown, ...rest: unknown[]) => {
			sent.push(String(Reflect.get(Object(payload), "type")));
			return Reflect.apply(send, client.hot, [payload, ...rest]);
		});
		const css = directStyle(client, "/styles.css");
		await started.promise;
		writeFileSync(file, "body { color: blue; }\n");
		server.watcher.emit("change", file);
		await updated.promise;
		await new Promise((resolve) => setTimeout(resolve, 50));
		held.resolve();
		expect(await css).toContain("body");
		expect(sent).not.toContain("full-reload");
	} finally {
		await server.close();
		rmSync(root, { recursive: true, force: true });
	}
}, 30_000);
