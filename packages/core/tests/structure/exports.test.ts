import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "oxc-parser";
import { afterAll, beforeAll, expect, it } from "vitest";
import { packCore, type Packed } from "../../../../scripts/release.ts";

// The packager contract (bits/14), against the tarball `npm pack` writes, installed into a stage the way an app gets it.
const core = fileURLToPath(new URL("../../", import.meta.url));
const repo = join(core, "../..");
const BUILD = 240_000;
let packed: Packed;

beforeAll(() => {
	packed = packCore();
}, BUILD);

afterAll(() => packed?.close());

function files(dir: string, suffix: string): string[] {
	return readdirSync(dir, { recursive: true, encoding: "utf8" })
		.filter((name) => name.endsWith(suffix) && statSync(join(dir, name)).isFile())
		.map((name) => join(dir, name));
}

// The `.` and `./x` headings of 03-surface, the one list of public subpaths.
function surfaceKeys(): string[] {
	const text = readFileSync(join(repo, "blueprint/03-surface.md"), "utf8");
	return [...text.matchAll(/^## `(\.[^`]*)`$/gm)].map((match) => String(match[1])).filter((key) => !key.includes("<"));
}

function exportsOf(): Record<string, unknown> {
	return Object(Reflect.get(packed.manifest, "exports"));
}

// Node's own resolver, run from the stage, so `default` resolves through the packed manifest.
function resolveFromStage(specs: readonly string[]): Record<string, string> {
	const script = join(packed.stage, "resolve.mjs");
	writeFileSync(
		script,
		"const out = {};\nfor (const spec of JSON.parse(process.argv[2])) {\n\ttry {\n\t\tout[spec] = import.meta.resolve(spec);\n\t} catch (error) {\n\t\tout[spec] = `ERR ${error.code}`;\n\t}\n}\nconsole.log(JSON.stringify(out));\n",
	);
	return JSON.parse(execFileSync(process.execPath, [script, JSON.stringify(specs)], { encoding: "utf8" }));
}

function specifier(key: string): string {
	return key === "." ? "@lovrozagar/flare" : `@lovrozagar/flare${key.slice(1)}`;
}

it("subpath resolves", () => {
	const keys = surfaceKeys();
	expect(keys).toContain("./vite");
	const entries = exportsOf();
	const resolved = resolveFromStage(keys.map(specifier));
	for (const key of keys) {
		const target = fileURLToPath(String(resolved[specifier(key)]));
		expect(relative(packed.root, target).startsWith("..")).toBe(false);
		expect(statSync(target).isFile()).toBe(true);
		if (key === "./package.json") continue;
		const types = String(Reflect.get(Object(entries[key]), "types"));
		expect(statSync(join(packed.root, types)).isFile()).toBe(true);
	}
});

it("font subpath", () => {
	const registry: Record<string, unknown> = JSON.parse(
		readFileSync(join(core, "src/features/fonts/registry.json"), "utf8"),
	);
	const [id] = Object.keys(registry).toSorted();
	const resolved = fileURLToPath(
		String(resolveFromStage([`@lovrozagar/flare/fonts/${id}`])[`@lovrozagar/flare/fonts/${id}`]),
	);
	expect(relative(packed.root, resolved)).toBe(`dist/features/fonts/shared/generated/${id}.js`);
	const imports = [...readFileSync(resolved, "utf8").matchAll(/from\s*"([^"]+)"/g)].map((match) => match[1]);
	expect(imports.length).toBeGreaterThan(0);
	expect(imports.every((path) => !String(path).includes("generated") && !String(path).startsWith("./"))).toBe(true);
	const pattern = Object(exportsOf()["./fonts/*"]);
	expect(statSync(join(packed.root, String(pattern.types).replace("*", String(id)))).isFile()).toBe(true);
	// A pattern export maps any id to a path, so an id that is not a key names a file the tarball does not hold.
	const missing = resolveFromStage(["@lovrozagar/flare/fonts/not-a-family"])["@lovrozagar/flare/fonts/not-a-family"];
	expect(existsSync(fileURLToPath(String(missing)))).toBe(false);
});

it("font barrel", () => {
	expect(resolveFromStage(["@lovrozagar/flare/fonts"])["@lovrozagar/flare/fonts"]).toBe(
		"ERR ERR_PACKAGE_PATH_NOT_EXPORTED",
	);
});

it("no solid condition", () => {
	for (const [key, value] of Object.entries(exportsOf())) {
		if (typeof value !== "object" || value === null || key === "./server-fn") continue;
		expect([key, ...Object.keys(value).toSorted()]).toEqual([key, "default", "types"]);
	}
	expect(Object.keys(Object(exportsOf()["./server-fn"]))).toEqual(["types", "workerd", "browser", "worker", "default"]);
});

// One compiled file renders under Solid's DOM build in a browser bundle and under its server build in Node.
it("compiled default", () => {
	for (const file of files(join(packed.root, "dist"), ".js")) {
		expect([file, parseSync(file, readFileSync(file, "utf8"), { lang: "js" }).errors]).toEqual([file, []]);
	}
	const entry = join(packed.stage, "render-dom.js");
	writeFileSync(
		entry,
		'import { createComponent } from "solid-js";\nimport { render } from "@solidjs/web";\nimport { Image } from "@lovrozagar/flare";\nrender(() => createComponent(Image, { src: "/a.png", alt: "dom" }), document.body);\n',
	);
	const bundle = join(packed.stage, "dom.js");
	execFileSync("bun", [
		"build",
		entry,
		"--target=browser",
		"--format=iife",
		"--define=import.meta.env={}",
		"--outfile",
		bundle,
	]);
	// The bundle runs as a classic script in a jsdom document, in a child Node, as a browser would run it.
	const runner = join(packed.stage, "run-dom.mjs");
	writeFileSync(
		runner,
		'import { readFileSync } from "node:fs";\nimport { JSDOM } from "jsdom";\nconst dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only" });\ndom.window.eval(readFileSync(process.argv[2], "utf8"));\nconsole.log(dom.window.document.body.innerHTML);\n',
	);
	expect(execFileSync(process.execPath, [runner, bundle], { encoding: "utf8" })).toContain('alt="dom"');
	const server = join(packed.stage, "render-server.mjs");
	writeFileSync(
		server,
		'import { createComponent } from "solid-js";\nimport { renderToString } from "@solidjs/web";\nimport { Image } from "@lovrozagar/flare";\nconsole.log(renderToString(() => createComponent(Image, { src: "/a.png", alt: "server" })));\n',
	);
	expect(execFileSync(process.execPath, [server], { encoding: "utf8" })).toContain('alt="server"');
});

it("no src path in dts", () => {
	const declarations = files(join(packed.root, "dist"), ".d.ts");
	expect(declarations.length).toBeGreaterThan(0);
	for (const file of declarations) {
		const text = readFileSync(file, "utf8");
		expect([file, text.includes("virtual:"), text.includes("packages/core/src")]).toEqual([file, false, false]);
	}
});

it("tarball contents", () => {
	const top = new Set(packed.entries.map((entry) => entry.replace(/^package\//, "").split("/")[0]));
	expect([...top].toSorted()).toEqual(["LICENSE", "README.md", "dist", "package.json", "src"]);
	expect(packed.entries.some((entry) => /\.test\.tsx?$/.test(entry))).toBe(false);
});

it("consumer strict", () => {
	const fixture = join(core, "tests/structure/consumer");
	const target = join(packed.stage, "consumer");
	cpSync(fixture, target, { recursive: true });
	const tsc = join(repo, "node_modules/typescript/bin/tsc");
	const result = spawnSync(process.execPath, [tsc, "-p", join(target, "tsconfig.json")], { encoding: "utf8" });
	expect([result.status, result.stdout]).toEqual([0, ""]);
});

it("no dependencies", () => {
	expect(packed.manifest).not.toHaveProperty("dependencies");
	// Extracting the tarball is the whole install only while no lifecycle script runs (G2).
	const scripts = Object(Reflect.get(packed.manifest, "scripts"));
	for (const name of ["preinstall", "install", "postinstall", "prepare"]) expect(scripts).not.toHaveProperty(name);
});

it("image module types", () => {
	const vite = join(packed.root, "dist/exports/vite.d.ts");
	const reference = /<reference path="([^"]+)"/.exec(readFileSync(vite, "utf8"))?.[1];
	expect(reference).toBeDefined();
	const declared = join(dirname(vite), String(reference));
	expect(relative(packed.root, declared)).toBe("dist/features/image/vite/modules.d.ts");
	expect(readFileSync(declared, "utf8")).toBe(readFileSync(join(core, "src/features/image/vite/modules.d.ts"), "utf8"));
});

it("peer floors", () => {
	const source = JSON.parse(readFileSync(join(core, "package.json"), "utf8"));
	const peers: Record<string, string> = Object(Reflect.get(packed.manifest, "peerDependencies"));
	expect(Object.keys(peers).length).toBeGreaterThan(0);
	for (const [name, range] of Object.entries(peers))
		expect([name, range]).toEqual([name, `>=${source.devDependencies[name]}`]);
	const meta: Record<string, { optional?: boolean }> = Object(Reflect.get(packed.manifest, "peerDependenciesMeta"));
	const optional = Object.entries(meta)
		.filter(([, value]) => value.optional === true)
		.map(([name]) => name)
		.toSorted();
	expect(optional).toEqual(["@formatjs/intl-localematcher", "@tanstack/solid-query", "isbot", "negotiator", "sharp"]);
});

it("not a peer", () => {
	const keys = ["peerDependencies", "dependencies", "optionalDependencies"].flatMap((field) =>
		Object.keys(Object(Reflect.get(packed.manifest, field))),
	);
	for (const name of [
		"@babel/parser",
		"tailwindcss",
		"oxc-resolver",
		"node-html-markdown",
		"@tanstack/query-broadcast-client-experimental",
		"@types/negotiator",
	]) {
		expect(keys).not.toContain(name);
	}
});
