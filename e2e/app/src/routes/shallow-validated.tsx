import { createPage } from "flare/page"
import { useRouter } from "flare/router"

export const route = createPage("_root_/shallow-validated")
	.input({
		searchParams: (raw) => ({
			filter: (raw.get("filter") ?? "").trim().toLowerCase(),
			page: raw.get("page") ?? "1",
		}),
	})
	.loader((ctx) => ({
		filter: ctx.location.search.filter,
		page: ctx.location.search.page,
	}))
	.render((props) => {
		const r = useRouter()
		return (
			<main data-testid="shallow-validated">
				<p data-testid="search-page">{String(r.location().search.page ?? "")}</p>
				<p data-testid="loader-page">{props.loaderData.page}</p>
				<p data-testid="loader-filter">{props.loaderData.filter}</p>
				<button
					data-testid="shallow-explicit"
					type="button"
					onClick={() =>
						r.navigate({
							search: { filter: "  HELLO  ", page: "3" },
							shallow: true,
							to: "/shallow-validated",
						})
					}
				>
					Shallow
				</button>
			</main>
		)
	})
