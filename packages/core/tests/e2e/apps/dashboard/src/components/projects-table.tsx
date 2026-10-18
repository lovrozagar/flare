import { invalidate, Link, useNavigate } from "@lovrozagar/flare"
import { serverFnMutationOptions, useSuspenseQuery } from "@lovrozagar/flare/query"
import { useMutation, useQueryClient } from "@tanstack/solid-query"
import { createSignal, For, Loading, Show } from "solid-js"
import type { JSX } from "@solidjs/web"
import type { Dir, Project, ProjectPage, ProjectQuery, Sort, Status } from "../db.ts"
import { archiveProject, quickAdd } from "../fns/projects.ts"
import { pageQuery } from "../queries.ts"
import { queryKey, STATUSES } from "../search.ts"

const ID = "_root_/(app)/projects"

const HEADER = "px-4 py-2 text-left font-medium text-slate-500"

// A column header: a Link to the same table ordered by it, which keeps the scroll where it is.
function SortLink(props: { search: ProjectQuery; sort: Sort; label: string }): JSX.Element {
	const current = (): boolean => props.search.sort === props.sort
	const next = (): Dir => (current() && props.search.dir === "asc" ? "desc" : "asc")
	return (
		<th class={HEADER} aria-sort={current() ? (props.search.dir === "asc" ? "ascending" : "descending") : "none"}>
			<Link
				id={`sort-${props.sort}`}
				to={ID}
				search={{ ...props.search, sort: props.sort, dir: next(), page: 1 }}
				scroll={false}
				class="hover:text-slate-900"
			>
				{props.label}
			</Link>
		</th>
	)
}

function day(date: Date): string {
	return date.toISOString().slice(0, 10)
}

function Row(props: { project: Project }): JSX.Element {
	const optimistic = (): boolean => props.project.id < 0
	const archive = async (): Promise<void> => {
		await archiveProject({ id: props.project.id })
		// Flare drops what it holds and loads the page on screen again (B133).
		await invalidate()
	}
	return (
		<tr data-id={props.project.id} data-optimistic={optimistic() ? "true" : undefined}>
			<td class="px-4 py-2">
				<Show when={!optimistic()} fallback={<span class="text-slate-400">{props.project.name}</span>}>
					<Link
						class="project-link font-medium text-brand-700 hover:underline"
						to="_root_/(app)/projects/[id]"
						params={{ id: props.project.id }}
					>
						{props.project.name}
					</Link>
				</Show>
			</td>
			<td class="px-4 py-2 text-slate-600" data-status={props.project.status}>
				{props.project.status}
			</td>
			<td class="px-4 py-2 text-right tabular-nums">{props.project.budget.toLocaleString("en-US")}</td>
			<td class="px-4 py-2 text-slate-500 tabular-nums">{day(props.project.updated)}</td>
			<td class="px-4 py-2 text-right">
				<Show when={!optimistic() && props.project.status !== "archived"}>
					<button type="button" class="text-xs text-slate-500 underline" data-archive onClick={() => void archive()}>
						Archive
					</button>
				</Show>
			</td>
		</tr>
	)
}

// The filters apply on submit and replace the entry: refining a search is not a step Back has to undo.
function Filters(props: { search: ProjectQuery }): JSX.Element {
	const navigate = useNavigate()
	const apply = (event: SubmitEvent): void => {
		event.preventDefault()
		const form = new FormData(event.currentTarget as HTMLFormElement)
		const text = (name: string): string => String(form.get(name) ?? "").trim()
		const status = form.getAll("status").map(String) as Status[]
		void navigate({
			to: ID,
			search: {
				sort: props.search.sort,
				dir: props.search.dir,
				page: 1,
				...(text("q") === "" ? {} : { q: text("q") }),
				...(status.length === 0 ? {} : { status }),
				...(text("from") === "" ? {} : { from: new Date(`${text("from")}T00:00:00.000Z`) }),
				...(text("to") === "" ? {} : { to: new Date(`${text("to")}T23:59:59.999Z`) }),
			},
			replace: true,
		})
	}
	const input = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
	return (
		<form id="filters" class="flex flex-wrap items-end gap-3" onSubmit={apply}>
			<label class="text-xs text-slate-500">
				Name
				<input id="q" name="q" class={`${input} mt-1 block`} value={props.search.q ?? ""} />
			</label>
			<fieldset class="flex gap-2 text-sm">
				<legend class="text-xs text-slate-500">Status</legend>
				<For each={STATUSES}>
					{(status) => (
						<label class="flex items-center gap-1">
							<input
								type="checkbox"
								name="status"
								value={status}
								checked={props.search.status?.includes(status) ?? false}
							/>
							{status}
						</label>
					)}
				</For>
			</fieldset>
			<label class="text-xs text-slate-500">
				Updated from
				<input id="from" name="from" type="date" class={`${input} mt-1 block`} value={dayOr(props.search.from)} />
			</label>
			<label class="text-xs text-slate-500">
				to
				<input id="to" name="to" type="date" class={`${input} mt-1 block`} value={dayOr(props.search.to)} />
			</label>
			<button id="apply" type="submit" class="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white">
				Apply
			</button>
		</form>
	)
}

function dayOr(date: Date | undefined): string {
	return date === undefined ? "" : day(date)
}

type Rollback = { key: readonly unknown[]; previous: ProjectPage | undefined }

// A quick add shows its row at once, before the server answers, and takes it back if the server refuses it.
function QuickAdd(props: { search: ProjectQuery }): JSX.Element {
	const client = useQueryClient()
	const [name, setName] = createSignal("")
	const mutation = useMutation<Project, Error, { name: string }, Rollback>(() => ({
		...serverFnMutationOptions(quickAdd),
		onMutate: async (input) => {
			const key = queryKey(props.search)
			await client.cancelQueries({ queryKey: key })
			const previous = client.getQueryData<ProjectPage>(key)
			const row: Project = { id: -1, name: input.name, status: "active", budget: 0, updated: new Date() }
			client.setQueryData<ProjectPage>(key, (page) => page && { ...page, rows: [row, ...page.rows] })
			return { key, previous }
		},
		onSuccess: () => setName(""),
		onError: (_error, _input, rollback) => {
			if (rollback !== undefined) client.setQueryData(rollback.key, rollback.previous)
		},
		onSettled: () => client.invalidateQueries({ queryKey: ["projects"] }),
	}))
	const submit = (event: SubmitEvent): void => {
		event.preventDefault()
		mutation.mutate({ name: name() })
	}
	return (
		<form id="quick-add" class="flex items-center gap-2" onSubmit={submit}>
			<input
				id="quick-name"
				aria-label="New project name"
				placeholder="New project"
				class="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
				value={name()}
				onInput={(event) => setName(event.currentTarget.value)}
			/>
			<button id="quick-submit" type="submit" class="rounded-md border border-slate-300 px-3 py-1 text-sm">
				Add
			</button>
			<p id="quick-error" role="alert" class="text-sm text-red-700">
				{mutation.error instanceof Error ? mutation.error.message : ""}
			</p>
		</form>
	)
}

// The total and the pages. Next prefetches its page's data on hover, so the click lands on what it fetched.
function Pager(props: { search: ProjectQuery; page: ProjectPage | undefined }): JSX.Element {
	const at = (): number => props.page?.page ?? 1
	const pages = (): number => props.page?.pages ?? 1
	return (
		<nav class="mt-4 flex items-center justify-between text-sm" aria-label="Pages">
			<p id="total" class="text-slate-500">
				{props.page?.total ?? 0} projects
			</p>
			<div class="flex items-center gap-3">
				<Show when={at() > 1}>
					<Link id="prev" to={ID} search={{ ...props.search, page: at() - 1 }} class="underline">
						Previous
					</Link>
				</Show>
				<span id="page-of">
					{at()} / {pages()}
				</span>
				<Show when={at() < pages()}>
					<Link
						id="next"
						to={ID}
						search={{ ...props.search, page: at() + 1 }}
						prefetch={{ data: "intent" }}
						class="underline"
					>
						Next
					</Link>
				</Show>
			</div>
		</nav>
	)
}

// The rows of one table state. Its query key never changes in place: the page keys this component by the search,
// so a new search mounts a new table (BUGS.md 39.4, TanStack/query#11903).
function Rows(props: { search: ProjectQuery }): JSX.Element {
	const query = useSuspenseQuery(() => pageQuery(props.search))
	const page = (): ProjectPage | undefined => query.data
	return (
		<>
			<table id="projects" class="mt-4 w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
				<thead class="border-b border-slate-200 bg-slate-50">
					<tr>
						<SortLink search={props.search} sort="name" label="Name" />
						<th class={HEADER}>Status</th>
						<SortLink search={props.search} sort="budget" label="Budget" />
						<SortLink search={props.search} sort="updated" label="Updated" />
						<th class={HEADER} />
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100">
					<For each={page()?.rows ?? []} keyed={(project) => project.id}>
						{(project) => <Row project={project()} />}
					</For>
				</tbody>
			</table>
			<Pager search={props.search} page={page()} />
		</>
	)
}

export function ProjectsTable(props: { search: ProjectQuery }): JSX.Element {
	const key = (): string => JSON.stringify(queryKey(props.search))
	return (
		<section>
			<div class="flex flex-wrap items-center justify-between gap-4">
				<h1 id="title" class="text-lg font-semibold">
					Projects
				</h1>
				<div class="flex items-center gap-3">
					<QuickAdd search={props.search} />
					<Link
						id="new-project"
						to="_root_/(app)/projects/new"
						class="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white"
					>
						New project
					</Link>
				</div>
			</div>
			<div class="mt-4">
				<Filters search={props.search} />
			</div>
			<p
				id="applied"
				class="mt-3 font-mono text-xs text-slate-500"
				data-page-type={typeof props.search.page}
				data-from-type={props.search.from instanceof Date ? "Date" : "none"}
				data-status={(props.search.status ?? []).join(",")}
			>
				page {props.search.page} · {props.search.sort} {props.search.dir}
				{props.search.from === undefined ? "" : ` · from ${props.search.from.toISOString()}`}
				{props.search.to === undefined ? "" : ` · to ${props.search.to.toISOString()}`}
			</p>
			<Show when={key()} keyed>
				<Loading
					fallback={
						<p id="projects-loading" class="mt-4 text-sm text-slate-500">
							Loading projects…
						</p>
					}
				>
					<Rows search={props.search} />
				</Loading>
			</Show>
		</section>
	)
}
