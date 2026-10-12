import { expect, it } from "vitest";
import { fnId } from "../route-meta/index.ts";
import type { Graph } from "./env.ts";
import { boundaryTransform } from "./transform.ts";

const FILE = "src/fns/echo.ts";

function transform(source: string, graph: Graph): string {
	return boundaryTransform(FILE, source, graph)?.code ?? source;
}

const ENV = 'import { createServerOnlyFn, createIsomorphicFn } from "@lovrozagar/flare";\n';
const FN = 'import { createServerFn } from "@lovrozagar/flare/server-fn";\n';

it("env prunes import", () => {
	const source = `${ENV}import { db } from "./db.server";\nexport const load = createServerOnlyFn(() => db.query());\n`;
	const client = transform(source, "client");
	expect(client).not.toContain("db.server");
	expect(client).toContain("createServerOnlyFn()");
	expect(transform(source, "worker")).not.toContain("db.server");
	expect(transform(source, "ssr")).toContain("db.server");
});

it("ssr prunes client import", () => {
	const source = `${ENV}import { confetti } from "browser-only";
export const cheer = createIsomorphicFn().server(() => "quiet").client(() => confetti());
`;
	const ssr = transform(source, "ssr");
	expect(ssr).not.toContain("browser-only");
	expect(ssr).toContain('.server(() => "quiet").client()');
	expect(transform(source, "client")).toContain("browser-only");
});

it("shared import kept", () => {
	const source = `${ENV}import { db } from "./db.server";
export const load = createServerOnlyFn(() => db.query());
export const name = db.name;
`;
	expect(transform(source, "client")).toContain('import { db } from "./db.server";');
});

it("ids", () => {
	const id = fnId(FILE, "echo");
	const source = `${FN}export const echo = createServerFn({ method: "get" }).handler(async () => 1);\n`;
	expect(transform(source, "ssr")).toContain(`createServerFn({ method: "get", __id: "${id}", __name: "echo" })`);
	expect(transform(source, "client")).toContain(
		`createServerFn({ method: "get", __id: "${id}", __name: "echo", __client: true }).handler(undefined)`,
	);
	const bare = `${FN}export const echo = createServerFn().handler(h);\n`;
	expect(transform(bare, "worker")).toContain(`createServerFn({ __id: "${id}", __name: "echo", __client: true })`);
	const trailing = `${FN}export const echo = createServerFn({ method: "post", }).handler(h);\nexport const empty = createServerFn({}).handler(h);\n`;
	const both = transform(trailing, "ssr");
	expect(both).toContain(`createServerFn({ method: "post", __id: "${id}", __name: "echo" })`);
	expect(both).toContain(`createServerFn({ __id: "${fnId(FILE, "empty")}", __name: "empty" })`);
	expect(() => transform(`${FN}export const echo = createServerFn("get").handler(h);\n`, "ssr")).toThrow(
		"src/fns/echo.ts: echo createServerFn() takes a literal object",
	);
	expect(boundaryTransform(FILE, "export const a = 1;\n", "client")).toBeUndefined();
	expect(() => boundaryTransform(FILE, "export const = ;", "client")).toThrow(/^src\/fns\/echo\.ts: /);
});

it("env inside a removed body", () => {
	// The handler is blanked in the client graph, so the env call inside it is checked but not edited twice.
	const source = `${FN}${ENV}export const echo = createServerFn().handler(() => createServerOnlyFn(() => 1)());\n`;
	const client = transform(source, "client");
	expect(client).toContain(".handler(undefined)");
	expect(client).not.toContain("createServerOnlyFn");
});
