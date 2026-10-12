import { expect, it } from "vitest";
import { runValidator, type Validator } from "./schema.ts";

const failure: Validator = {
	"~standard": {
		validate: () => ({ issues: [{ message: "bad", path: ["email"] }] }),
	},
};

function identity(raw: unknown): unknown {
	return raw;
}

function text(): never {
	throw "plain";
}

async function later(value: unknown): Promise<unknown> {
	return { later: value };
}

function secret(): never {
	throw new Error("secret-token");
}

it("standard schema failure", async () => {
	expect(await runValidator(failure, {}, { dev: false })).toEqual({
		ok: false,
		errors: { issues: [{ message: "bad", path: ["email"] }], fieldErrors: { email: ["bad"] } },
	});
	const passing: Validator = { "~standard": { validate: (value) => ({ value: { wrapped: value } }) } };
	expect(await runValidator(passing, 1, { dev: false })).toEqual({ ok: true, value: { wrapped: 1 } });
});

it("function validator", async () => {
	expect(await runValidator(identity, { n: 1 }, { dev: false })).toEqual({ ok: true, value: { n: 1 } });
});

it("throwing validator", async () => {
	const production = await runValidator(secret, {}, { dev: false });
	expect(production).toEqual({
		ok: false,
		errors: { issues: [{ message: "Something went wrong", path: [] }], fieldErrors: {} },
	});
	expect(JSON.stringify(production)).not.toContain("secret-token");
	expect(await runValidator(secret, {}, { dev: true })).toEqual({
		ok: false,
		errors: { issues: [{ message: "secret-token", path: [] }], fieldErrors: {} },
	});
	expect(await runValidator(text, {}, { dev: true })).toEqual({
		ok: false,
		errors: { issues: [{ message: "plain", path: [] }], fieldErrors: {} },
	});
	const carried: Validator = {
		parse: () => {
			throw Object.assign(new Error("invalid"), { issues: [{ message: "missing", path: [{ key: "name" }, 0] }] });
		},
	};
	expect(await runValidator(carried, {}, { dev: false })).toEqual({
		ok: false,
		errors: { issues: [{ message: "missing", path: ["name", "0"] }], fieldErrors: { name: ["missing"] } },
	});
});

it("parse validator", async () => {
	const parsed: Validator = { parse: (value) => ({ parsed: value }) };
	expect(await runValidator(parsed, 2, { dev: false })).toEqual({ ok: true, value: { parsed: 2 } });
});

it("async validator", async () => {
	const standard: Validator = { "~standard": { validate: async () => ({ issues: [{ message: "no" }] }) } };
	const parse: Validator = { parse: async (value) => ({ parsed: value }) };
	expect(await runValidator(later, 3, { dev: false })).toEqual({ ok: true, value: { later: 3 } });
	expect(await runValidator(parse, 4, { dev: false })).toEqual({ ok: true, value: { parsed: 4 } });
	expect(await runValidator(standard, 5, { dev: false })).toEqual({
		ok: false,
		errors: { issues: [{ message: "no", path: [] }], fieldErrors: {} },
	});
});
