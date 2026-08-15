import { describe, expect, it, vi } from "vitest";

/* Mock vite-plugin-solid to avoid esbuild binary in jsdom */
vi.mock("vite-plugin-solid", () => ({
	default: (opts: Record<string, unknown>) => ({ config: () => ({ solid: opts }), name: "solid" }),
}));

import { transformEnvFns } from "../../../src/plugins/index.ts";

describe("transformEnvFns", () => {
	describe("createServerOnlyFn", () => {
		const code = `const getDb = createServerOnlyFn(() => new Database("postgres://..."))`;

		it("SSR: unwraps to the original function", () => {
			const result = transformEnvFns(code, true);
			expect(result).toBe(`const getDb = (() => new Database("postgres://..."))`);
		});

		it("client: replaces with throwing stub", () => {
			const result = transformEnvFns(code, false);
			expect(result).toContain("Server-only function called on client");
			expect(result).not.toContain("Database");
		});

		it("handles nested parens in function body", () => {
			const nested = "const fn = createServerOnlyFn((a, b) => doThing(a, nested(b)))";
			const result = transformEnvFns(nested, true);
			expect(result).toBe("const fn = ((a, b) => doThing(a, nested(b)))");
		});
	});

	describe("createClientOnlyFn", () => {
		const code = `const getUser = createClientOnlyFn(() => JSON.parse(localStorage.getItem("user")))`;

		it("client: unwraps to the original function", () => {
			const result = transformEnvFns(code, false);
			expect(result).toBe(`const getUser = (() => JSON.parse(localStorage.getItem("user")))`);
		});

		it("SSR: replaces with throwing stub", () => {
			const result = transformEnvFns(code, true);
			expect(result).toContain("Client-only function called on server");
			expect(result).not.toContain("localStorage");
		});
	});

	describe("createIsomorphicFn", () => {
		it("server-first chain: SSR extracts server impl", () => {
			const code = "const getUser = createIsomorphicFn().server(() => db.getUser()).client(() => fromLocalStorage())";
			const result = transformEnvFns(code, true);
			expect(result).toBe("const getUser = (() => db.getUser())");
		});

		it("server-first chain: client extracts client impl", () => {
			const code = "const getUser = createIsomorphicFn().server(() => db.getUser()).client(() => fromLocalStorage())";
			const result = transformEnvFns(code, false);
			expect(result).toBe("const getUser = (() => fromLocalStorage())");
		});

		it("client-first chain: SSR extracts server impl", () => {
			const code = "const getUser = createIsomorphicFn().client(() => fromLocalStorage()).server(() => db.getUser())";
			const result = transformEnvFns(code, true);
			expect(result).toBe("const getUser = (() => db.getUser())");
		});

		it("client-first chain: client extracts client impl", () => {
			const code = "const getUser = createIsomorphicFn().client(() => fromLocalStorage()).server(() => db.getUser())";
			const result = transformEnvFns(code, false);
			expect(result).toBe("const getUser = (() => fromLocalStorage())");
		});

		it("server-only: SSR extracts, client gets no-op", () => {
			const code = "const log = createIsomorphicFn().server(() => writeToFile())";
			const ssrResult = transformEnvFns(code, true);
			expect(ssrResult).toBe("const log = (() => writeToFile())");

			const clientResult = transformEnvFns(code, false);
			expect(clientResult).toBe("const log = (() => undefined)");
		});

		it("client-only: client extracts, SSR gets no-op", () => {
			const code = "const track = createIsomorphicFn().client(() => analytics.track())";
			const clientResult = transformEnvFns(code, false);
			expect(clientResult).toBe("const track = (() => analytics.track())");

			const ssrResult = transformEnvFns(code, true);
			expect(ssrResult).toBe("const track = (() => undefined)");
		});

		it("handles nested parens in both branches", () => {
			const code = "const fn = createIsomorphicFn().server((a) => compute(inner(a))).client((a) => dom(query(a)))";
			const ssrResult = transformEnvFns(code, true);
			expect(ssrResult).toBe("const fn = ((a) => compute(inner(a)))");

			const clientResult = transformEnvFns(code, false);
			expect(clientResult).toBe("const fn = ((a) => dom(query(a)))");
		});
	});

	describe("multiple transforms in same file", () => {
		it("transforms all env-fn calls", () => {
			const code = [
				`const a = createServerOnlyFn(() => "server")`,
				`const b = createClientOnlyFn(() => "client")`,
				`const c = createIsomorphicFn().server(() => "s").client(() => "c")`,
			].join("\n");

			const ssrResult = transformEnvFns(code, true);
			expect(ssrResult).toContain(`const a = (() => "server")`);
			expect(ssrResult).toContain("Client-only function called on server");
			expect(ssrResult).toContain(`const c = (() => "s")`);

			const clientResult = transformEnvFns(code, false);
			expect(clientResult).toContain("Server-only function called on client");
			expect(clientResult).toContain(`const b = (() => "client")`);
			expect(clientResult).toContain(`const c = (() => "c")`);
		});
	});

	describe("no env-fn calls", () => {
		it("returns code unchanged", () => {
			const code = `const x = createServerFn({ name: "test" }).handler(() => "ok")`;
			expect(transformEnvFns(code, true)).toBe(code);
			expect(transformEnvFns(code, false)).toBe(code);
		});
	});
});
