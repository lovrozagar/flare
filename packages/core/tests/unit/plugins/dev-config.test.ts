import { describe, expect, it, vi } from "vitest";

vi.mock("@solidjs/vite-plugin", () => ({
	default: () => ({ name: "solid" }),
}));

import { resolveCodegenConfig, resolveDevConfig } from "../../../src/plugins/index.ts";

describe("resolveDevConfig", () => {
	it("resolves undefined → all true (defaults)", () => {
		const result = resolveDevConfig(undefined);
		expect(result).toEqual({
			cdnCache: true,
			dashboard: true,
			serverTiming: true,
			staticCache: true,
		});
	});

	it("resolves true → all true", () => {
		const result = resolveDevConfig(true);
		expect(result).toEqual({
			cdnCache: true,
			dashboard: true,
			serverTiming: true,
			staticCache: true,
		});
	});

	it("resolves false → all false", () => {
		const result = resolveDevConfig(false);
		expect(result).toEqual({
			cdnCache: false,
			dashboard: false,
			serverTiming: false,
			staticCache: false,
		});
	});

	it("partial: { staticCache: false } → others default to true", () => {
		const result = resolveDevConfig({ staticCache: false });
		expect(result).toEqual({
			cdnCache: true,
			dashboard: true,
			serverTiming: true,
			staticCache: false,
		});
	});

	it("partial: { cdnCache: false } → others default to true", () => {
		const result = resolveDevConfig({ cdnCache: false });
		expect(result).toEqual({
			cdnCache: false,
			dashboard: true,
			serverTiming: true,
			staticCache: true,
		});
	});

	it("partial: { serverTiming: false } → others default to true", () => {
		const result = resolveDevConfig({ serverTiming: false });
		expect(result).toEqual({
			cdnCache: true,
			dashboard: true,
			serverTiming: false,
			staticCache: true,
		});
	});

	it("explicit empty object → all defaults", () => {
		const result = resolveDevConfig({});
		expect(result).toEqual({
			cdnCache: true,
			dashboard: true,
			serverTiming: true,
			staticCache: true,
		});
	});

	it("all explicit false → all false", () => {
		const result = resolveDevConfig({
			cdnCache: false,
			dashboard: false,
			serverTiming: false,
			staticCache: false,
		});
		expect(result).toEqual({
			cdnCache: false,
			dashboard: false,
			serverTiming: false,
			staticCache: false,
		});
	});
});

describe("resolveCodegenConfig", () => {
	it("resolves undefined → defaults", () => {
		const result = resolveCodegenConfig(undefined);
		expect(result).toEqual({
			fsVirtualPaths: true,
			routesFilePath: "src/_gen/routes.gen.ts",
			typesFilePath: "src/_gen/types.gen.d.ts",
		});
	});

	it("resolves empty object → defaults", () => {
		const result = resolveCodegenConfig({});
		expect(result).toEqual({
			fsVirtualPaths: true,
			routesFilePath: "src/_gen/routes.gen.ts",
			typesFilePath: "src/_gen/types.gen.d.ts",
		});
	});

	it("fsVirtualPaths: false → overrides default", () => {
		const result = resolveCodegenConfig({ fsVirtualPaths: false });
		expect(result).toEqual({
			fsVirtualPaths: false,
			routesFilePath: "src/_gen/routes.gen.ts",
			typesFilePath: "src/_gen/types.gen.d.ts",
		});
	});

	it("custom routesFilePath → overrides default", () => {
		const result = resolveCodegenConfig({ routesFilePath: "src/generated/routes.gen.ts" });
		expect(result).toEqual({
			fsVirtualPaths: true,
			routesFilePath: "src/generated/routes.gen.ts",
			typesFilePath: "src/_gen/types.gen.d.ts",
		});
	});

	it("custom typesFilePath → overrides default", () => {
		const result = resolveCodegenConfig({ typesFilePath: "src/generated/types.gen.d.ts" });
		expect(result).toEqual({
			fsVirtualPaths: true,
			routesFilePath: "src/_gen/routes.gen.ts",
			typesFilePath: "src/generated/types.gen.d.ts",
		});
	});

	it("all custom → uses provided values", () => {
		const result = resolveCodegenConfig({
			fsVirtualPaths: false,
			routesFilePath: "gen/routes.ts",
			typesFilePath: "gen/types.d.ts",
		});
		expect(result).toEqual({
			fsVirtualPaths: false,
			routesFilePath: "gen/routes.ts",
			typesFilePath: "gen/types.d.ts",
		});
	});
});
