import { afterAll, expect, it, vi } from "vitest"
import { builtServer, fixtureApps } from "./vite-app.ts"

// A render-phase throw in a production build, where Solid's server build sanitizes it before Flare sees it: a
// notFound() thrown in render still answers 404, and a bug's log line carries its own message, while the page shows only
// the generic message and the digest (B76, B93, BUGS.md 217).

const apps = fixtureApps()

afterAll(() => apps.removeAll())

const ROOT =
	'import { createRootLayout } from "@lovrozagar/flare";\nexport const route = createRootLayout("_root_").render((props) => <html><head></head><body>{props.children}</body></html>);\n'

function throwing(id: string, thrown: string): string {
	return `import { createPage, notFound } from "@lovrozagar/flare";\nexport const route = createPage(${JSON.stringify(id)}).render(() => { throw ${thrown} });\n`
}

it("production render throws", async () => {
	const lines: string[] = []
	vi.spyOn(console, "error").mockImplementation((...line: unknown[]) => void lines.push(line.map(String).join(" ")))
	const server = await builtServer(
		apps.make({
			"src/routes/_root_/root.root-layout.tsx": ROOT,
			"src/routes/_root_/missing/missing.page.tsx": throwing("_root_/missing", "notFound()"),
			"src/routes/_root_/broken/broken.page.tsx": throwing("_root_/broken", 'new Error("page broke")'),
		}),
	)
	const missing = await server.fetch(new Request("https://example.com/missing"))
	expect(missing.status).toBe(404)
	await missing.text()
	const broken = await server.fetch(new Request("https://example.com/broken"))
	const body = await broken.text()
	expect([broken.status, body.includes("page broke"), body.includes("<h1>Something went wrong</h1>")]).toEqual([
		500,
		false,
		true,
	])
	expect(lines.join("\n")).toContain("page broke")
	vi.restoreAllMocks()
}, 120_000)
