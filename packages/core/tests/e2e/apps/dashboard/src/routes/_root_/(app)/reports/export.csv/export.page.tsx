import { createPage } from "@lovrozagar/flare"
import { workspaceOf } from "../../../../../db.ts"

const encoder = new TextEncoder()

// A CSV field: quoted when it holds a comma, a quote, or a line break, with quotes doubled.
function field(value: string | number): string {
	const text = String(value)
	return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

// The workspace's projects as a CSV download, streamed a row at a time. It needs the session, as every page under
// the app does; it renders nothing.
export const route = createPage("_root_/(app)/reports/export.csv").response(({ auth }) => {
	const projects = workspaceOf(auth.workspaceId)?.projects ?? []
	const lines = [
		"id,name,status,budget,updated",
		...projects.map((project) =>
			[project.id, project.name, project.status, project.budget, project.updated.toISOString()].map(field).join(","),
		),
	]
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const line of lines) controller.enqueue(encoder.encode(`${line}\n`))
			controller.close()
		},
	})
	return new Response(body, {
		headers: {
			"content-type": "text/csv; charset=utf-8",
			"content-disposition": 'attachment; filename="projects.csv"',
			"cache-control": "private, no-store",
		},
	})
})
