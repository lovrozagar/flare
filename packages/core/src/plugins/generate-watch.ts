import { runGenerate, type RunGenerateOptions } from "../generators/index.ts"

const GEN_IGNORE_RE = /(_gen[/\\]|\.gen\.tsx?$)/

export const FS_CODEGEN_SUFFIX_RE = /\.(page|layout|root-layout|path-segment)\.(tsx?|jsx?)$/

/**
 * Whether a filesystem watch event should re-run codegen.
 * `fsVirtualPaths: true` only reacts to suffix route files, or add/delete (`rename`).
 * `false` reacts to any non-generated source change.
 */
export function shouldTriggerGenerate(
	filename: string | null | undefined,
	event: string,
	fsVirtualPaths: boolean,
): boolean {
	if (!filename) return false
	const name = String(filename)
	if (GEN_IGNORE_RE.test(name)) return false
	if (fsVirtualPaths && event !== "rename" && !FS_CODEGEN_SUFFIX_RE.test(name)) return false
	return true
}

/** Watch-path generate: log layout errors instead of taking down the dev server. */
export function safeRunGenerate(options: RunGenerateOptions): void {
	try {
		runGenerate(options)
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e)
		console.error(`[flare:generate] ${msg}`)
	}
}
