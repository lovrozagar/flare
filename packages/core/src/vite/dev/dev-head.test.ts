import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createServer, type Plugin } from "vite"
import { afterEach, expect, it, vi } from "vitest"
import { devHead, EMPTY_DOCUMENT } from "./dev-head.ts"

const roots: string[] = []

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

// A plugin that adds one tag to every document it transforms.
function tagging(name: string): Plugin {
	return { name, transformIndexHtml: () => [{ tag: "meta", attrs: { name } }] }
}

async function headOf(plugins: Plugin[]): Promise<string> {
	const root = mkdtempSync(join(tmpdir(), "flare-dev-head-"))
	roots.push(root)
	const server = await createServer({
		configFile: false,
		root,
		logLevel: "silent",
		plugins,
		server: { middlewareMode: true, ws: false },
	})
	try {
		return await devHead(server)
	} finally {
		await server.close()
	}
}

it("empty document", async () => {
	expect(await headOf([tagging("added")])).toBe(
		'<meta name="added"><script type="module" src="/@vite/client"></script>',
	)
})

// Only the empty document is transformed: the app's HTML, and its inline scripts, never reach Vite.
it("no app scripts", async () => {
	const transformIndexHtml = vi.fn<(url: string, html: string) => Promise<string>>(async (_url, html) => html)
	await devHead({ transformIndexHtml })
	expect(transformIndexHtml).toHaveBeenCalledExactlyOnceWith("/", EMPTY_DOCUMENT)
})

// A config change restarts the dev server, and the new server's head holds the new plugin's tag.
it("restart recomputes", async () => {
	expect(await headOf([tagging("first")])).not.toContain("second")
	expect(await headOf([tagging("first"), tagging("second")])).toContain('<meta name="second">')
})
