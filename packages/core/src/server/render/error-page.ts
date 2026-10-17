import { escape } from "@solidjs/web"
import type { Projected } from "./projector.ts"

// The page a render that failed before the shell answers with, so its status never reaches the browser as a blank
// page: the status and a heading, `Something went wrong` for a bug and the named status's message otherwise, the
// digest a production bug carries, and the message and stack a dev bug carries (plan 21 13.13). It loads nothing, so
// any security policy allows it.
export function errorPage(projected: Pick<Projected, "status" | "wire">): string {
	const { status, wire } = projected
	const heading = status === 500 ? "Something went wrong" : escape(wire.message)
	const digest = wire.digest === undefined ? "" : `<p>Reference <code>${escape(wire.digest)}</code></p>`
	const stack = wire.stack === undefined ? "" : `<pre>${escape(`${wire.message}\n${wire.stack}`)}</pre>`
	return (
		'<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
		'<meta name="viewport" content="width=device-width, initial-scale=1">' +
		`<title>${status} ${heading}</title></head><body><h1>${heading}</h1>${digest}${stack}</body></html>`
	)
}
