import { expect, it } from "vitest";
import type { StandardIssue, Validator } from "./builder.ts";
import { readInput } from "./input.ts";

const MIB = 1024 * 1024;

function post(body: BodyInit | null, headers: Record<string, string> = {}): Request {
	return new Request("https://app.example.com/_flare/fn/abc", { method: "POST", body, headers });
}

function standard(issues: readonly StandardIssue[]): Validator {
	return { "~standard": { validate: () => ({ issues }) } };
}

async function asFunction(value: unknown): Promise<unknown> {
	return { called: value };
}

function plain(): never {
	throw new Error("nope");
}

function odd(): never {
	throw "text";
}

it("body cap", async () => {
	expect(await readInput(post("x".repeat(MIB + 1)), { method: "post" })).toEqual({ status: 413 });
	expect(await readInput(post("{}", { "content-length": String(MIB + 1) }), { method: "post" })).toEqual({
		status: 413,
	});
	const streamed = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new Uint8Array(MIB));
			controller.enqueue(new Uint8Array(2));
			controller.close();
		},
	});
	const init: RequestInit = Object.assign({ method: "POST", body: streamed }, { duplex: "half" });
	const request = new Request("https://app.example.com/_flare/fn/abc", init);
	expect(await readInput(request, { method: "post" })).toEqual({ status: 413 });
	expect(await readInput(post('{"a":1}'), { method: "post", input: (value) => value }, 4)).toEqual({ status: 413 });
});

it("validator failure", async () => {
	const failing = standard([{ message: "required", path: ["email"] }]);
	expect(await readInput(post("{}"), { method: "post", input: failing })).toEqual({
		status: 400,
		errors: { issues: [{ message: "required", path: ["email"] }], fieldErrors: { email: ["required"] } },
	});
	expect(await readInput(post("{not json"), { method: "post", input: failing })).toEqual({
		status: 400,
		errors: { issues: [{ message: "The body is not JSON", path: [] }], fieldErrors: {} },
	});
	const get = new Request("https://app.example.com/_flare/fn/abc?_i=%7B&x=1");
	expect(await readInput(get, { method: "get", input: failing })).toEqual({
		status: 400,
		errors: { issues: [{ message: "The _i input is not valid", path: [] }], fieldErrors: {} },
	});
});

it("promise", async () => {
	const body = post('{"n":2}');
	const asStandard: Validator = { "~standard": { validate: async (value: unknown) => ({ value }) } };
	const asParse: Validator = { parse: async (value: unknown) => ({ parsed: value }) };
	expect(await readInput(body.clone(), { method: "post", input: asStandard })).toEqual({
		status: 200,
		input: { n: 2 },
	});
	expect(await readInput(body.clone(), { method: "post", input: asParse })).toEqual({
		status: 200,
		input: { parsed: { n: 2 } },
	});
	expect(await readInput(body.clone(), { method: "post", input: asFunction })).toEqual({
		status: 200,
		input: { called: { n: 2 } },
	});
	const get = new Request(`https://app.example.com/_flare/fn/abc?_i=${encodeURIComponent('{"q":"x"}')}`);
	expect(await readInput(get, { method: "get", input: asFunction })).toEqual({
		status: 200,
		input: { called: { q: "x" } },
	});
	expect(await readInput(post(null), { method: "post", input: asFunction })).toEqual({
		status: 200,
		input: { called: undefined },
	});
	expect(await readInput(body.clone(), { method: "post" })).toEqual({ status: 200, input: undefined });
});

it("field array", async () => {
	const failing = standard([
		{ message: "too short", path: ["email"] },
		{ message: "no at sign", path: [{ key: "email" }, 0] },
		{ message: "bad zip", path: [{ key: "address" }, "zip"] },
	]);
	const result = await readInput(post("{}"), { method: "post", input: failing });
	expect(result).toEqual({
		status: 400,
		errors: {
			issues: [
				{ message: "too short", path: ["email"] },
				{ message: "no at sign", path: ["email", "0"] },
				{ message: "bad zip", path: ["address", "zip"] },
			],
			fieldErrors: { email: ["too short", "no at sign"], address: ["bad zip"] },
		},
	});
	const thrown: Validator = {
		parse: () => {
			throw Object.assign(new Error("invalid"), { issues: [{ message: "missing", path: ["name"] }] });
		},
	};
	expect(await readInput(post("{}"), { method: "post", input: thrown })).toEqual({
		status: 400,
		errors: { issues: [{ message: "missing", path: ["name"] }], fieldErrors: { name: ["missing"] } },
	});
});

it("empty path", async () => {
	const failing = standard([{ message: "the whole input is wrong" }]);
	expect(await readInput(post("{}"), { method: "post", input: failing })).toEqual({
		status: 400,
		errors: { issues: [{ message: "the whole input is wrong", path: [] }], fieldErrors: {} },
	});
	expect(await readInput(post("{}"), { method: "post", input: plain })).toEqual({
		status: 400,
		errors: { issues: [{ message: "nope", path: [] }], fieldErrors: {} },
	});
	expect(await readInput(post("{}"), { method: "post", input: odd })).toEqual({
		status: 400,
		errors: { issues: [{ message: "text", path: [] }], fieldErrors: {} },
	});
});
