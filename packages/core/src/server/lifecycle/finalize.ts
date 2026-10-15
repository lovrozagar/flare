import { statusOf } from "../../shared/errors/status.ts"
import { BUILD_HEADER, RENDER_HEADER } from "../../shared/protocol/index.ts"
import { defaultHeaders } from "../security/defaults.ts"
import { buildId } from "./build-info.ts"
import { NO_STORE, recordCookies } from "./policies.ts"

// `body` may be a stream or bytes: a .response() answer passes through unread (dx/server.md).
export type StageResult = {
	status: number
	body: BodyInit | null
	render?: "ssr" | "isr" | "ssg"
	url?: string
	build?: string
	location?: string | undefined
	run?: () => void
	headers?: Headers | undefined
}

export function finalize(stage: StageResult): Response {
	const settled = settle(stage)
	const headers = new Headers({ "cache-control": NO_STORE })
	if (settled.render !== undefined) headers.set(RENDER_HEADER, settled.render)
	// Every pipeline response names the build that answered it (B84).
	headers.set(BUILD_HEADER, settled.build ?? buildId)
	if (settled.location !== undefined) headers.set("location", settled.location)
	if (settled.url !== undefined) copySecurity(headers, settled.url)
	if (settled.headers !== undefined) copyHeaders(headers, settled.headers)
	return recordCookies(new Response(settled.body === "" ? null : settled.body, { status: settled.status, headers }))
}

function settle(stage: StageResult): StageResult {
	if (stage.run === undefined) return stage
	try {
		stage.run()
		return stage
	} catch (error) {
		return { ...stage, status: statusOf(error), body: "" }
	}
}

// Every Set-Cookie value is kept. Any other header replaces.
function copyHeaders(target: Headers, extra: Headers): void {
	extra.forEach((value, name) => {
		if (name !== "set-cookie") target.set(name, value)
	})
	for (const cookie of extra.getSetCookie()) target.append("set-cookie", cookie)
}

function copySecurity(headers: Headers, url: string): void {
	for (const [name, value] of defaultHeaders(url)) headers.set(name, value)
}
