import { type FlattenedError, ServerFnValidationError } from "../errors/index.ts";

/** Map a failed server-fn HTTP body to the same error the server module throws. */
export function throwServerFnHttpError(body: unknown, status: number, name: string): never {
	if (typeof body === "object" && body !== null && "errors" in body) {
		throw new ServerFnValidationError((body as { errors: FlattenedError }).errors);
	}
	const errMsg =
		typeof body === "object" && body !== null && "message" in body
			? String((body as Record<string, unknown>).message)
			: `Request failed (${status})`;
	throw new Error(`Server function "${name}" failed: ${errMsg}`);
}
