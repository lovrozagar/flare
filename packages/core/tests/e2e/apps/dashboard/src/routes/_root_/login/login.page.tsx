import { DEFAULT_SEARCH } from "../../../search.ts"
import { createPage, Link } from "@lovrozagar/flare"
import { createSignal, Show } from "solid-js"
import type { JSX } from "@solidjs/web"
import { PASSWORD } from "../../../demo.ts"
import { signIn } from "../../../fns/auth.ts"
import { fieldError } from "../../../fns/issues.ts"

type Search = { returnTo?: string }

// Only a path inside the app comes back: anything else, another origin or `//host`, is dropped, so the sign-in page
// cannot send a visitor away.
function returnToOf(raw: Record<string, string | string[]>): Search {
	const value = raw["returnTo"]
	if (typeof value !== "string" || !/^\/app(\/|\?|$)/.test(value) || value.startsWith("//")) return {}
	return { returnTo: value }
}

function SignInForm(props: { returnTo: string | undefined }): JSX.Element {
	const [errors, setErrors] = createSignal<{ email?: string; password?: string }>({})
	const [busy, setBusy] = createSignal(false)
	const submit = async (event: SubmitEvent): Promise<void> => {
		event.preventDefault()
		const form = event.currentTarget as HTMLFormElement
		const data = new FormData(form)
		setBusy(true)
		setErrors({})
		try {
			await signIn({ email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") })
			// A document load: every page after it is rendered for the new session.
			window.location.assign(props.returnTo ?? "/app/projects")
		} catch (error) {
			const email = fieldError(error, "email")
			const password = fieldError(error, "password") ?? (email === undefined ? messageOf(error) : undefined)
			setErrors({ email, password })
			form.querySelector<HTMLInputElement>(email === undefined ? "#password" : "#email")?.focus()
			setBusy(false)
		}
	}
	return (
		<form id="sign-in-form" class="mt-6 space-y-4" onSubmit={(event) => void submit(event)} novalidate>
			<Field name="email" label="Email" type="email" autocomplete="username" error={errors().email} />
			<Field
				name="password"
				label="Password"
				type="password"
				autocomplete="current-password"
				error={errors().password}
			/>
			<button
				id="sign-in"
				type="submit"
				disabled={busy()}
				class="w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
			>
				Sign in
			</button>
			<p class="text-xs text-slate-500">
				Any email works. The password is <code>{PASSWORD}</code>.
			</p>
		</form>
	)
}

// One labelled input and the message under it, which names the input's error.
function Field(props: {
	name: "email" | "password"
	label: string
	type: string
	autocomplete: string
	error: string | undefined
}): JSX.Element {
	return (
		<>
			<label class="block text-sm font-medium">
				{props.label}
				<input
					id={props.name}
					name={props.name}
					type={props.type}
					autocomplete={props.autocomplete}
					aria-invalid={props.error === undefined ? undefined : "true"}
					aria-describedby={`${props.name}-error`}
					class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
				/>
			</label>
			<p id={`${props.name}-error`} class="text-sm text-red-700">
				{props.error ?? ""}
			</p>
		</>
	)
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

// The sign-in page is public and reads the session, so a signed-in visitor sees where to go instead of the form.
export const route = createPage("_root_/login")
	.input({ searchParams: { parse: returnToOf } })
	.authenticateOptional()
	.loader(({ auth }) => ({ email: auth?.email ?? null }))
	.head(() => ({ title: "Sign in — Dashboard" }))
	.render((props) => (
		<main class="flex min-h-screen items-center justify-center px-4">
			<div class="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
				<h1 class="text-xl font-semibold">Sign in</h1>
				<Show when={props.loaderData.email} fallback={<SignInForm returnTo={props.search.returnTo} />}>
					{(email) => (
						<p id="signed-in" class="mt-6 text-sm">
							Signed in as {email()}.{" "}
							<Link to="_root_/(app)/projects" search={DEFAULT_SEARCH} class="text-brand-600 underline">
								Open projects
							</Link>
						</p>
					)}
				</Show>
			</div>
		</main>
	))
