import { RedirectError } from "../../shared/errors/redirect.ts"
import type { Issue } from "../../shared/validation/index.ts"
import { redirectLocation } from "../redirect/index.ts"
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
	redirect?: { to: string; status: number; replace: boolean }
}

// A redirect a server function throws without a status is "See Other" after the request that ran the handler.
const SEE_OTHER = 303

export function okEnvelope(name: string, data: unknown): Envelope {
	return { name, status: 200, data }
}

// A thrown redirect is HTTP 200 with `redirect` and no `data`. The rest goes through the render projector: a named
// status keeps its message, a dev bug carries its stack and opens the overlay, and a production bug shows a
// generic message and a digest (B76, B85).
export function errorEnvelope(
	name: string,
	thrown: unknown,
	context: { sink: ErrorSink; basePath: string },
): { http: number; envelope: Envelope } {
	if (thrown instanceof RedirectError) {
		const status = thrown.defaulted ? SEE_OTHER : thrown.status
		const to = redirectLocation(thrown, context.basePath)
		return { http: 200, envelope: { name, status, redirect: { to, status, replace: thrown.replace } } }
	}
	const projected = projectError(thrown, context.sink)
	const { message, stack, digest } = projected.wire
	const envelope: Envelope = { name, status: projected.status, message }
	if (stack !== undefined) envelope.stack = stack
	if (digest !== undefined) envelope.digest = digest
	return { http: projected.status, envelope }
}
