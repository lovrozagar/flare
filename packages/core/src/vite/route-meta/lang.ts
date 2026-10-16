// The grammar oxc parses an app module with, by its extension, the query left out: TypeScript for `.ts`, `.mts`, and
// `.cts`, so a generic arrow is no tag; TSX for `.tsx`; JavaScript or JSX for theirs. Anything else, a virtual id,
// keeps TSX, the widest grammar (plan 21 8.1).
export function langOf(file: string): "ts" | "tsx" | "js" | "jsx" {
	const path = file.replace(/\?.*$/s, "")
	if (/\.[mc]?ts$/.test(path)) return "ts"
	if (/\.[mc]?js$/.test(path)) return "js"
	if (path.endsWith(".jsx")) return "jsx"
	return "tsx"
}
