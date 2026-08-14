import { Link } from "flare/link"
import { createPage } from "flare/page"
import { useLoaderData, useLocation, useNavigate, useSearch } from "flare/router"

export const route = createPage("_root_/hooks-test")
	.loader(() => ({ greeting: "hello from hooks" }))
	.render(() => {
		const data = useLoaderData({ from: "_root_/hooks-test" })
		const location = useLocation()
		const navigate = useNavigate()
		const search = useSearch({ from: "_root_/hooks-test" })
		return (
			<main data-testid="hooks-test">
				<p data-testid="loader-greeting">{data().greeting}</p>
				<p data-testid="location-pathname">{location().pathname}</p>
				<p data-testid="search-json">{JSON.stringify(search())}</p>
				<button
					data-testid="navigate-btn"
					type="button"
					onClick={() => navigate({ search: { filter: "active" }, to: "/hooks-test" })}
				>
					Search
				</button>
				<Link data-testid="about-link" to="/about">
					About
				</Link>
			</main>
		)
	})
