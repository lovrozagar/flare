import { shapeIssues, type Issue } from "./issues.ts";

type StandardSchema = {
	"~standard": {
		validate: (value: unknown) => { issues: readonly Issue[] };
	};
};

type Validator = ((raw: unknown) => unknown) | StandardSchema;

const GENERIC = "Something went wrong";

export function runValidator(validator: Validator, raw: unknown): unknown {
	try {
		if (typeof validator === "function") return validator(raw);
		return shapeIssues(validator["~standard"].validate(raw).issues);
	} catch (error) {
		const message = process.env.NODE_ENV === "production" ? GENERIC : (error as Error).message;
		return { status: 400, message };
	}
}
