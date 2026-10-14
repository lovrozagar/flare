import { decodeGetInput } from "../../shared/protocol/index.ts";
import { runValidator, shapeIssues, type Issue } from "../../shared/validation/index.ts";
import type { ServerFnRecord } from "../../shared/server-fn/builder.ts";

// The POST body cap, unless createServer's `bodyLimit` says otherwise (B43).
export const BODY_LIMIT: number = 1024 * 1024;

const MAX_BODY_LIMIT = 32 * 1024 * 1024;

// createServer's `bodyLimit`: an integer number of bytes from 1 to 32 MiB, else the call throws (dx/server.md).
export function bodyLimitOf(value: number | undefined): number {
	if (value === undefined) return BODY_LIMIT;
	if (!Number.isInteger(value) || value < 1 || value > MAX_BODY_LIMIT) {
		throw new Error(`bodyLimit is an integer from 1 to ${MAX_BODY_LIMIT} bytes`);
	}
	return value;
}

export type InputErrors = ReturnType<typeof shapeIssues>;

export type InputResult = { status: 200; input: unknown } | { status: 400; errors: InputErrors } | { status: 413 };

// GET input is the `_i` param. POST input is the JSON body, capped. With no validator the input is undefined.
// A validator failure is 400 with `{ issues, fieldErrors }`.
// The shared runner validates, so a thrown message is generic outside dev (B76).
export async function readInput(
	request: Request,
	record: Pick<ServerFnRecord, "method" | "input">,
	options: { dev: boolean; limit?: number | undefined },
): Promise<InputResult> {
	const raw = record.method === "get" ? fromQuery(request) : await fromBody(request, options.limit ?? BODY_LIMIT);
	if (raw.status !== 200) return raw;
	if (record.input === undefined) return { status: 200, input: undefined };
	const validated = await runValidator(record.input, raw.input, { dev: options.dev });
	return validated.ok ? { status: 200, input: validated.value } : { status: 400, errors: validated.errors };
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

function invalid(issues: readonly Issue[]): InputResult {
	return { status: 400, errors: shapeIssues(issues) };
}
