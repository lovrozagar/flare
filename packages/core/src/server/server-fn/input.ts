import { decodeGetInput } from "../../shared/protocol/index.ts";
import { shapeIssues, type Issue } from "../../shared/validation/index.ts";
import type { ServerFnRecord, StandardIssue, Validator } from "./builder.ts";

// The POST body cap, unless createServer's `bodyLimit` says otherwise (B43).
export const BODY_LIMIT: number = 1024 * 1024;

export type InputErrors = ReturnType<typeof shapeIssues>;

export type InputResult = { status: 200; input: unknown } | { status: 400; errors: InputErrors } | { status: 413 };

// GET input is the `_i` param. POST input is the JSON body, capped. With no validator the input is undefined.
// A validator failure is 400 with `{ issues, fieldErrors }`.
export async function readInput(
	request: Request,
	record: Pick<ServerFnRecord, "method" | "input">,
	limit: number = BODY_LIMIT,
): Promise<InputResult> {
	const raw = record.method === "get" ? fromQuery(request) : await fromBody(request, limit);
	if (raw.status !== 200) return raw;
	if (record.input === undefined) return { status: 200, input: undefined };
	return validate(record.input, raw.input);
}

function fromQuery(request: Request): InputResult {
	const decoded = decodeGetInput(new URL(request.url).search);
	return decoded.status === 200 ? decoded : invalid([{ message: "The _i input is not valid", path: [] }]);
}

// A declared length over the cap answers before reading. Otherwise the stream is counted and cut at the cap.
async function fromBody(request: Request, limit: number): Promise<InputResult> {
	if (Number(request.headers.get("content-length") ?? 0) > limit) return { status: 413 };
	const text = await capped(request.body, limit);
	if (text === undefined) return { status: 413 };
	if (text === "") return { status: 200, input: undefined };
	try {
		return { status: 200, input: JSON.parse(text) };
	} catch {
		return invalid([{ message: "The body is not JSON", path: [] }]);
	}
}

async function capped(body: ReadableStream<Uint8Array> | null, limit: number): Promise<string | undefined> {
	if (body === null) return "";
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let size = 0;
	let text = "";
	for (let step = await reader.read(); !step.done; step = await reader.read()) {
		size += step.value.byteLength;
		if (size > limit) {
			await reader.cancel();
			return undefined;
		}
		text += decoder.decode(step.value, { stream: true });
	}
	return text + decoder.decode();
}

// A promise from any of the three shapes is awaited. A throw is a failure: its `issues` when it carries them,
// else its message at an empty path.
async function validate(validator: Validator, raw: unknown): Promise<InputResult> {
	try {
		if (typeof validator === "function") return { status: 200, input: await validator(raw) };
		if ("parse" in validator) return { status: 200, input: await validator.parse(raw) };
		const result = await validator["~standard"].validate(raw);
		return result.issues === undefined ? { status: 200, input: result.value } : invalid(result.issues.map(issueOf));
	} catch (error) {
		return invalid(thrownIssues(error));
	}
}

function thrownIssues(error: unknown): Issue[] {
	if (typeof error === "object" && error !== null && "issues" in error && Array.isArray(error.issues)) {
		return error.issues.map(issueOf);
	}
	return [{ message: error instanceof Error ? error.message : String(error), path: [] }];
}

// A segment `{ key }` uses `key`. An issue with no path is only in `issues` (dx/server-fn.md).
function issueOf(issue: StandardIssue): Issue {
	const path = (issue.path ?? []).map((segment) => String(typeof segment === "object" ? segment.key : segment));
	return { message: issue.message, path };
}

function invalid(issues: readonly Issue[]): InputResult {
	return { status: 400, errors: shapeIssues(issues) };
}
