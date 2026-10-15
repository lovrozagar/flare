import { readFile } from "node:fs/promises"
import { resolve, sep } from "node:path"

// The reader createAssetsStore calls on Node: an artifact path, read by its literal name under `root`. A path that
// escapes `root`, as written or after decoding, throws. A missing file, or a directory, is `null` (dx/store.md).
export function fileAssets(root: string): (path: string) => Promise<Uint8Array | null> {
	const base = resolve(root)
	const inside = (path: string): boolean => {
		const target = resolve(base, `.${sep}${path.replace(/^\/+/, "")}`)
		return target === base || target.startsWith(`${base}${sep}`)
	}
	return async (path) => {
		if (!inside(path) || !inside(safeDecode(path))) throw new Error(`fileAssets: ${path} escapes ${root}`)
		try {
			return new Uint8Array(await readFile(resolve(base, `.${sep}${path.replace(/^\/+/, "")}`)))
		} catch (error) {
			if (error instanceof Error && "code" in error && ["ENOENT", "EISDIR", "ENOTDIR"].includes(String(error.code)))
				return null
			throw error
		}
	}
}

function safeDecode(path: string): string {
	try {
		return decodeURIComponent(path)
	} catch {
		return path
	}
}
