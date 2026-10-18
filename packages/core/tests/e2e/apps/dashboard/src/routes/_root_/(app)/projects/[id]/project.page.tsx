import { createPage, notFound } from "@lovrozagar/flare"
import { Loading } from "solid-js"
import { ProjectDetail } from "../../../../../components/project-detail.tsx"
import { projectOf } from "../../../../../db.ts"
import { detailQuery } from "../../../../../queries.ts"

// The id is digits; anything else is id 0, which no project has, so the page is not found.
function idParam(raw: Record<string, string | string[]>): { id: number } {
	const text = raw["id"]
	return { id: typeof text === "string" && /^\d{1,9}$/.test(text) ? Number(text) : 0 }
}

// One project. From the table it opens as a dialog over the table, which stays mounted; a deep link or a reload
// renders it as a page (dx/navigate.md InterceptOutlet). The id is a number; any other text is no project.
export const route = createPage("_root_/(app)/projects/[id]")
	.intercept({ from: ["_root_/(app)/projects"], render: "project-dialog" })
	.input({ params: idParam })
	.loader(async ({ auth, params, queryClient }) => {
		const project = projectOf(auth.workspaceId, params.id)
		if (project === undefined) throw notFound()
		await queryClient.prefetchQuery(detailQuery(params.id))
		return { name: project.name }
	})
	.head((ctx) => ({ title: `${ctx.loaderData.name} — Projects — Dashboard` }))
	.render((props) => (
		<section id="project-page">
			<Loading fallback={<p>Loading…</p>}>
				<ProjectDetail id={props.params.id} />
			</Loading>
		</section>
	))
