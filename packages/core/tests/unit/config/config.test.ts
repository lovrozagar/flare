import { describe, expect, it } from "vitest";
import { createFlareBuild, isFlareBuildConfig, validateFlareBuildConfig } from "../../../src/config/index.ts";

describe("createFlareBuild", () => {
	it("returns config with marker symbol", () => {
		const config = createFlareBuild({});
		expect(isFlareBuildConfig(config)).toBe(true);
	});

	it("preserves all provided fields", () => {
		const config = createFlareBuild({
			clientEntryFilePath: "src/entry-client.ts",
			css: { scoped: true },
			globalBoundaries: {
				error: "./src/boundaries/error.tsx",
				notFound: "./src/boundaries/not-found.tsx",
			},
			serverEntryFilePath: "src/entry-server.ts",
			serverFn: { include: /api/ },
			viewTransitions: true,
		});
		expect(config.clientEntryFilePath).toBe("src/entry-client.ts");
		expect(config.serverEntryFilePath).toBe("src/entry-server.ts");
		expect(config.viewTransitions).toBe(true);
		expect(config.css).toEqual({ scoped: true });
		expect(config.globalBoundaries).toEqual({
			error: "./src/boundaries/error.tsx",
			notFound: "./src/boundaries/not-found.tsx",
		});
	});

	it("no mutation of input object", () => {
		const input = { clientEntryFilePath: "src/client.ts" };
		const config = createFlareBuild(input);
		expect(config).not.toBe(input);
		expect(isFlareBuildConfig(input)).toBe(false);
	});

	it("empty config → valid marked config", () => {
		const config = createFlareBuild({});
		expect(isFlareBuildConfig(config)).toBe(true);
	});

	it("generated paths preserved", () => {
		const config = createFlareBuild({
			generated: {
				routesFilePath: "src/_gen/routes.gen.ts",
				typesFilePath: "src/_gen/types.gen.d.ts",
			},
		});
		expect(config.generated).toEqual({
			routesFilePath: "src/_gen/routes.gen.ts",
			typesFilePath: "src/_gen/types.gen.d.ts",
		});
	});

	it("ignorePrefix preserved", () => {
		const config = createFlareBuild({ ignorePrefix: "__" });
		expect(config.ignorePrefix).toBe("__");
	});
});

describe("validateFlareBuildConfig", () => {
	it("valid config returns no errors", () => {
		const config = createFlareBuild({ ignorePrefix: "_", serverFn: { include: /api/ } });
		expect(validateFlareBuildConfig(config)).toEqual([]);
	});

	it("config missing marker returns error", () => {
		const errors = validateFlareBuildConfig({ ignorePrefix: "_" });
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain("marker");
	});

	it("ignorePrefix with wrong type returns error", () => {
		const config = createFlareBuild({ ignorePrefix: 42 as unknown as string });
		const errors = validateFlareBuildConfig(config);
		expect(errors.some((e: string) => e.includes("ignorePrefix"))).toBe(true);
	});

	it("serverFn.include with wrong type returns error", () => {
		const config = createFlareBuild({
			serverFn: { include: "api" as unknown as RegExp },
		});
		const errors = validateFlareBuildConfig(config);
		expect(errors.some((e: string) => e.includes("include"))).toBe(true);
	});

	it("serverFn.exclude with wrong type returns error", () => {
		const config = createFlareBuild({
			serverFn: { exclude: 123 as unknown as RegExp },
		});
		const errors = validateFlareBuildConfig(config);
		expect(errors.some((e: string) => e.includes("exclude"))).toBe(true);
	});

	it("serverFn: false is valid", () => {
		const config = createFlareBuild({ serverFn: false });
		expect(validateFlareBuildConfig(config)).toEqual([]);
	});

	it("css with wrong type returns error", () => {
		const config = createFlareBuild({ css: "yes" as unknown as false });
		const errors = validateFlareBuildConfig(config);
		expect(errors.some((e: string) => e.includes("css"))).toBe(true);
	});
});

describe("isFlareBuildConfig", () => {
	it("marked config → true", () => {
		const config = createFlareBuild({});
		expect(isFlareBuildConfig(config)).toBe(true);
	});

	it("plain object → false", () => {
		expect(isFlareBuildConfig({ clientEntryFilePath: "src/client.ts" })).toBe(false);
	});

	it("null → false", () => {
		expect(isFlareBuildConfig(null)).toBe(false);
	});

	it("undefined → false", () => {
		expect(isFlareBuildConfig(undefined)).toBe(false);
	});

	it("string → false", () => {
		expect(isFlareBuildConfig("config")).toBe(false);
	});

	it("number → false", () => {
		expect(isFlareBuildConfig(42)).toBe(false);
	});

	it("object with wrong marker value → false", () => {
		const fake = { [Symbol.for("flare/build-config")]: "yes" };
		expect(isFlareBuildConfig(fake)).toBe(false);
	});

	it("object with wrong symbol key → false", () => {
		const fake = { [Symbol.for("flare/wrong")]: true };
		expect(isFlareBuildConfig(fake)).toBe(false);
	});
});
