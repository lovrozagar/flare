import { serverFnQueryOptions } from "@lovrozagar/flare/query"
import type { ProjectQuery } from "./db.ts"
import { projectDetail, projectPage } from "./fns/projects.ts"
import { queryKey } from "./search.ts"

// The table's page and one project, as queries a loader prefetches and a component reads. A value the loader put in
// the request's client stays fresh for a while, so mounting the page that read it does not ask the server again; a
// mutation's invalidation still does.
const FRESH = 10_000

export function pageQuery(search: ProjectQuery) {
	return { ...serverFnQueryOptions(projectPage, { queryKey: queryKey(search), input: search }), staleTime: FRESH }
}

export function detailQuery(id: number) {
	return { ...serverFnQueryOptions(projectDetail, { queryKey: ["project", id], input: { id } }), staleTime: FRESH }
}
