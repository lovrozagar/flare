import { resolve } from "node:path";
import type { Plugin, Rollup } from "vite";

// A lazy import's modulepreload list, as Vite builds it, names every chunk the imported chunk needs, the ones the
// client entry imports statically among them. Those are always evaluated before any dynamic import runs, so a hint for
// them is redundant: Chromium and Firefox skip it, and WebKit fetches the module again (a 304 under the Workers assets
// defaults). The client build keeps them out (BUGS.md 79). The entry's closure is read from the bundle before Vite's
// own generateBundle resolves the lists. `entry` is the client entry, relative to the root.
export function preloadPlugin(entry: string): Plugin {
	let loaded = new Set<string>();
	return {
		name: "flare:preload",
		apply: "build",
		config: () => ({
			environments: {
				client: {
					build: { modulePreload: { resolveDependencies: (_file, deps) => deps.filter((dep) => !loaded.has(dep)) } },
				},
			},
		}),
		generateBundle: {
			order: "pre",
			handler(_options, bundle) {
				if (this.environment.name === "client")
					loaded = entryClosure(bundle, resolve(this.environment.config.root, entry));
			},
		},
	};
}

// The chunk whose facade is the client entry, and every chunk it imports statically, transitively, by file name. The
// entry is found by its module: at generateBundle Rolldown still marks each dynamic import's chunk as an entry.
export function entryClosure(bundle: Rollup.OutputBundle, entry: string): Set<string> {
	const closure = new Set<string>();
	const visit = (name: string): void => {
		const file = bundle[name];
		if (closure.has(name) || file?.type !== "chunk") return;
		closure.add(name);
		for (const next of file.imports) visit(next);
	};
	for (const [name, file] of Object.entries(bundle))
		if (file.type === "chunk" && file.facadeModuleId === entry) visit(name);
	return closure;
}
