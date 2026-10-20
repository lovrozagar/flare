import { RedirectError } from "../../shared/errors/redirect.ts"
import type { Issue } from "../../shared/validation/index.ts"
import { redirectLocation, type Routing } from "../redirect/index.ts"
import { projectError, type ErrorSink } from "../render/projector.ts"

// The server function wire (02-system). `name` is the export name.
export type Envelope = {
	name: string
	status: number
	data?: unknown
	message?: string
	errors?: { issues: readonly Issue[]; fieldErrors: Record<string, string[]> }
	digest?: string
	stack?: string
	// `document` marks an `href` redirect, a full page load even on the app's own origin (BUGS.md 397).
	redirect?: { to: string; status: number; replace: boolean; document?: true }
	// The last line of a `.stream()` that finished (B140).
	end?: true
}

export function okEnvelope(name: string, data: unknown): Envelope {
	return { name, status: 200, data }
}

// A thrown redirect is HTTP 200 with `redirect` and no `data`. The rest goes through the render projector: a named
// status keeps its message, a dev bug carries its stack and opens the overlay, and a production bug shows a
// generic message and a digest (B76, B85).
export function errorEnvelope(
	name: string,
	thrown: unknown,
	context: { sink: ErrorSink } & Routing,
): { http: number; envelope: Envelope } {
	if (thrown instanceof RedirectError) {
		const status = thrown.status
		const to = redirectLocation(thrown, context)
		const redirect = {
			to,
			status,
			replace: thrown.replace,
			...(thrown.href !== undefined && { document: true as const }),
		}
		return { http: 200, envelope: { name, status, redirect } }
	}
	const projected = projectError(thrown, context.sink)
	const { message, stack, digest } = projected.wire
	const envelope: Envelope = { name, status: projected.status, message }
	if (stack !== undefined) envelope.stack = stack
	if (digest !== undefined) envelope.digest = digest
	return { http: projected.status, envelope }
}
