import { scriptLiteral } from "../csp/index.ts"
import { BOOT_FAILED, CHUNK_MESSAGES, CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS } from "./chunk-reload.ts"

// The document's entry import, as inline script text, with the client boot's policy, since the code that would carry
// it is what failed to load. A failure after the page's own `beforeunload`, which the listener sees only while the
// import is pending, is an import its navigation cut short: nothing is loaded, logged, or stored. A module that would
// not load is one document load of the page under the client's guard, the same key, window, and `{ at, href }` record
// as client/navigation/reload.ts; any other failure, or a load the guard holds back or storage refuses, is logged.
// The text holds no `<`, backtick, or `$`, which the inline escape would change.
export function entryImport(client: string): string {
	const chunk = `${scriptLiteral(CHUNK_MESSAGES)}.some((message) => error.message.includes(message))`
	const last = `last && last.href === href && ${CHUNK_RELOAD_WINDOW_MS} > now - last.at`
	return [
		"const page = { leaving: false }",
		"const leave = () => { page.leaving = true }",
		'addEventListener("beforeunload", leave)',
		`import(${scriptLiteral(client)}).then(() => removeEventListener("beforeunload", leave), (error) => {`,
		'removeEventListener("beforeunload", leave)',
		"if (page.leaving) return",
		"const href = location.href, now = Date.now()",
		`if (error instanceof Error && ${chunk}) {`,
		"try {",
		"const storage = sessionStorage",
		"let last",
		`try { last = JSON.parse(storage.getItem(${scriptLiteral(CHUNK_RELOAD_KEY)}) ?? "null") } catch {}`,
		`if (!(${last})) {`,
		`storage.setItem(${scriptLiteral(CHUNK_RELOAD_KEY)}, JSON.stringify({ at: now, href }))`,
		"location.assign(href)",
		"return",
		"}",
		"} catch {}",
		"}",
		`console.error(${scriptLiteral(BOOT_FAILED)}, error)`,
		"})",
	].join("\n")
}
