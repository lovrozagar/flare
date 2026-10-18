import { createPage } from "@lovrozagar/flare"
import { ProjectsTable } from "../../../../components/projects-table.tsx"
import { pageQuery } from "../../../../queries.ts"
import { projectSearch } from "../../../../search.ts"

// The workspace's projects as a table the URL drives: search, statuses, a date range, the order, and the page are all
// in the search, validated into a number, a list, and dates (dx/link.md URL values). The loader puts the page in the
// request's query client, so the document and a client navigation paint it without a second request.
export const route = createPage("_root_/(app)/projects")
	.input({ searchParams: projectSearch })
	.effects({
		// The search is the whole table state: a stay with another search runs the loader again.
		loaderDeps: (ctx) => [ctx.search],
		shouldRefetch: (ctx) => ctx.trigger === "revalidation",
	})
	.loader(async ({ search, queryClient }) => {
		await queryClient.prefetchQuery(pageQuery(search))
	})
	.head(() => ({ title: "Projects — Dashboard" }))
	.render((props) => <ProjectsTable search={props.search} />)
