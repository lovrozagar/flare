import type { FlattenedError } from "../errors/index.ts";
import { ServerFnValidationError } from "../errors/index.ts";

/* ── Standard Schema v1 ─────────────────────────────────────────────── */

export interface StandardSchemaV1<Output = unknown> {
	"~standard": {
		validate: (value: unknown) => StandardResult<Output> | Promise<StandardResult<Output>>;
		vendor: string;
		version: 1;
	};
}

export type StandardResult<T> = { issues?: undefined; value: T } | { issues: StandardIssue[]; value?: undefined };

export interface StandardIssue {
	message: string;
	path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>;
}

/* ── Validator ───────────────────────────────────────────────────────── */

export type Validator<T> = StandardSchemaV1<T> | { parse: (raw: unknown) => T } | ((raw: unknown) => T);

export function isStandardSchema(v: unknown): v is StandardSchemaV1 {
	return typeof v === "object" && v !== null && "~standard" in v;
}

/* ── runValidator ────────────────────────────────────────────────────── */

export async function runValidator<T>(validator: Validator<T>, raw: unknown): Promise<T> {
	if (isStandardSchema(validator)) {
		const result = await validator["~standard"].validate(raw);
		if (result.issues) {
			throw new ServerFnValidationError(issuesToFlattenedError(result.issues));
		}
		return result.value as T;
	}
	if (typeof validator === "function") return validator(raw);
	return validator.parse(raw);
}

export function issuesToFlattenedError(issues: ReadonlyArray<StandardIssue>): FlattenedError {
	const fieldErrors: Record<string, string[]> = {};
	const formErrors: string[] = [];
	for (const issue of issues) {
		const first = issue.path?.[0];
		if (first !== undefined) {
			const key = String(typeof first === "object" && first !== null ? first.key : first);
			if (!fieldErrors[key]) fieldErrors[key] = [];
			fieldErrors[key].push(issue.message);
		} else {
			formErrors.push(issue.message);
		}
	}
	return { fieldErrors, formErrors };
}
