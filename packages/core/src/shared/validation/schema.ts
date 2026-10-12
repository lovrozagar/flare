import { shapeIssues, type Issue } from "./issues.ts";

// A Standard Schema issue. A path segment is a key, or `{ key }`.
export type StandardIssue = { message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> };

export type StandardResult = { value: unknown; issues?: undefined } | { issues: readonly StandardIssue[] };

// A Standard Schema, `{ parse }`, or a function. Each may return a promise (dx/builder.md, dx/server-fn.md).
export type Validator =
	| { "~standard": { validate: (value: unknown) => StandardResult | Promise<StandardResult> } }
	| { parse: (value: unknown) => unknown }
	| ((value: unknown) => unknown);

export type Validated = { ok: true; value: unknown } | { ok: false; errors: ReturnType<typeof shapeIssues> };

const GENERIC = "Something went wrong";

// The one runner for route input and server function input. A throw is a failure: its `issues` when it carries
// them, else its message at an empty path, generic outside dev (B76). The caller says whether this is dev.
export async function runValidator(validator: Validator, raw: unknown, options: { dev: boolean }): Promise<Validated> {
	try {
		if (typeof validator === "function") return { ok: true, value: await validator(raw) };
		if ("parse" in validator) return { ok: true, value: await validator.parse(raw) };
		const result = await validator["~standard"].validate(raw);
		return result.issues === undefined ? { ok: true, value: result.value } : failed(result.issues.map(issueOf));
	} catch (error) {
		return failed(thrownIssues(error, options.dev));
	}
}

function thrownIssues(error: unknown, dev: boolean): Issue[] {
	if (typeof error === "object" && error !== null && "issues" in error && Array.isArray(error.issues)) {
		return error.issues.map(issueOf);
	}
	const message = error instanceof Error ? error.message : String(error);
	return [{ message: dev ? message : GENERIC, path: [] }];
}

// A segment `{ key }` uses `key`. Every segment is a string, so `fieldErrors` keys the first one.
function issueOf(issue: StandardIssue): Issue {
	const path = (issue.path ?? []).map((segment) => String(typeof segment === "object" ? segment.key : segment));
	return { message: issue.message, path };
}

function failed(issues: readonly Issue[]): Validated {
	return { ok: false, errors: shapeIssues(issues) };
}
