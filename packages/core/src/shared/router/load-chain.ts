import type { ChainEntry, LoadedEntry, ModuleRef, RouteModule } from "./create-router.ts"

// Awaits every lazy module of a chain, in parallel. A rejected import rejects the whole chain.
export function loadChain(chain: readonly ChainEntry[]): Promise<LoadedEntry[]> {
	return Promise.all(
		chain.map(async (entry) => {
			const module = await load(entry.module, entry.id)
			const kind = Reflect.get(module, "_type") === "segment" ? "segment" : entry.kind
			return { ...entry, kind, module }
		}),
	)
}

const imported = new WeakMap<() => Promise<unknown>, RouteModule>()
// The lazy modules whose import has started and not settled.
const importing = new WeakSet<() => Promise<unknown>>()

async function load(ref: ModuleRef, id: string): Promise<RouteModule> {
	if (typeof ref !== "function") return ref
	importing.add(ref)
	try {
		const loaded = await ref()
		const module = isNamespace(loaded) ? await recordOf(loaded, id) : loaded
		imported.set(ref, module)
		return module
	} finally {
		importing.delete(ref)
	}
}

// The longest dev waits for a namespace's `route` to fill.
const FILL_MS = 600

// A namespace's record. In dev, Vite's runner can hand a concurrent import a module it is re-evaluating after an edit,
// when the import closes a cycle (a route module that imports the router, which imports the generated routes): its
// `route` binding fills once that evaluation finishes, so dev waits for it, a macrotask at a time. Production never
// re-evaluates, so a missing record fails at once (BUGS.md 73).
async function recordOf(loaded: { route?: RouteModule }, id: string): Promise<RouteModule> {
	const deadline = performance.now() + (import.meta.env?.DEV ? FILL_MS : 0)
	while (Reflect.get(loaded, "route") === undefined && performance.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 0))
	}
	const route = loaded.route
	if (typeof route !== "object" || route === null) throw new Error(`${id} has no route record: export \`route\``)
	return route
}

function isNamespace(value: unknown): value is { route?: RouteModule } {
	return Object.prototype.toString.call(value) === "[object Module]"
}

// The record behind a ModuleRef once loadChain imported it, so a later navigation reads its effects without
// waiting for the import again.
export function loadedModule(ref: ModuleRef): RouteModule | undefined {
	return typeof ref === "function" ? imported.get(ref) : ref
}

// Whether a ModuleRef's import has started, loaded or still in flight: a warm-up does not fetch its files again, since
// the import already fetches them (BUGS.md 482).
export function importStarted(ref: ModuleRef): boolean {
	return typeof ref !== "function" || imported.has(ref) || importing.has(ref)
}
