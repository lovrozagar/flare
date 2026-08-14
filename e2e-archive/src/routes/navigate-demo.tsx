import { createPage } from "flare/page"
import { Link } from "flare/link"
import { useRouter } from "flare/router"

export const route = createPage("_root_/navigate-demo")
	.loader(() => ({ loaded: true }))
	.render(() => {
		const r = useRouter()
		return (
			<main data-testid="navigate-demo">
				<h1>Navigate Demo</h1>
				<button data-testid="nav-to-about" onClick={() => r.navigate({ to: "/about" })}>
					Go to About
				</button>
				<button
					data-testid="nav-replace-about"
					onClick={() => r.navigate({ replace: true, to: "/about" })}
				>
					Replace to About
				</button>
				<button
					data-testid="nav-with-search"
					onClick={() => r.navigate({ search: { page: "2", q: "hello" }, to: "/search-demo" })}
				>
					Search Demo
				</button>
				<button data-testid="nav-invalidate" onClick={() => r.invalidate()}>
					Invalidate
				</button>
				<p data-testid="is-navigating">{String(r.isNavigating())}</p>
				<p data-testid="current-path">{r.location().pathname}</p>
				<Link to="/">Home</Link>
			</main>
		)
	})
