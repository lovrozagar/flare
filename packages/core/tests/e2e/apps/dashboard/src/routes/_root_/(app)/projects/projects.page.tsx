import { createPage } from "@lovrozagar/flare"
import { For } from "solid-js"
import { workspaceOf } from "../../../../db.ts"

// The workspace's projects.
export const route = createPage("_root_/(app)/projects")
	.loader(({ auth }) => ({
		projects: (workspaceOf(auth.workspaceId)?.projects ?? []).map((project) => ({
			id: project.id,
			name: project.name,
			status: project.status,
		})),
	}))
	.head(() => ({ title: "Projects — Dashboard" }))
	.render((props) => (
		<section>
			<h1 id="title" class="text-lg font-semibold">
				Projects
			</h1>
			<ul id="projects" class="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
				<For each={props.loaderData.projects} keyed={(project) => project.id}>
					{(project) => (
						<li class="flex justify-between px-4 py-2 text-sm" data-id={project().id}>
							<span>{project().name}</span>
							<span class="text-slate-500">{project().status}</span>
						</li>
					)}
				</For>
			</ul>
		</section>
	))
