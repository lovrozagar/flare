import { spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { exitOf } from "../e2e/child.ts"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

// Fixture apps built as an app is (B96): files under a temp root, `vite build` from a config file with flare() in a
// child process, as the CLI runs it, and the built server loaded from dist. Shared by the dx files' integration tests.

// Inside the repo's node_modules, so an app's import of the package resolves as an installed app's would.
const FIXTURES = fileURLToPath(new URL("../../../../node_modules/.flare-fixtures/", import.meta.url))
const VITE = fileURLToPath(new URL("../../../../node_modules/vite/bin/vite.js", import.meta.url))

// The files every app shares: the config, the router over the generated map, the server, and the client. An app's own
// files replace any of them.
export const SHELL: Readonly<Record<string, string>> = {
	"vite.config.mjs":
		'import { flare } from "@lovrozagar/flare/vite";\nexport default { logLevel: "error", plugins: [flare()] };\n',
	"src/router.ts":
		'import { createRouter } from "@lovrozagar/flare";\nimport { chunks, layouts, routeTree } from "./_gen/routes.gen.ts";\nexport const router = createRouter({ layouts, routeTree, chunks });\n',
	"src/server.ts":
		'import { createServer } from "@lovrozagar/flare/server";\nimport { router } from "./router.ts";\nexport const server = createServer({ router });\n',
	"src/client.tsx":
		'import { createClient } from "@lovrozagar/flare/client";\nimport { router } from "./router.ts";\ncreateClient(router);\n',
}

// A root layout whose body names the root, so a response shows which document it is.
export function rootLayout(id: string): string {
	return `import { createRootLayout } from "@lovrozagar/flare";\nexport const route = createRootLayout(${JSON.stringify(id)}).render((props) => <html><head><title>t</title></head><body data-root=${JSON.stringify(id)}>{props.children}</body></html>);\n`
}

// A page that prints its id and its params. `chain` goes between the builder call and the loader.
export function page(id: string, chain = ""): string {
	return `import { createPage } from "@lovrozagar/flare";\nexport const route = createPage(${JSON.stringify(id)})${chain}.loader((ctx) => ({ params: JSON.stringify(ctx.params) })).render((props) => <p id="page">{${JSON.stringify(id)}} {props.loaderData.params}</p>);\n`
}

// Fixture apps under the repo's node_modules: `make(files)` writes the shell and the files, which are root-relative,
// and returns the root; `removeAll()` deletes every app made.
export function fixtureApps(): { make: (files: Record<string, string>) => string; removeAll: () => void } {
	const roots: string[] = []
	return {
		make(files) {
			mkdirSync(FIXTURES, { recursive: true })
			const root = mkdtempSync(join(FIXTURES, "app-"))
			roots.push(root)
			for (const [path, source] of Object.entries({ ...SHELL, ...files })) {
				mkdirSync(dirname(join(root, path)), { recursive: true })
				writeFileSync(join(root, path), source)
			}
			return root
		},
		removeAll() {
			for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
		},
	}
}

export type Built = { status: number | null; signal: NodeJS.Signals | null; output: string }

// `vite build` in a child process, with NODE_ENV production as a deploy builds: the test runner's `test` would select
// Solid's development server build.
export function viteBuild(root: string): Promise<Built> {
	const child = spawn(process.execPath, [VITE, "build"], {
		cwd: root,
		env: { ...process.env, NODE_ENV: "production" },
		stdio: ["ignore", "pipe", "pipe"],
	})
	let output = ""
	child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()))
	child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()))
	return new Promise((done) => child.on("close", (status, signal) => done({ status, signal, output })))
}

// The output of a build that failed on its own, for a case that asserts the error a build prints. A build a signal
// ended throws naming the signal, so a kill never reads as the build's own failure or as empty output, and a build
// that passed throws too (BUGS.md 500.6).
export function failedBuild(built: Built): string {
	if (built.signal !== null) throw new Error(`vite build ${exitOf(built.status, built.signal)}`)
	if (built.status === 0) throw new Error("the build passed")
	return built.output
}

export type Server = { fetch: (request: Request) => Promise<Response> }

// The app built, and its server, or the failure: how the build exited, its code or the signal that killed it, then
// what it printed (BUGS.md 128.13).
export async function builtServer(root: string): Promise<Server> {
	const built = await viteBuild(root)
	if (built.status !== 0) {
		const printed = built.output === "" ? "" : `\n${built.output}`
		throw new Error(`vite build exited (${exitOf(built.status, built.signal)})${printed}`)
	}
	const loaded: { server: Server } = await import(pathToFileURL(join(root, "dist/server/server.js")).href)
	return loaded.server
}
