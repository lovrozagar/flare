import { createPage } from "flare/page"
import { Link } from "flare/link"
import { useRouter } from "flare/router"
import { createSignal } from "solid-js"

export const route = createPage("_root_/blocker-test")
	.loader(({ auth }) => {})
	.render(() => {
		const router = useRouter()
		const [dirty, setDirty] = createSignal(false)
		const blocker = router.useBlocker(() => dirty())

		return (
			<div data-testid="blocker-test">
				<h1>Blocker Test</h1>

				<button data-testid="toggle-dirty" onClick={() => setDirty((v) => !v)}>
					{dirty() ? "Dirty" : "Clean"}
				</button>

				<p data-testid="dirty-state">{dirty() ? "dirty" : "clean"}</p>
				<p data-testid="blocked-state">{blocker.blocked() ? "blocked" : "not-blocked"}</p>

				<Link data-testid="nav-link" to="/about">
					Go to About
				</Link>

				<button data-testid="proceed-btn" onClick={() => blocker.proceed()}>
					Proceed
				</button>
				<button data-testid="reset-btn" onClick={() => blocker.reset()}>
					Reset
				</button>
			</div>
		)
	})
