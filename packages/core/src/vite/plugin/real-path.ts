import { existsSync, realpathSync } from "node:fs"

// A path with its symlinks resolved, the form Vite gives module ids in. A path that does not exist stays as given, so
// a missing root or entry keeps its own error (BUGS.md B51).
export function realPath(path: string): string {
	return existsSync(path) ? realpathSync(path) : path
}
