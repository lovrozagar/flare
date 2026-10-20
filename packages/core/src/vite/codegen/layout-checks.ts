import { CROSS_ORIGIN_RULE } from "../../shared/route-builder/methods.ts"
import { isRootFolder } from "../../shared/route-tree/index.ts"
import { authHint } from "./auth-hint.ts"
import type { Scan } from "./scan.ts"

// A route file by its id and its path under the routes folder.
type Named = { id: string; file: string }

const ROOT_LAYOUT = ".root-layout.tsx"

// Each page needs the root layout of its own root, its id up to the first root folder (`_admin_`, `[locale]/_root_`):
// another root's layout is not in its chain, so it would render with no document (plan 21 13.3). Every page missing
// one is named, by root.
export function assertRoot(pages: readonly Named[], layouts: readonly Named[]): void {
	const roots = new Set(layouts.filter((layout) => layout.file.endsWith(ROOT_LAYOUT)).map((layout) => layout.id))
	const missing = new Map<string, string[]>()
	for (const page of pages) {
		const root = rootOf(page.id)
		if (root !== undefined && roots.has(root)) continue
		const key = root === undefined ? "" : `${root}: `
		missing.set(key, [...(missing.get(key) ?? []), page.file])
	}
	const lines = [...missing].map(([root, files]) => `no root layout for ${root}${files.join(", ")}`)
	if (lines.length > 0) throw new Error(lines.join("; "))
}

function rootOf(id: string): string | undefined {
	const parts = id.split("/")
	const at = parts.findIndex(isRootFolder)
	return at === -1 ? undefined : parts.slice(0, at + 1).join("/")
}

// Two layout files with one id, two layouts in a folder or one beside a root layout, would leave the router's layout
// record one of them (plan 21 13.3).
export function assertOneLayout(layouts: readonly Named[]): void {
	const seen = new Map<string, string>()
	for (const layout of [...layouts].sort((left, right) => (left.file < right.file ? -1 : 1))) {
		const other = seen.get(layout.id)
		if (other !== undefined) throw new Error(`two layouts for ${layout.id}: ${other}, ${layout.file}`)
		seen.set(layout.id, layout.file)
	}
}

// A `crossOrigin` route whose chain, the layouts above it and the page, authenticates or authorizes fails the build: a
// forged cross-site post would act as the visitor (B44, BUGS.md 273).
export function assertCrossOrigin(
	pages: readonly Named[],
	layouts: readonly Named[],
	scans: ReadonlyMap<string, Scan>,
): void {
	for (const page of pages) {
		const scan = scans.get(page.file)
		if (scan?.crossOrigin !== true) continue
		const above = layouts.filter((layout) => page.id === layout.id || page.id.startsWith(`${layout.id}/`))
		const chain = [...above.map((layout) => scans.get(layout.file)), scan].filter((item) => item !== undefined)
		if (authHint(chain) !== "public") throw new Error(`${page.file}: .response() ${CROSS_ORIGIN_RULE}`)
	}
}

// An intercept opens over the pages its `from` names, so each is a page's id: a URL path or an id no page has would
// never open it (BUGS.md 401).
export function assertIntercepts(routes: ReadonlyArray<Named & { intercept?: { from: string[] } }>): void {
	const ids = new Set(routes.map((route) => route.id))
	for (const route of routes) {
		const unknown = route.intercept?.from.find((id) => !ids.has(id))
		if (unknown !== undefined)
			throw new Error(`${route.file}: intercept from: no route has id ${JSON.stringify(unknown)}`)
	}
}
