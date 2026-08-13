/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest"

/* Mock vite-plugin-solid to avoid esbuild binary */
vi.mock("vite-plugin-solid", () => ({
	default: (opts: Record<string, unknown>) => ({ config: () => ({ solid: opts }), name: "solid" }),
}))

/* flare() plugin scans cwd for src/client.tsx and src/server.ts — create stubs */
import { existsSync, mkdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterAll } from "vitest"

const _stubs: string[] = []
const _stubDirs: string[] = []
for (const name of ["src/client.tsx", "src/server.ts"]) {
	const p = join(process.cwd(), name)
	if (!existsSync(p)) {
		writeFileSync(p, "/* test stub */")
		_stubs.push(p)
	}
}
const distDir = join(process.cwd(), "dist")
if (!existsSync(distDir)) {
	mkdirSync(distDir, { recursive: true })
	_stubDirs.push(distDir)
}

afterAll(() => {
	for (const p of _stubs)
		try {
			unlinkSync(p)
		} catch {}
	for (const d of _stubDirs)
		try {
			rmdirSync(d)
		} catch {}
})

vi.mock("../../../src/generators", () => ({
	buildRouteTree: vi.fn(() => ({ s: {} })),
	deriveVirtualPath: vi.fn(() => "_root_/test"),
	detectRouteType: vi.fn(() => "page"),
	extractCacheFromChain: vi.fn(() => ({})),
	extractRouteDefinitions: vi.fn(() => []),
	generateLayoutsRecord: vi.fn(),
	generateRouteInserts: vi.fn(),
	generateRoutesFile: vi.fn(),
	generateVirtualModuleTypes: vi.fn(() => ""),
	runGenerate: vi.fn(() => ({ layouts: 0, routes: 0 })),
	scanSourceFilesFsCodegen: vi.fn(() => []),
	writeRouteDeclaration: vi.fn(),
}))

import type { Plugin } from "vite"
import { flare } from "../../../src/plugins/index.ts"

describe("Bug 44: server-fn-secret SSR gate", () => {
	it("should NOT resolve virtual:flare-server-fn-secret for client environment", () => {
		const plugins = flare({}) as Plugin[]
		const sfnPlugin = plugins.find((p) => p.name === "flare:server-fn")
		expect(sfnPlugin).toBeTruthy()

		/* Simulate client environment */
		const resolveId = sfnPlugin!.resolveId as (
			this: { environment?: { name?: string } },
			id: string,
		) => string | null
		const clientResult = resolveId.call(
			{ environment: { name: "client" } },
			"virtual:flare-server-fn-secret",
		)
		expect(clientResult).toBeNull()
	})

	it("should resolve virtual:flare-server-fn-secret for SSR environment", () => {
		const plugins = flare({}) as Plugin[]
		const sfnPlugin = plugins.find((p) => p.name === "flare:server-fn")
		expect(sfnPlugin).toBeTruthy()

		const resolveId = sfnPlugin!.resolveId as (
			this: { environment?: { name?: string } },
			id: string,
		) => string | null
		const ssrResult = resolveId.call(
			{ environment: { name: "ssr" } },
			"virtual:flare-server-fn-secret",
		)
		expect(ssrResult).toBe("\0virtual:flare-server-fn-secret")
	})

	it("should NOT resolve for undefined environment (defaults to client)", () => {
		const plugins = flare({}) as Plugin[]
		const sfnPlugin = plugins.find((p) => p.name === "flare:server-fn")
		expect(sfnPlugin).toBeTruthy()

		const resolveId = sfnPlugin!.resolveId as (
			this: { environment?: { name?: string } },
			id: string,
		) => string | null
		const noEnvResult = resolveId.call({}, "virtual:flare-server-fn-secret")
		expect(noEnvResult).toBeNull()
	})
})
