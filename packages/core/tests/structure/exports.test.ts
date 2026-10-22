import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process"
import { connect } from "node:net"
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { parseSync } from "oxc-parser"
import { onFreePort } from "../../../../scripts/free-port.ts"
import { afterAll, beforeAll, expect, it } from "vitest"
import { packCore, type Packed } from "../../../../scripts/release.ts"
import { identifiers, marked, quickStart, readme, tableRows } from "./readme.ts"

// The packager contract (bits/14), against the tarball `npm pack` writes, installed into a stage the way an app gets it.
const core = fileURLToPath(new URL("../../", import.meta.url))
const repo = join(core, "../..")
const BUILD = 240_000
let packed: Packed

beforeAll(() => {
	packed = packCore()
}, BUILD)

afterAll(() => packed?.close())

function files(dir: string, suffix: string): string[] {
	return readdirSync(dir, { recursive: true, encoding: "utf8" })
		.filter((name) => name.endsWith(suffix) && statSync(join(dir, name)).isFile())
		.map((name) => join(dir, name))
}

// The `.` and `./x` headings of 03-surface, the one list of public subpaths.
function surfaceKeys(): string[] {
	const text = readFileSync(join(repo, "blueprint/03-surface.md"), "utf8")
	return [...text.matchAll(/^## `(\.[^`]*)`$/gm)].map((match) => String(match[1])).filter((key) => !key.includes("<"))
}

function exportsOf(): Record<string, unknown> {
	return Object(Reflect.get(packed.manifest, "exports"))
}

// The runtime's own resolver, run from the stage, so `default` resolves through the packed manifest.
function resolveFromStage(specs: readonly string[]): Record<string, string> {
	const script = join(packed.stage, "resolve.mjs")
	writeFileSync(
		script,
		"const out = {};\nfor (const spec of JSON.parse(process.argv[2])) {\n\ttry {\n\t\tout[spec] = import.meta.resolve(spec);\n\t} catch (error) {\n\t\tout[spec] = `ERR ${error.code}`;\n\t}\n}\nconsole.log(JSON.stringify(out));\n",
	)
	return JSON.parse(execFileSync(process.execPath, [script, JSON.stringify(specs)], { encoding: "utf8" }))
}

// The stage resolves with the runtime under test, so each runtime's own answer is the expectation (BUGS.md B47). Node
// refuses an unexported subpath with ERR_PACKAGE_PATH_NOT_EXPORTED and maps a pattern to a URL whether or not its file
// exists. Bun answers both with ERR_MODULE_NOT_FOUND.
const RESOLVER =
	process.versions["bun"] === undefined
		? { notExported: "ERR ERR_PACKAGE_PATH_NOT_EXPORTED", missingPattern: "absent file" }
		: { notExported: "ERR ERR_MODULE_NOT_FOUND", missingPattern: "ERR ERR_MODULE_NOT_FOUND" }

// What a resolution names: its error, or whether the file it maps to exists.
function outcome(resolved: string): string {
	if (resolved.startsWith("ERR ")) return resolved
	return existsSync(fileURLToPath(resolved)) ? "file" : "absent file"
}

function specifier(key: string): string {
	return key === "." ? "@lovrozagar/flare" : `@lovrozagar/flare${key.slice(1)}`
}

it("subpath resolves", () => {
	const keys = surfaceKeys()
	expect(keys).toContain("./vite")
	const entries = exportsOf()
	const resolved = resolveFromStage(keys.map(specifier))
	for (const key of keys) {
		const target = fileURLToPath(String(resolved[specifier(key)]))
		expect(relative(packed.root, target).startsWith("..")).toBe(false)
		expect(statSync(target).isFile()).toBe(true)
		if (key === "./package.json") continue
		const types = String(Reflect.get(Object(entries[key]), "types"))
		expect(statSync(join(packed.root, types)).isFile()).toBe(true)
	}
})

it("font subpath", () => {
	const registry: Record<string, unknown> = JSON.parse(
		readFileSync(join(core, "src/features/fonts/registry.json"), "utf8"),
	)
	const [id] = Object.keys(registry).toSorted()
	const resolved = fileURLToPath(
		String(resolveFromStage([`@lovrozagar/flare/fonts/${id}`])[`@lovrozagar/flare/fonts/${id}`]),
	)
	expect(relative(packed.root, resolved)).toBe(`dist/features/fonts/shared/generated/${id}.js`)
	const imports = [...readFileSync(resolved, "utf8").matchAll(/from\s*"([^"]+)"/g)].map((match) => match[1])
	expect(imports.length).toBeGreaterThan(0)
	expect(imports.every((path) => !String(path).includes("generated") && !String(path).startsWith("./"))).toBe(true)
	const pattern = Object(exportsOf()["./fonts/*"])
	expect(statSync(join(packed.root, String(pattern.types).replace("*", String(id)))).isFile()).toBe(true)
	// A pattern export maps any id to a path, so an id that is not a key names a file the tarball does not hold.
	const missing = resolveFromStage(["@lovrozagar/flare/fonts/not-a-family"])["@lovrozagar/flare/fonts/not-a-family"]
	expect(outcome(String(missing))).toBe(RESOLVER.missingPattern)
})

it("font barrel", () => {
	expect(resolveFromStage(["@lovrozagar/flare/fonts"])["@lovrozagar/flare/fonts"]).toBe(RESOLVER.notExported)
})

it("no solid condition", () => {
	for (const [key, value] of Object.entries(exportsOf())) {
		if (typeof value !== "object" || value === null || key === "./server-fn") continue
		expect([key, ...Object.keys(value).toSorted()]).toEqual([key, "default", "types"])
	}
	expect(Object.keys(Object(exportsOf()["./server-fn"]))).toEqual(["types", "workerd", "browser", "worker", "default"])
})

// One compiled file renders under Solid's DOM build in a browser bundle and under its server build in Node.
it("compiled default", () => {
	for (const file of files(join(packed.root, "dist"), ".js")) {
		expect([file, parseSync(file, readFileSync(file, "utf8"), { lang: "js" }).errors]).toEqual([file, []])
	}
	const entry = join(packed.stage, "render-dom.js")
	writeFileSync(
		entry,
		'import { createComponent } from "solid-js";\nimport { render } from "@solidjs/web";\nimport { Image } from "@lovrozagar/flare";\nrender(() => createComponent(Image, { src: "/a.png", alt: "dom" }), document.body);\n',
	)
	const bundle = join(packed.stage, "dom.js")
	execFileSync("bun", [
		"build",
		entry,
		"--target=browser",
		"--format=iife",
		"--define=import.meta.env={}",
		"--outfile",
		bundle,
	])
	// The bundle runs as a classic script in a jsdom document, in a child Node, as a browser would run it.
	const runner = join(packed.stage, "run-dom.mjs")
	writeFileSync(
		runner,
		'import { readFileSync } from "node:fs";\nimport { JSDOM } from "jsdom";\nconst dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only" });\ndom.window.eval(readFileSync(process.argv[2], "utf8"));\nconsole.log(dom.window.document.body.innerHTML);\n',
	)
	expect(execFileSync(process.execPath, [runner, bundle], { encoding: "utf8" })).toContain('alt="dom"')
	const server = join(packed.stage, "render-server.mjs")
	writeFileSync(
		server,
		'import { createComponent } from "solid-js";\nimport { renderToString } from "@solidjs/web";\nimport { Image } from "@lovrozagar/flare";\nconsole.log(renderToString(() => createComponent(Image, { src: "/a.png", alt: "server" })));\n',
	)
	expect(execFileSync(process.execPath, [server], { encoding: "utf8" })).toContain('alt="server"')
	// flare() swaps these modules by path at load time, so each stays its own file and its importers still import it.
	for (const file of ["server/lifecycle/build-info.js", "client/sync/enabled.js", "shared/css/sheet.js"]) {
		expect([file, existsSync(join(packed.root, "dist", file))]).toEqual([file, true])
	}
	expect(readFileSync(join(packed.root, "dist/server/render/document.js"), "utf8")).toContain(
		'from "../lifecycle/build-info.js"',
	)
	// The plugin graph loads in plain Node from the tarball, the font registry data included.
	const plugin = join(packed.stage, "load-vite.mjs")
	writeFileSync(
		plugin,
		'const { flare } = await import("@lovrozagar/flare/vite");\nconsole.log(flare({ fonts: { dir: "fonts" } }).length);\n',
	)
	expect(Number(execFileSync(process.execPath, [plugin], { encoding: "utf8" }))).toBeGreaterThan(0)
})

it("no src path in dts", () => {
	const declarations = files(join(packed.root, "dist"), ".d.ts")
	expect(declarations.length).toBeGreaterThan(0)
	for (const file of declarations) {
		const text = readFileSync(file, "utf8")
		expect([file, text.includes("virtual:"), text.includes("packages/core/src")]).toEqual([file, false, false])
	}
})

// The names 03-surface promises per entry: the root table's first column, and each other entry's `Exports:` line.
function surfaceNames(): Map<string, string[]> {
	const text = readFileSync(join(repo, "blueprint/03-surface.md"), "utf8")
	const names = new Map<string, string[]>()
	for (const section of text.split(/^## /m).slice(1)) {
		const key = /^`(\.[^`]*)`/.exec(section)?.[1]
		if (key === undefined || key.includes("<")) continue
		const line = /^Exports: (.+)$/m.exec(section)?.[1]
		const rows = key === "." ? [...section.matchAll(/^\| ([^|]+) \|/gm)].map((row) => String(row[1])) : [line ?? ""]
		const found = rows.flatMap((cell) => [...cell.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((match) => String(match[1])))
		if (found.length > 0)
			names.set(
				key,
				found.filter((name) => name !== "export"),
			)
	}
	return names
}

// The names a declaration file exports: its export lists, declarations, and default.
function declaredExports(path: string): Set<string> {
	const names = new Set<string>()
	for (const node of parseSync(path, readFileSync(path, "utf8")).program.body) {
		if (node.type === "ExportDefaultDeclaration") names.add("default")
		if (node.type !== "ExportNamedDeclaration") continue
		for (const specifier of node.specifiers) {
			const exported = specifier.exported
			names.add(exported.type === "Identifier" ? exported.name : String(exported.value))
		}
		const declaration = node.declaration
		if (declaration === null) continue
		if ("id" in declaration && declaration.id !== null && "name" in declaration.id) names.add(declaration.id.name)
		if (declaration.type === "VariableDeclaration") {
			for (const item of declaration.declarations) if (item.id.type === "Identifier") names.add(item.id.name)
		}
	}
	return names
}

// Every name 03-surface promises for an entry is exported by that entry's packed declarations. A subpath that
// resolves is not enough: the root once lacked `redirect`, `notFound`, and five more it listed (BUGS.md 105).
it("surface names", () => {
	const missing: string[] = []
	for (const [key, names] of surfaceNames()) {
		const types = String(Reflect.get(Object(exportsOf()[key]), "types"))
		const exported = declaredExports(join(packed.root, types))
		for (const name of names) if (!exported.has(name)) missing.push(`${key} ${name}`)
	}
	expect(missing).toEqual([])
})

// The README's export map names every export of every packed entry, and nothing an entry does not export (plan 14
// leaf 12.3).
it("readme exports", () => {
	const rows = new Map(
		tableRows(readme, "entry").map(([entry = "", names = ""]) => [entry.replaceAll("`", ""), identifiers(names)]),
	)
	const wrong: string[] = []
	for (const [key, value] of Object.entries(exportsOf())) {
		if (typeof value !== "object" || value === null || key.includes("*")) continue
		const entry = key === "." ? "@lovrozagar/flare" : `@lovrozagar/flare/${key.slice(2)}`
		const named = rows.get(entry) ?? []
		const exported = declaredExports(join(packed.root, String(Reflect.get(value, "types"))))
		for (const name of exported) if (!named.includes(name)) wrong.push(`${entry}: ${name} is not in the README`)
		for (const name of named) if (!exported.has(name)) wrong.push(`${entry}: ${name} is not exported`)
	}
	expect(wrong).toEqual([])
})

// Every name an API table of the README lists, the first column of a table headed `export`, is exported by the entry its
// `from` column names, so a reader imports it from the right place and a v0 name nobody thought to deny cannot survive.
it("readme api names", () => {
	const entries = new Map(
		Object.entries(exportsOf()).flatMap(([key, value]) =>
			typeof value === "object" && value !== null && !key.includes("*")
				? [[key === "." ? "@lovrozagar/flare" : `@lovrozagar/flare/${key.slice(2)}`, value] as const]
				: [],
		),
	)
	const rows = tableRows(readme, "export")
	expect(rows.length).toBeGreaterThan(50)
	const wrong = rows.flatMap(([cell = "", from = ""]) => {
		const entry = entries.get(from.replaceAll("`", ""))
		if (entry === undefined) return [`${cell}: no entry ${from}`]
		const exported = declaredExports(join(packed.root, String(Reflect.get(entry, "types"))))
		return identifiers(cell).flatMap((name) => (exported.has(name) ? [] : [`${name} is not exported by ${from}`]))
	})
	expect(wrong).toEqual([])
})

// The README's quick start compiles: each marked block is written at its path in a fresh app beside the installed
// tarball, the packed `flare codegen` writes src/_gen, and tsc checks the app under the README's own tsconfig.
it(
	"readme quick start",
	() => {
		const app = join(packed.stage, "quick-start")
		for (const block of quickStart(readme)) {
			mkdirSync(dirname(join(app, block.path)), { recursive: true })
			writeFileSync(join(app, block.path), block.code)
		}
		writeFileSync(join(app, "package.json"), '{ "type": "module" }\n')
		execFileSync(process.execPath, [join(packed.stage, "node_modules/.bin/flare"), "codegen"], { cwd: app })
		const tsc = join(repo, "node_modules/typescript/bin/tsc")
		const result = spawnSync(process.execPath, [tsc, "-p", join(app, "tsconfig.json")], { encoding: "utf8" })
		expect([result.status, result.stdout]).toEqual([0, ""])
	},
	BUILD,
)

// The README's serve.js in `app`, once it answers the stub's 404. A server that never answers says why, its exit and its
// output (BUGS.md 492); one whose port was taken before it listened runs again on another (BUGS.md 493).
function serveReadme(app: string): Promise<{ child: ChildProcess; port: number }> {
	return onFreePort(async (port) => {
		const child = spawn(process.execPath, [join(app, "serve.js")], {
			cwd: app,
			env: { ...process.env, PORT: String(port) },
		})
		let output = ""
		child.stdout?.on("data", (chunk: Buffer) => void (output += String(chunk)))
		child.stderr?.on("data", (chunk: Buffer) => void (output += String(chunk)))
		const deadline = Date.now() + 10_000
		while (Date.now() < deadline && child.exitCode === null) {
			const status = await fetch(`http://127.0.0.1:${port}/`).then(
				(response) => response.status,
				() => 0,
			)
			if (status === 404) return { child, port }
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
		child.kill()
		throw new Error(`no answer; exit ${child.exitCode ?? child.signalCode ?? "none yet"}; output: ${output}`)
	})
}

// The README's Node server runs: written beside a stub build in the stage, it serves a client file, hands the rest to
// the listener, answers a path `decodeURIComponent` rejects with a status instead of dying on the rejection, and exits
// 0 on SIGTERM once drained (plan 21 16.11).
it("readme node serve", async () => {
	const app = join(packed.stage, "node-serve")
	const [example] = marked(readme, "node-serve")
	mkdirSync(join(app, "dist/server"), { recursive: true })
	mkdirSync(join(app, "dist/client"), { recursive: true })
	writeFileSync(join(app, example?.path ?? "serve.js"), example?.code ?? "")
	writeFileSync(join(app, "package.json"), '{ "type": "module" }\n')
	writeFileSync(
		join(app, "dist/server/server.js"),
		'export const server = { fetch: () => new Response("app", { status: 404 }), bodyLimit: 1 };\n',
	)
	writeFileSync(join(app, "dist/client/app.js"), "export {};\n")
	const { child, port } = await serveReadme(app)
	try {
		const origin = `http://127.0.0.1:${port}`
		const file = await fetch(`${origin}/app.js`)
		expect([file.status, file.headers.get("content-type")]).toEqual([200, "text/javascript"])
		const bad = await rawStatus(port, "/%E0%A4%A")
		expect(typeof bad).toBe("number")
		expect((await fetch(`${origin}/`)).status).toBe(404)
		const exited = new Promise<number | string | null>((resolve) =>
			child.once("exit", (code, signal) => resolve(code ?? signal)),
		)
		child.kill("SIGTERM")
		expect(await exited).toBe(0)
	} finally {
		child.kill()
	}
}, 30_000)

it("tarball contents", () => {
	const top = new Set(packed.entries.map((entry) => entry.replace(/^package\//, "").split("/")[0]))
	expect([...top].toSorted()).toEqual(["LICENSE", "README.md", "dist", "package.json", "src"])
	expect(packed.entries.some((entry) => /\.test\.tsx?$/.test(entry))).toBe(false)
})

it("consumer strict", () => {
	const fixture = join(core, "tests/structure/consumer")
	const target = join(packed.stage, "consumer")
	cpSync(fixture, target, { recursive: true })
	const tsc = join(repo, "node_modules/typescript/bin/tsc")
	const result = spawnSync(process.execPath, [tsc, "-p", join(target, "tsconfig.json")], { encoding: "utf8" })
	expect([result.status, result.stdout]).toEqual([0, ""])
})

it("no dependencies", () => {
	expect(packed.manifest).not.toHaveProperty("dependencies")
	// Extracting the tarball is the whole install only while no lifecycle script runs (G2).
	const scripts = Object(Reflect.get(packed.manifest, "scripts"))
	for (const name of ["preinstall", "install", "postinstall", "prepare"]) expect(scripts).not.toHaveProperty(name)
})

it("image module types", () => {
	const vite = join(packed.root, "dist/exports/vite.d.ts")
	const reference = /<reference path="([^"]+)"/.exec(readFileSync(vite, "utf8"))?.[1]
	expect(reference).toBeDefined()
	const declared = join(dirname(vite), String(reference))
	expect(relative(packed.root, declared)).toBe("dist/features/image/vite/modules.d.ts")
	expect(readFileSync(declared, "utf8")).toBe(readFileSync(join(core, "src/features/image/vite/modules.d.ts"), "utf8"))
})

// The packed manifest declares the published Node floor (B3), which the consumer cell `node floor` runs on (plan 21
// 5.5), so a package manager warns an app on an older Node.
it("engines", () => {
	expect(Reflect.get(packed.manifest, "engines")).toEqual({ node: ">=22.12" })
})

// A peer whose next release is known broken takes an upper bound below it, each named here with its BUGS row. None
// is capped now: Solid rc.17 carries the fixes for BUGS 426, and the Vite plugin's next.51 installs beside it (BUGS 490).
const CAPPED: Record<string, string> = {}

it("peer floors", () => {
	const source = JSON.parse(readFileSync(join(core, "package.json"), "utf8"))
	const peers: Record<string, string> = Object(Reflect.get(packed.manifest, "peerDependencies"))
	expect(Object.keys(peers).length).toBeGreaterThan(0)
	for (const [name, range] of Object.entries(peers)) {
		const cap = CAPPED[name] === undefined ? "" : ` ${CAPPED[name]}`
		expect([name, range]).toEqual([name, `>=${source.devDependencies[name]}${cap}`])
	}
	const meta: Record<string, { optional?: boolean }> = Object(Reflect.get(packed.manifest, "peerDependenciesMeta"))
	const optional = Object.entries(meta)
		.filter(([, value]) => value.optional === true)
		.map(([name]) => name)
		.toSorted()
	expect(optional).toEqual(["@formatjs/intl-localematcher", "@tanstack/solid-query", "isbot", "negotiator", "sharp"])
})

// A peer floor below a known advisory lets an app resolve the vulnerable version: sharp below 0.35.5 carries two
// high-severity advisories, GHSA-wq5f-xc86-pv6w (librsvg) and GHSA-rgj7-g3m4-5g8c (libheif) (plan 21 14.3, BUGS.md 218).
it("advisory floors", () => {
	const peers: Record<string, string> = Object(Reflect.get(packed.manifest, "peerDependencies"))
	const [major, minor, patch] = (peers["sharp"] ?? "").replace(">=", "").split(".").map(Number)
	expect((major ?? 0) * 1e6 + (minor ?? 0) * 1e3 + (patch ?? 0)).toBeGreaterThanOrEqual(35_005)
})

it("not a peer", () => {
	const keys = ["peerDependencies", "dependencies", "optionalDependencies"].flatMap((field) =>
		Object.keys(Object(Reflect.get(packed.manifest, field))),
	)
	// The app depends on Cloudflare's plugin itself and composes it beside flare(), which imports none of it (B109).
	for (const name of [
		"@cloudflare/vite-plugin",
		"@babel/parser",
		"tailwindcss",
		"oxc-resolver",
		"node-html-markdown",
		"@tanstack/query-broadcast-client-experimental",
		"@types/negotiator",
	]) {
		expect(keys).not.toContain(name)
	}
})

// A request with the target exactly as written: fetch would normalize a malformed escape away. The status, or the
// socket error when the server died.
function rawStatus(port: number, target: string): Promise<number | string> {
	return new Promise((resolve) => {
		const socket = connect(port, "127.0.0.1")
		let text = ""
		socket.on("data", (chunk: Buffer) => void (text += chunk.toString("latin1")))
		socket.on("error", (error: NodeJS.ErrnoException) => resolve(error.code ?? error.message))
		socket.on("close", () => resolve(Number(/^HTTP\/1\.1 (\d{3})/.exec(text)?.[1] ?? Number.NaN) || "no status"))
		socket.end(`GET ${target} HTTP/1.1\r\nhost: 127.0.0.1:${port}\r\nconnection: close\r\n\r\n`)
	})
}
