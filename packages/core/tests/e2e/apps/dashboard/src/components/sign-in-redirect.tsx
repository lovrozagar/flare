import { Link, useLocation, useNavigate } from "@lovrozagar/flare"
import { onSettled } from "solid-js"
import type { JSX } from "@solidjs/web"

// A page that needs a session, reached without one: the document answers 401 with a link to sign in, and once the
// client runs it replaces this entry with the sign-in page, carrying the URL to come back to. The URL is Flare's
// location, the one this render is for.
export function SignInRedirect(): JSX.Element {
	const navigate = useNavigate()
	const location = useLocation()
	onSettled(() => {
		const pairs = Object.entries(location.search).flatMap(([key, value]) => [value].flat().map((one) => [key, one]))
		const query = new URLSearchParams(pairs).toString()
		const returnTo = `${location.pathname}${query === "" ? "" : `?${query}`}`
		void navigate({ to: "_root_/login", search: { returnTo }, replace: true })
	})
	return (
		<main id="signed-out" class="flex min-h-screen items-center justify-center">
			<p class="text-sm text-slate-600">
				Your session ended.{" "}
				<Link to="_root_/login" class="text-brand-600 underline">
					Sign in
				</Link>
			</p>
		</main>
	)
}
