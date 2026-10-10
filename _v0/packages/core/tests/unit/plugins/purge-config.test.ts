import { describe, expect, it } from "vitest";
import { resolvePurgeConfig } from "../../../src/plugins/purge.ts";

describe("resolvePurgeConfig", () => {
	describe("purge: undefined (default)", () => {
		it("returns all disabled", () => {
			const result = resolvePurgeConfig(undefined);
			expect(result).toEqual({
				console: false,
				debugger: false,
				testIds: false,
			});
		});
	});

	describe("purge: false", () => {
		it("returns all disabled", () => {
			const result = resolvePurgeConfig(false);
			expect(result).toEqual({
				console: false,
				debugger: false,
				testIds: false,
			});
		});
	});

	describe("purge: true", () => {
		it("returns production defaults", () => {
			const result = resolvePurgeConfig(true);
			expect(result).toEqual({
				console: ["log", "debug"],
				debugger: true,
				testIds: ["data-testid"],
			});
		});
	});

	describe("granular config", () => {
		it("console: true → ['log', 'debug']", () => {
			const result = resolvePurgeConfig({ console: true });
			expect(result.console).toEqual(["log", "debug"]);
			expect(result.debugger).toBe(false);
			expect(result.testIds).toBe(false);
		});

		it("console: ['warn', 'info'] → preserves exact array", () => {
			const result = resolvePurgeConfig({ console: ["warn", "info"] });
			expect(result.console).toEqual(["warn", "info"]);
		});

		it("console: false → disabled", () => {
			const result = resolvePurgeConfig({ console: false });
			expect(result.console).toBe(false);
		});

		it("debugger: true", () => {
			const result = resolvePurgeConfig({ debugger: true });
			expect(result.debugger).toBe(true);
			expect(result.console).toBe(false);
			expect(result.testIds).toBe(false);
		});

		it("testIds: true → ['data-testid']", () => {
			const result = resolvePurgeConfig({ testIds: true });
			expect(result.testIds).toEqual(["data-testid"]);
		});

		it("testIds: ['data-testid', 'data-cy'] → preserves exact array", () => {
			const result = resolvePurgeConfig({ testIds: ["data-testid", "data-cy"] });
			expect(result.testIds).toEqual(["data-testid", "data-cy"]);
		});

		it("testIds: false → disabled", () => {
			const result = resolvePurgeConfig({ testIds: false });
			expect(result.testIds).toBe(false);
		});

		it("all enabled", () => {
			const result = resolvePurgeConfig({
				console: ["log", "warn", "debug", "info"],
				debugger: true,
				testIds: ["data-testid", "data-cy"],
			});
			expect(result.console).toEqual(["log", "warn", "debug", "info"]);
			expect(result.debugger).toBe(true);
			expect(result.testIds).toEqual(["data-testid", "data-cy"]);
		});

		it("partial config: only debugger", () => {
			const result = resolvePurgeConfig({ debugger: true });
			expect(result).toEqual({
				console: false,
				debugger: true,
				testIds: false,
			});
		});

		it("empty object → all disabled", () => {
			const result = resolvePurgeConfig({});
			expect(result).toEqual({
				console: false,
				debugger: false,
				testIds: false,
			});
		});
	});
});
