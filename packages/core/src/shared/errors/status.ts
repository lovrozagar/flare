import { NotFoundError, UnauthenticatedError, UnauthorizedError } from "./http.ts";
import { RedirectError } from "./redirect.ts";

export function statusOf(error: unknown): number {
	if (error instanceof NotFoundError) return 404;
	if (error instanceof UnauthenticatedError) return 401;
	if (error instanceof UnauthorizedError) return 403;
	if (error instanceof RedirectError) return error.status;
	return 500;
}

// Root-down statuses of the failed matches (B82). An auth failure anywhere wins, 401 before 403. Otherwise
// the root-most failure stands, so a descendant notFound() never downgrades an ancestor's 500.
export function rankStatus(statuses: readonly number[]): number {
	for (const named of [401, 403]) if (statuses.includes(named)) return named;
	return statuses[0];
}
