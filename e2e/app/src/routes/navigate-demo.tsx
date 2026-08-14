import { createPage } from "flare/page"
import { useRouter } from "flare/router"

export const route = createPage("_root_/navigate-demo")
	.loader(() => ({ loadedAt: Date.now() }))
	.render((props) => {
		const r = useRouter()
		return (
			<main data-testid="navigate-demo">
				<p data-testid="nav-loaded-at">{props.loaderData.loadedAt}</p>
				<p data-testid="current-path">{r.location().pathname}</p>
				<button data-testid="nav-to-about" type="button" onClick={() => r.navigate({ to: "/about" })}>
					About
				</button>
				<button
					data-testid="nav-replace-about"
					type="button"
					onClick={() => r.navigate({ replace: true, to: "/about" })}
				>
					Replace About
				</button>
				<button
					data-testid="nav-with-search"
					type="button"
					onClick={() => r.navigate({ search: { page: "2", q: "hello" }, to: "/search" })}
				>
					Search
				</button>
				<button data-testid="nav-invalidate" type="button" onClick={() => r.invalidate()}>
					Invalidate
				</button>
			</main>
		)
	})
