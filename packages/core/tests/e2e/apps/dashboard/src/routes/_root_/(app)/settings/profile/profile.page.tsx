import { createPage, useBlocker } from "@lovrozagar/flare"
import { createSignal } from "solid-js"
import { saveProfile } from "../../../../../fns/settings.ts"
import { fieldError } from "../../../../../fns/issues.ts"
import type { JSX } from "@solidjs/web"

const INPUT = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"

// The profile form. While it holds an unsaved change, leaving asks first: a link, a navigation, a reload, and a tab
// close. Back and Forward are the browser's own step and are not asked (dx/navigate.md useBlocker).
function ProfileForm(props: { name: string; email: string }): JSX.Element {
	// Writable, and reset to the saved name when a save lands back here with it. The state line says "Saving…" while the
	// save is in flight and "Saved" only once it has landed (BUGS.md 369).
	const [draft, setDraft] = createSignal(() => props.name)
	const [error, setError] = createSignal("")
	const [saving, setSaving] = createSignal(false)
	const dirty = (): boolean => !saving() && draft() !== props.name
	useBlocker(() => !dirty() || window.confirm("Discard unsaved changes?"))
	const submit = async (event: SubmitEvent): Promise<void> => {
		event.preventDefault()
		setError("")
		setSaving(true)
		try {
			await saveProfile({ name: draft() })
		} catch (thrown) {
			setError(fieldError(thrown, "name") ?? (thrown instanceof Error ? thrown.message : String(thrown)))
		} finally {
			setSaving(false)
		}
	}
	return (
		<form id="profile-form" class="max-w-md space-y-4" onSubmit={(event) => void submit(event)}>
			<label class="block text-sm">
				Display name
				<input
					id="profile-name"
					class={INPUT}
					value={draft()}
					onInput={(event) => setDraft(event.currentTarget.value)}
				/>
				<span id="profile-error" class="text-xs text-red-700">
					{error()}
				</span>
			</label>
			<p class="text-sm text-slate-500">
				Email <span id="profile-email">{props.email}</span>
			</p>
			<div class="flex items-center gap-3">
				<button id="profile-save" type="submit" class="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white">
					Save
				</button>
				<span id="profile-state" class="text-xs text-slate-500">
					{saving() ? "Saving…" : dirty() ? "Unsaved changes" : "Saved"}
				</span>
			</div>
		</form>
	)
}

export const route = createPage("_root_/(app)/settings/profile")
	.loader(({ auth }) => ({ name: auth.name, email: auth.email }))
	.head(() => ({ title: "Profile — Dashboard" }))
	.render((props) => (
		<section>
			<h1 id="title" class="mb-4 text-lg font-semibold">
				Profile
			</h1>
			<ProfileForm name={props.loaderData.name} email={props.loaderData.email} />
		</section>
	))
