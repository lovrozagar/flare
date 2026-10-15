/// <reference types="vite/client" />

// The client graph's one console caller (00-rules). Vite replaces `import.meta.env.DEV` with false in a production
// build, so the call and its message drop out. Outside Vite, `import.meta.env` is absent, and that is production.
export function devWarn(tag: string, message: string): void {
	if (import.meta.env?.DEV) console.warn(`[flare:${tag}] ${message}`)
}
