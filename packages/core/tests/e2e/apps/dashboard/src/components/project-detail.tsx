import { serverFnMutationOptions, useSuspenseQuery } from "@lovrozagar/flare/query"
import { useMutation, useQueryClient } from "@tanstack/solid-query"
import { createSignal, Show } from "solid-js"
import type { JSX } from "@solidjs/web"
import { renameProject } from "../fns/projects.ts"
import { fieldError } from "../fns/issues.ts"
import { detailQuery } from "../queries.ts"

// One project and its rename form. A rename settles by asking the server again, for this project and for every table
// page, so the table behind an open dialog shows the name the server kept, whichever rename answered last.
export function ProjectDetail(props: { id: number }): JSX.Element {
	const client = useQueryClient()
	const query = useSuspenseQuery(() => detailQuery(props.id))
	const [name, setName] = createSignal("")
	const mutation = useMutation(() => ({
		...serverFnMutationOptions(renameProject),
		onSettled: async () => {
			await Promise.all([
				client.invalidateQueries({ queryKey: ["project", props.id] }),
				client.invalidateQueries({ queryKey: ["projects"] }),
			])
		},
	}))
	const submit = (event: SubmitEvent): void => {
		event.preventDefault()
		mutation.mutate({ id: props.id, name: name() })
	}
	return (
		<Show when={query.data} fallback={<p id="project-missing">That project is gone.</p>}>
			{(project) => (
				<div id="project" data-id={project().id}>
					<h2 id="project-name" class="text-lg font-semibold">
						{project().name}
					</h2>
					<dl class="mt-3 grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
						<dt class="text-slate-500">Status</dt>
						<dd id="project-status">{project().status}</dd>
						<dt class="text-slate-500">Budget</dt>
						<dd id="project-budget">{project().budget.toLocaleString("en-US")}</dd>
					</dl>
					<form id="rename" class="mt-4 flex items-start gap-2" onSubmit={submit}>
						<label class="flex-1 text-xs text-slate-500">
							New name
							<input
								id="rename-name"
								name="name"
								class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
								value={name()}
								onInput={(event) => setName(event.currentTarget.value)}
							/>
						</label>
						<button id="rename-submit" type="submit" class="mt-5 rounded-md bg-brand-600 px-3 py-1 text-sm text-white">
							Rename
						</button>
					</form>
					<p id="rename-error" role="alert" class="mt-1 text-sm text-red-700">
						{mutation.error === null ? "" : (fieldError(mutation.error, "name") ?? errorText(mutation.error))}
					</p>
				</div>
			)}
		</Show>
	)
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
