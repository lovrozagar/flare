import { createPage, Link } from "@lovrozagar/flare"
import { createSignal, For } from "solid-js"
import type { JSX } from "@solidjs/web"
import { createProject } from "../../../../../fns/projects.ts"
import { fieldError } from "../../../../../fns/issues.ts"
import { STATUSES } from "../../../../../search.ts"

const INPUT = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"

type Errors = { name?: string; budget?: string; form?: string }

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

// A refused call's problems: each named field under its field, anything else for the whole form.
function errorsOf(error: unknown): Errors {
	const name = fieldError(error, "name")
	const budget = fieldError(error, "budget")
	if (name === undefined && budget === undefined) return { form: errorText(error) }
	return { ...(name === undefined ? {} : { name }), ...(budget === undefined ? {} : { budget }) }
}

// A text field with its label and the server's message for it.
function Field(props: {
	id: string
	label: string
	value: string
	error: string | undefined
	numeric?: boolean
	onInput: (value: string) => void
}): JSX.Element {
	return (
		<label class="block text-sm">
			{props.label}
			<input
				id={props.id}
				class={INPUT}
				inputmode={props.numeric === true ? "numeric" : undefined}
				value={props.value}
				onInput={(event) => props.onInput(event.currentTarget.value)}
			/>
			<span id={`${props.id.replace("new-", "")}-error`} class="text-xs text-red-700">
				{props.error ?? ""}
			</span>
		</label>
	)
}

// A full create form. The server function answers with a redirect to the table, which Flare follows as a navigation
// that loads the table fresh; a field it refuses comes back under that field, and the form keeps what was typed.
function NewProjectForm(): JSX.Element {
	const [name, setName] = createSignal("")
	const [budget, setBudget] = createSignal("")
	const [status, setStatus] = createSignal("active")
	const [errors, setErrors] = createSignal<Errors>({})
	const submit = async (event: SubmitEvent): Promise<void> => {
		event.preventDefault()
		setErrors({})
		try {
			await createProject({ name: name(), budget: budget(), status: status() })
		} catch (error) {
			setErrors(errorsOf(error))
		}
	}
	return (
		<form id="new-form" class="mt-4 max-w-md space-y-4" onSubmit={(event) => void submit(event)}>
			<Field id="new-name" label="Name" value={name()} error={errors().name} onInput={setName} />
			<Field
				id="new-budget"
				label="Budget (USD)"
				value={budget()}
				error={errors().budget}
				numeric
				onInput={setBudget}
			/>
			<label class="block text-sm">
				Status
				<select
					id="new-status"
					class={INPUT}
					value={status()}
					onChange={(event) => setStatus(event.currentTarget.value)}
				>
					<For each={STATUSES}>{(item) => <option value={item}>{item}</option>}</For>
				</select>
			</label>
			<p id="form-error" role="alert" class="text-sm text-red-700">
				{errors().form ?? ""}
			</p>
			<div class="flex items-center gap-3">
				<button id="create" type="submit" class="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white">
					Create project
				</button>
				<Link to="_root_/(app)/projects" search={{ sort: "updated", dir: "desc", page: 1 }} class="text-sm underline">
					Cancel
				</Link>
			</div>
		</form>
	)
}

export const route = createPage("_root_/(app)/projects/new")
	.head(() => ({ title: "New project — Dashboard" }))
	.render(() => (
		<section>
			<h1 id="title" class="text-lg font-semibold">
				New project
			</h1>
			<NewProjectForm />
		</section>
	))
