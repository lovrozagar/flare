import { Link } from "flare/link"
import { createPage } from "flare/page"
import { useRouter } from "flare/router"
import { createSignal } from "solid-js"

export const route = createPage("_root_/blocker-test").render(() => {
	const router = useRouter()
	const [dirty, setDirty] = createSignal(false)
	const blocker = router.useBlocker(() => dirty())

	return (
		<main data-testid="blocker-test">
			<button data-testid="toggle-dirty" type="button" onClick={() => setDirty((v) => !v)}>
				{dirty() ? "Dirty" : "Clean"}
			</button>
			<p data-testid="dirty-state">{dirty() ? "dirty" : "clean"}</p>
			<p data-testid="blocked-state">{blocker.blocked() ? "blocked" : "not-blocked"}</p>
			<Link data-testid="nav-link" to="/about">
				Go to About
			</Link>
			<button data-testid="proceed-btn" type="button" onClick={() => blocker.proceed()}>
				Proceed
			</button>
			<button data-testid="reset-btn" type="button" onClick={() => blocker.reset()}>
				Reset
			</button>
		</main>
	)
})
