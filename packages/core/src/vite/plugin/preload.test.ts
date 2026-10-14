import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createBuilder, type Rollup } from "vite";
import { afterEach, expect, it, vi } from "vitest";
import { prerenderApp } from "../prerender/index.ts";
import { flare } from "./flare.ts";
import { entryClosure } from "./preload.ts";

vi.mock("../prerender/index.ts", () => ({ prerenderApp: vi.fn<typeof prerenderApp>(async () => undefined) }));

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// A client entry with two static imports, which each lazy route imports too, and a module only the routes share.
const APP = {
	"client.tsx":
		'import { a } from "./lib/a.ts";\nimport { b } from "./lib/b.ts";\nconsole.log(a, b);\nvoid import("./routes/one.ts");\nvoid import("./routes/two.ts");\n',
	"lib/a.ts": 'import { b } from "./b.ts";\nexport const a = `a${b}`;\n',
	"lib/b.ts": "export const b = String(Math.random());\n",
	"lib/routes-only.ts": "export const only = String(Math.random());\n",
	"routes/one.ts":
		'import { a } from "../lib/a.ts";\nimport { only } from "../lib/routes-only.ts";\nexport const one = a + only;\n',
	"routes/two.ts":
		'import { b } from "../lib/b.ts";\nimport { only } from "../lib/routes-only.ts";\nexport const two = b + only;\n',
	"server.ts": "export const server = {};\n",
};

function project(): string {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "flare-preload-")));
	roots.push(root);
	for (const [name, text] of Object.entries(APP)) {
		mkdirSync(dirname(join(root, "src", name)), { recursive: true });
		writeFileSync(join(root, "src", name), text);
	}
	return root;
}

type Chunk = Rollup.OutputChunk;

async function clientChunks(root: string): Promise<Chunk[]> {
	const app = await createBuilder({
		root,
		configFile: false,
		logLevel: "silent",
		plugins: flare(),
		build: { write: false },
	});
	const client = app.environments.client;
	if (client === undefined) throw new Error("client");
	const result = await app.build(client);
	const list = Array.isArray(result) ? result : [result];
	return list
		.flatMap((item: unknown) =>
			typeof item === "object" && item !== null && "output" in item ? (item.output as unknown[]) : [],
		)
		.filter(
			(file): file is Chunk => typeof file === "object" && file !== null && Reflect.get(file, "type") === "chunk",
		);
}

// The files the client entry imports statically, itself and transitively.
function outputClosure(chunks: readonly Chunk[]): Set<string> {
	const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
	const closure = new Set<string>();
	const visit = (name: string): void => {
		if (closure.has(name)) return;
		closure.add(name);
		for (const next of byName.get(name)?.imports ?? []) visit(next);
	};
	for (const chunk of chunks) if (chunk.isEntry) visit(chunk.fileName);
	return closure;
}

// The chunk files a lazy import's preload list names: Vite writes one list per chunk, `__vite__mapDeps`.
function preloaded(chunks: readonly Chunk[]): Set<string> {
	const names = new Set<string>();
	for (const chunk of chunks) {
		const list = /m\.f\|\|\(m\.f=\[([^\]]*)\]/.exec(chunk.code)?.[1] ?? "";
		for (const other of chunks) if (list.includes(other.fileName.split("/").at(-1) ?? "")) names.add(other.fileName);
	}
	return names;
}

// A lazy route import preloads only what the client entry has not already imported statically: the entry's static
// closure is always evaluated before any dynamic import runs, and WebKit fetches a modulepreload again for a module it
// already has (BUGS.md 79).
it("entry closure not preloaded", async () => {
	const chunks = await clientChunks(project());
	const closure = outputClosure(chunks);
	const hinted = preloaded(chunks);
	expect([...hinted].filter((name) => closure.has(name))).toEqual([]);
	expect(hinted.size).toBeGreaterThan(0);
}, 60_000);

function chunk(fileName: string, facadeModuleId: string | null, imports: string[]): Rollup.OutputChunk {
	return { type: "chunk", fileName, facadeModuleId, isEntry: true, imports } as unknown as Rollup.OutputChunk;
}

// The closure starts at the chunk whose facade is the entry, not at every chunk marked as an entry (Rolldown marks a
// lazy route's chunk too at generateBundle), follows static imports through a cycle once each, and skips an asset.
it("entry closure", () => {
	const bundle: Rollup.OutputBundle = {
		"client.js": chunk("client.js", "/app/src/client.tsx", ["a.js", "style.css"]),
		"a.js": chunk("a.js", null, ["client.js"]),
		"route.js": chunk("route.js", "/app/src/routes/route.ts", ["a.js", "only.js"]),
		"only.js": chunk("only.js", null, []),
		"style.css": { type: "asset", fileName: "style.css" } as unknown as Rollup.OutputAsset,
	};
	expect([...entryClosure(bundle, "/app/src/client.tsx")]).toEqual(["client.js", "a.js"]);
});
