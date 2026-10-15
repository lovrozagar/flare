import { createPage, Link } from "@lovrozagar/flare"
import { createSignal, Show } from "solid-js"
import type { JSX } from "@solidjs/web"
import { login, logout } from "../../../../fns/auth.ts"
import { useUi } from "../../../../i18n.ts"

// A login is a server function whose returned Response sets the cookie. A document load then shows the session
// everywhere, including the admin root.
async function signOut(): Promise<void> {
	await logout()
	window.location.assign("/login")
}

function LoginForm(): JSX.Element {
	const [user, setUser] = createSignal("ada")
	const [error, setError] = createSignal("")
	const signIn = async (role: "admin" | "reader"): Promise<void> => {
		setError("")
		try {
			await login({ user: user(), role })
			window.location.assign("/admin")
		} catch (thrown) {
			setError(thrown instanceof Error ? thrown.message : String(thrown))
		}
	}
	return (
		<div class="mt-6 space-y-3">
			<input
				id="login-user"
				value={user()}
				onInput={(event) => setUser(event.currentTarget.value)}
				class="w-full rounded-md border border-stone-300 bg-white px-3 py-2 dark:border-ink-800 dark:bg-ink-900"
			/>
			<div class="flex gap-2">
				<button
					id="login-admin"
					type="button"
					class="rounded-md bg-flame-500 px-3 py-1.5 text-sm text-white"
					onClick={() => void signIn("admin")}
				>
					Sign in as admin
				</button>
				<button
					id="login-reader"
					type="button"
					class="rounded-md border px-3 py-1.5 text-sm"
					onClick={() => void signIn("reader")}
				>
					Sign in as reader
				</button>
			</div>
			<p id="login-error" class="text-sm text-red-600">
				{error()}
			</p>
		</div>
	)
}

function SessionPanel(props: { user: string; role: string }): JSX.Element {
	const ui = useUi()
	return (
		<div class="mt-6 space-y-3">
			<p id="session">
				Signed in as <strong>{props.user}</strong> ({ui("role", { role: props.role })})
			</p>
			<div class="flex gap-3 text-sm">
				<Link to="_admin_/admin" class="underline">
					Open admin
				</Link>
				<button id="logout" type="button" class="underline" onClick={() => void signOut()}>
					Sign out
				</button>
			</div>
		</div>
	)
}

// The session is optional here: the page reads it and still renders for a guest.
export const route = createPage("[[locale]]/_root_/login")
	.authenticateOptional()
	.loader(({ auth }) => ({ user: auth?.user ?? null, role: auth?.role ?? null }))
	.head(() => ({ title: "Sign in — Flare docs", robots: { index: false, follow: false } }))
	.render((props) => (
		<main class="mx-auto max-w-md px-5 py-16">
			<h1 class="text-2xl font-semibold">Sign in</h1>
			<Show when={props.loaderData.user} fallback={<LoginForm />}>
				{(name) => <SessionPanel user={name()} role={props.loaderData.role ?? "reader"} />}
			</Show>
		</main>
	))
