/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest"
import { createPreviewServerPlugin } from "../../../src/plugins/dev-server.ts"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

interface PreviewServer {
	config?: { root?: string }
	middlewares: {
		use: (fn: (req: { url?: string }, res: NodeRes, next: (err?: unknown) => void) => void) => void
	}
}

interface NodeRes {
	end: (data?: unknown) => void
	writeHead: (status: number, headers: Record<string, string>) => void
}

/*
 * Build a tmp root dir with a file at dist/client/<subpath>.
 * The preview plugin computes clientDir = join(root, "dist/client") so the
 * root must contain that structure.
 */
function makeTmpRoot(subpath: string): string {
	const root = mkdtempSync(join(tmpdir(), "flare-test-"))
	const fullPath = join(root, "dist/client", subpath)
	mkdirSync(join(fullPath, ".."), { recursive: true })
	writeFileSync(fullPath, "console.log('hi')")
	return root
}

/* Drive a single request through the preview server middleware */
async function driveRequest(
	plugin: ReturnType<typeof createPreviewServerPlugin>,
	root: string,
	url: string,
): Promise<{ nextCalled: boolean; statusWritten: number | null }> {
	let capturedMiddleware: ((req: { url?: string }, res: NodeRes, next: (err?: unknown) => void) => void) | null = null

	const fakeServer: PreviewServer = {
		config: { root },
		middlewares: {
			use(fn) {
				capturedMiddleware = fn
			},
		},
	}

	const hook = plugin.configurePreviewServer as (server: unknown) => (() => void) | void
	const returnedFn = hook(fakeServer)
	/* The plugin returns a function that registers itself — call it */
	if (typeof returnedFn === "function") returnedFn()

	if (!capturedMiddleware) throw new Error("middleware not registered")

	const middleware = capturedMiddleware as (
		req: { url?: string },
		res: NodeRes,
		next: (err?: unknown) => void,
	) => Promise<void> | void

	const next = vi.fn()
	let statusWritten: number | null = null
	const res: NodeRes = {
		end: vi.fn(),
		writeHead(status) {
			statusWritten = status
		},
	}

	await middleware({ url }, res, next)

	return { nextCalled: next.mock.calls.length > 0, statusWritten }
}

describe("preview server path matcher", () => {
	it("dev-server-matcher-default", async () => {
		const clientDir = makeTmpRoot("assets/foo.js")

		/* default createPreviewServerPlugin — matches /assets/ */
		const plugin = createPreviewServerPlugin()

		const matched = await driveRequest(plugin, clientDir, "/assets/foo.js")
		expect(matched.nextCalled).toBe(false)
		expect(matched.statusWritten).toBe(200)

		const unmatched = await driveRequest(plugin, clientDir, "/other/foo.js")
		expect(unmatched.nextCalled).toBe(true)
	})

	it("dev-server-matcher-custom", async () => {
		const createPreviewServerPluginExtended = createPreviewServerPlugin as unknown as (
			assetsBase: string,
		) => ReturnType<typeof createPreviewServerPlugin>

		const clientDir = makeTmpRoot("app/assets/foo.js")
		const plugin = createPreviewServerPluginExtended("/app/assets")

		const matched = await driveRequest(plugin, clientDir, "/app/assets/foo.js")
		expect(matched.nextCalled).toBe(false)
		expect(matched.statusWritten).toBe(200)

		const oldPrefix = await driveRequest(plugin, clientDir, "/assets/foo.js")
		expect(oldPrefix.nextCalled).toBe(true)
	})
})
