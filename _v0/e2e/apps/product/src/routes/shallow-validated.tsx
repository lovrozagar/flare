import { createPage } from "@lovrozagar/flare/page";
import { useRouter } from "@lovrozagar/flare/router";

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
		const r = useRouter();
		return (
			<main data-testid="shallow-validated">
				<p data-testid="search-page">{String(r.location().search.page ?? "")}</p>
				<p data-testid="search-sort">{String(r.location().search.sort ?? "")}</p>
				<p data-testid="search-filter">{String(r.location().search.filter ?? "")}</p>
				<p data-testid="loader-page">{props.loaderData.page}</p>
				<p data-testid="loader-filter">{props.loaderData.filter}</p>
				<p data-testid="loader-sort">{props.loaderData.sort}</p>
				<button
					data-testid="shallow-explicit"
					type="button"
					onClick={() =>
						r.navigate({
							search: { filter: "  HELLO  ", page: "3", sort: "date" },
							shallow: true,
							to: "/shallow-validated",
						})
					}
				>
					Shallow
				</button>
				<button
					data-testid="shallow-defaults"
					type="button"
					onClick={() =>
						r.navigate({
							search: { filter: "", page: "1", sort: "name" },
							shallow: true,
							to: "/shallow-validated",
						})
					}
				>
					Defaults
				</button>
				<button
					data-testid="shallow-transform"
					type="button"
					onClick={() =>
						r.navigate({
							search: { filter: "  HELLO  ", page: "1", sort: "name" },
							shallow: true,
							to: "/shallow-validated",
						})
					}
				>
					Transform
				</button>
			</main>
		);
	});
