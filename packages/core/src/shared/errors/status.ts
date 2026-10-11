import { NotFoundError, UnauthenticatedError, UnauthorizedError } from "./http.ts";
import { RedirectError } from "./redirect.ts";

export function statusOf(error: unknown): number {
	if (error instanceof NotFoundError) return 404;
	if (error instanceof UnauthenticatedError) return 401;
	if (error instanceof UnauthorizedError) return 403;
	if (error instanceof RedirectError) return error.status;
	return 500;
}
