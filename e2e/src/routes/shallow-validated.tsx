import { createPage } from "flare/page"
import { useRouter } from "flare/router"

export const route = createPage("_root_/shallow-validated")
	.input({
		searchParams: (raw) => ({
			filter: (raw.get("filter") ?? "").trim().toLowerCase(),
			page: raw.get("page") ?? "1",
			sort: raw.get("sort") ?? "name",
		}),
	})
	.loader((ctx) => ({
		filter: ctx.location.search.filter,
		page: ctx.location.search.page,
		sort: ctx.location.search.sort,
	}))
	.render((props) => {
		const r = useRouter()
		return (
			<div data-testid="shallow-validated">
				<div data-testid="search-page">{r.location().search.page}</div>
				<div data-testid="search-sort">{r.location().search.sort}</div>
				<div data-testid="search-filter">{r.location().search.filter}</div>

				<div data-testid="loader-page">{props.loaderData.page}</div>
				<div data-testid="loader-sort">{props.loaderData.sort}</div>
				<div data-testid="loader-filter">{props.loaderData.filter}</div>

				<button
					data-testid="shallow-defaults"
					onClick={() => r.navigate({ shallow: true, to: "/shallow-validated" })}
					type="button"
				>
					Shallow Defaults
				</button>
				<button
					data-testid="shallow-explicit"
					onClick={() =>
						r.navigate({
							search: { filter: "", page: "3", sort: "date" },
							shallow: true,
							to: "/shallow-validated",
						})
					}
					type="button"
				>
					Shallow Explicit
				</button>
				<button
					data-testid="shallow-transform"
					onClick={() =>
						r.navigate({
							search: { filter: "  HELLO  ", page: "1", sort: "name" },
							shallow: true,
							to: "/shallow-validated",
						})
					}
					type="button"
				>
					Shallow Transform
				</button>
			</div>
		)
	})
