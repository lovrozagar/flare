import { shapeIssues, type Issue } from "./issues.ts"

// A Standard Schema issue. A path segment is a key, or `{ key }`.
export type StandardIssue = { message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> }

export type StandardResult = { value: unknown; issues?: undefined } | { issues: readonly StandardIssue[] }

// A Standard Schema, `{ parse }`, or a function, checked in that order. Each may return a promise (dx/builder.md, dx/server-fn.md). `In`
// is what the runner passes: a route's raw record, or a server function's JSON, so a validator may type it.
export type Validator<In = unknown> =
	| { "~standard": { validate: (value: unknown) => StandardResult | Promise<StandardResult> } }
	| { parse: (value: In) => unknown }
	| ((value: In) => unknown)

export type Validated = { ok: true; value: unknown } | { ok: false; errors: ReturnType<typeof shapeIssues> }

const GENERIC = "Something went wrong"

// The one runner for route input and server function input. A throw is a failure: its `issues` when it carries
// them, else its message at an empty path, generic outside dev (B76). The caller says whether this is dev.
export async function runValidator<In>(
	validator: Validator<In>,
	raw: In,
	options: { dev: boolean },
): Promise<Validated> {
	try {
		// A Standard Schema decides first: ArkType's types and Effect's standard schemas are callable too, and calling one
		// returns its errors as a value, not a throw (BUGS.md 154).
		if ("~standard" in validator) {
			const result = await validator["~standard"].validate(raw)
			return result.issues === undefined ? { ok: true, value: result.value } : failed(result.issues.map(issueOf))
		}
		if (typeof validator === "function") return { ok: true, value: await validator(raw) }
		return { ok: true, value: await validator.parse(raw) }
	} catch (error) {
		return failed(thrownIssues(error, options.dev))
	}
}

function thrownIssues(error: unknown, dev: boolean): Issue[] {
	if (typeof error === "object" && error !== null && "issues" in error && Array.isArray(error.issues)) {
		return error.issues.map(issueOf)
	}
	const message = error instanceof Error ? error.message : String(error)
	return [{ message: dev ? message : GENERIC, path: [] }]
}

// A segment `{ key }` uses `key`. Every segment is a string, so `fieldErrors` keys the first one.
function issueOf(issue: StandardIssue): Issue {
	const path = (issue.path ?? []).map((segment) => String(typeof segment === "object" ? segment.key : segment))
	return { message: issue.message, path }
}

function failed(issues: readonly Issue[]): Validated {
	return { ok: false, errors: shapeIssues(issues) }
}
