import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createServer as createViteServer, type Logger, type ViteDevServer } from "vite"
import { afterAll, beforeAll, expect, it } from "vitest"
import { freePort } from "../free-port.ts"
import { flare } from "../../src/vite/plugin/flare.ts"
import { rootLayout, SHELL } from "./vite-app.ts"

// dx/routes.md's "codegen writes the id" through a real `vite dev` (B96, BUGS.md 130): flare() on a port over a
// fixture app, its watcher seeing real file writes and moves, as TanStack Router's generator owns its route strings.
// Vite's watcher ignores everything under a node_modules, so this app lives in the OS temp dir, and its node_modules is
// a link to the repo's, from which the package resolves as an installed app's would.

const MODULES = fileURLToPath(new URL("../../../../node_modules", import.meta.url))

// A page whose id string is `id` and whose text names the page.
function page(id: string): string {
	return `import { createPage } from "@lovrozagar/flare";\nexport const route = createPage(${JSON.stringify(id)}).render(() => <p id="page">served</p>);\n`
}

const lines: string[] = []

// Vite's logger, keeping each info line.
const logger: Logger = {
	info: (message) => void lines.push(message),
	warn: () => undefined,
	warnOnce: () => undefined,
	error: () => undefined,
	clearScreen: () => undefined,
	hasErrorLogged: () => false,
	hasWarned: false,
}

let vite: ViteDevServer | undefined
let root = ""
let origin = ""

beforeAll(async () => {
	root = mkdtempSync(join(tmpdir(), "flare-routes-dev-"))
	symlinkSync(MODULES, join(root, "node_modules"), "dir")
	const files = {
		...SHELL,
		"src/routes/_root_/root.root-layout.tsx": rootLayout("_root_"),
		"src/routes/_root_/home.page.tsx": page("_root_/"),
		"src/routes/_root_/checked/checked.page.tsx": page("_root_/chekced"),
		"src/ids.ts": 'export const ODD = "_root_/odd";\n',
	}
	for (const [path, text] of Object.entries(files)) write(path, text)
	vite = await createViteServer({
		root,
		configFile: false,
		customLogger: logger,
		plugins: [flare()],
		server: { host: "127.0.0.1", port: await freePort(), strictPort: true },
	})
	await vite.listen()
	origin = vite.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? ""
})

afterAll(async () => {
	await vite?.close()
	if (root !== "") rmSync(root, { recursive: true, force: true })
})

function source(path: string): string {
	return readFileSync(join(root, path), "utf8")
}

function write(path: string, text: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true })
	writeFileSync(join(root, path), text)
}

// Polls until `check` holds, for at most 10 s.
async function eventually(check: () => boolean | Promise<boolean>): Promise<void> {
	const deadline = Date.now() + 10_000
	while (!(await check())) {
		if (Date.now() > deadline) throw new Error("timed out")
		await new Promise((resolve) => setTimeout(resolve, 50))
	}
}

async function status(path: string): Promise<number> {
	const response = await fetch(`${origin}${path}`)
	await response.text()
	return response.status
}

// A checked-in wrong id is fixed when the dev server starts, before any request, with one line in the dev log.
it("start fixes", async () => {
	expect(source("src/routes/_root_/checked/checked.page.tsx")).toBe(page("_root_/checked"))
	expect(lines).toContain(
		'[flare:codegen] src/routes/_root_/checked/checked.page.tsx: id "_root_/chekced" -> "_root_/checked"',
	)
	expect(await status("/checked")).toBe(200)
})

// A new page written with any id is rewritten to its path's id, and its URL serves.
it("created page", async () => {
	write("src/routes/_root_/fresh/fresh.page.tsx", page("_root_/"))
	await eventually(() => source("src/routes/_root_/fresh/fresh.page.tsx") === page("_root_/fresh"))
	await eventually(async () => (await status("/fresh")) === 200)
	expect(source("src/routes/_root_/fresh/fresh.page.tsx")).toBe(page("_root_/fresh"))
})

// A page moved to another folder takes that folder's id, and serves there.
it("moved page", async () => {
	write("src/routes/_root_/before/before.page.tsx", page("_root_/before"))
	await eventually(async () => (await status("/before")) === 200)
	renameSync(join(root, "src/routes/_root_/before"), join(root, "src/routes/_root_/after"))
	await eventually(() => source("src/routes/_root_/after/before.page.tsx") === page("_root_/after"))
	await eventually(async () => (await status("/after")) === 200)
	expect(await status("/before")).toBe(404)
})

// An id the scan cannot resolve, a template or an imported name, is left as written: codegen neither checks nor writes
// it, and the page still serves at its path.
it("unresolved id", async () => {
	const template =
		'import { createPage } from "@lovrozagar/flare";\nconst area = "odd";\nexport const route = createPage(`_root_/${area}`).render(() => <p>odd</p>);\n'
	const imported =
		'import { createPage } from "@lovrozagar/flare";\nimport { ODD } from "../../../ids.ts";\nexport const route = createPage(ODD).render(() => <p>imported</p>);\n'
	write("src/routes/_root_/odd/odd.page.tsx", template)
	write("src/routes/_root_/imported/imported.page.tsx", imported)
	// A wrong id written after them is fixed, so codegen has passed over both.
	write("src/routes/_root_/later/later.page.tsx", page("x"))
	await eventually(() => source("src/routes/_root_/later/later.page.tsx") === page("_root_/later"))
	expect(source("src/routes/_root_/odd/odd.page.tsx")).toBe(template)
	expect(source("src/routes/_root_/imported/imported.page.tsx")).toBe(imported)
	await eventually(async () => (await status("/odd")) === 200)
	expect(await status("/imported")).toBe(200)
})
