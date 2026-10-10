import { describe, expect, it } from "vitest";
import { ServerFnValidationError } from "../../../src/errors/index.ts";
import type { StandardSchemaV1 } from "../../../src/validation/index.ts";
import { isStandardSchema, issuesToFlattenedError, runValidator } from "../../../src/validation/index.ts";

/* ── helpers ───────────────────────────────────────────────────────── */

function mockStandardSchema<T>(
	validate: (value: unknown) =>
		| { issues?: undefined; value: T }
		| {
				issues: Array<{ message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> }>;
				value?: undefined;
		  },
): StandardSchemaV1<T> {
	return {
		"~standard": {
			validate,
			vendor: "test",
			version: 1,
		},
	};
}

function mockAsyncStandardSchema<T>(
	validate: (value: unknown) => Promise<
		| { issues?: undefined; value: T }
		| {
				issues: Array<{ message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> }>;
				value?: undefined;
		  }
	>,
): StandardSchemaV1<T> {
	return {
		"~standard": {
			validate,
			vendor: "test",
			version: 1,
		},
	};
}

/* ── V1: Standard Schema valid ─────────────────────────────────────── */

describe("runValidator", () => {
	it("V1: Standard Schema returns validated value", async () => {
		const schema = mockStandardSchema<{ email: string }>((raw) => ({
			value: raw as { email: string },
		}));
		const result = await runValidator(schema, { email: "a@b.com" });
		expect(result).toEqual({ email: "a@b.com" });
	});

	/* V2: Standard Schema field errors */
	it("V2: Standard Schema field errors throw SFVE with fieldErrors", async () => {
		const schema = mockStandardSchema<{ email: string }>(() => ({
			issues: [{ message: "Invalid email", path: ["email"] }],
		}));
		try {
			await runValidator(schema, { email: "bad" });
			expect.unreachable("should throw");
		} catch (e) {
			expect(e).toBeInstanceOf(ServerFnValidationError);
			const sfve = e as ServerFnValidationError;
			expect(sfve.errors.fieldErrors).toEqual({ email: ["Invalid email"] });
			expect(sfve.errors.formErrors).toEqual([]);
		}
	});

	/* V3: Standard Schema form-level error */
	it("V3: Standard Schema form-level error goes to formErrors", async () => {
		const schema = mockStandardSchema<unknown>(() => ({
			issues: [{ message: "Form is invalid" }],
		}));
		try {
			await runValidator(schema, {});
			expect.unreachable("should throw");
		} catch (e) {
			const sfve = e as ServerFnValidationError;
			expect(sfve.errors.fieldErrors).toEqual({});
			expect(sfve.errors.formErrors).toEqual(["Form is invalid"]);
		}
	});

	/* V4: Standard Schema mixed errors */
	it("V4: Standard Schema mixed field + form errors", async () => {
		const schema = mockStandardSchema<unknown>(() => ({
			issues: [
				{ message: "Required", path: ["name"] },
				{ message: "Something wrong" },
				{ message: "Too short", path: ["name"] },
			],
		}));
		try {
			await runValidator(schema, {});
			expect.unreachable("should throw");
		} catch (e) {
			const sfve = e as ServerFnValidationError;
			expect(sfve.errors.fieldErrors).toEqual({ name: ["Required", "Too short"] });
			expect(sfve.errors.formErrors).toEqual(["Something wrong"]);
		}
	});

	/* V5: Standard Schema async validate */
	it("V5: Standard Schema async validate resolves correctly", async () => {
		const schema = mockAsyncStandardSchema<{ ok: boolean }>(async (raw) => {
			await new Promise((r) => setTimeout(r, 1));
			return { value: raw as { ok: boolean } };
		});
		const result = await runValidator(schema, { ok: true });
		expect(result).toEqual({ ok: true });
	});

	/* V6: Standard Schema nested path uses first segment */
	it("V6: Standard Schema nested path uses first segment as key", async () => {
		const schema = mockStandardSchema<unknown>(() => ({
			issues: [{ message: "Bad zip", path: [{ key: "address" }, { key: "zip" }] }],
		}));
		try {
			await runValidator(schema, {});
			expect.unreachable("should throw");
		} catch (e) {
			const sfve = e as ServerFnValidationError;
			expect(sfve.errors.fieldErrors).toEqual({ address: ["Bad zip"] });
		}
	});

	/* V7: { parse } validator valid */
	it("V7: parse validator returns parsed value", async () => {
		const validator = { parse: (raw: unknown) => (raw as { x: number }).x * 2 };
		const result = await runValidator(validator, { x: 5 });
		expect(result).toBe(10);
	});

	/* V8: { parse } validator throws */
	it("V8: parse validator throws propagates error", async () => {
		const validator = {
			parse: () => {
				throw new Error("parse failed");
			},
		};
		await expect(runValidator(validator, {})).rejects.toThrow("parse failed");
	});

	/* V9: { parse } throws ServerFnValidationError */
	it("V9: parse validator throwing SFVE propagates unchanged", async () => {
		const errors = { fieldErrors: { email: ["taken"] }, formErrors: [] };
		const validator = {
			parse: () => {
				throw new ServerFnValidationError(errors);
			},
		};
		try {
			await runValidator(validator, {});
			expect.unreachable("should throw");
		} catch (e) {
			expect(e).toBeInstanceOf(ServerFnValidationError);
			expect((e as ServerFnValidationError).errors).toEqual(errors);
		}
	});

	/* V10: Function validator valid */
	it("V10: function validator returns value", async () => {
		const validator = (raw: unknown) => String(raw);
		const result = await runValidator(validator, 42);
		expect(result).toBe("42");
	});

	/* V11: Function validator throws */
	it("V11: function validator throws propagates error", async () => {
		const validator = () => {
			throw new Error("fn failed");
		};
		await expect(runValidator(validator, {})).rejects.toThrow("fn failed");
	});
});

/* ── V12: isStandardSchema detection ───────────────────────────────── */

describe("isStandardSchema", () => {
	it("returns true for Standard Schema objects", () => {
		const schema = mockStandardSchema<unknown>(() => ({ value: null }));
		expect(isStandardSchema(schema)).toBe(true);
	});

	it("returns false for { parse } validators", () => {
		expect(isStandardSchema({ parse: () => {} })).toBe(false);
	});

	it("returns false for functions", () => {
		expect(isStandardSchema(() => {})).toBe(false);
	});

	it("returns false for null", () => {
		expect(isStandardSchema(null)).toBe(false);
	});

	it("returns false for strings", () => {
		expect(isStandardSchema("hello")).toBe(false);
	});

	it("returns false for plain objects", () => {
		expect(isStandardSchema({ foo: "bar" })).toBe(false);
	});
});

/* ── issuesToFlattenedError ─────────────────────────────────────────── */

describe("issuesToFlattenedError", () => {
	it("empty issues returns empty errors", () => {
		const result = issuesToFlattenedError([]);
		expect(result).toEqual({ fieldErrors: {}, formErrors: [] });
	});

	it("PropertyKey path uses string key", () => {
		const result = issuesToFlattenedError([{ message: "bad", path: ["field1"] }]);
		expect(result.fieldErrors).toEqual({ field1: ["bad"] });
	});

	it("object path uses .key property", () => {
		const result = issuesToFlattenedError([{ message: "bad", path: [{ key: "field2" }] }]);
		expect(result.fieldErrors).toEqual({ field2: ["bad"] });
	});

	it("numeric path key is stringified", () => {
		const result = issuesToFlattenedError([{ message: "bad", path: [0] }]);
		expect(result.fieldErrors).toEqual({ "0": ["bad"] });
	});
});
