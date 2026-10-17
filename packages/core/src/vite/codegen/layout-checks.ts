import { isRootFolder } from "../../shared/route-tree/index.ts"

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
