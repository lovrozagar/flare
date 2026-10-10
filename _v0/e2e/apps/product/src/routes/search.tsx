import { Link } from "@lovrozagar/flare/link";
import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/search")
	.loader((ctx) => {
		const q = ctx.location.search.q ?? "";
		const page = ctx.location.search.page ?? "1";
		return {
			page: String(page),
			paramCount: Object.keys(ctx.location.search).length,
			q: String(q),
		};
	})
	.head((ctx) => ({
		title: `Search: ${(ctx.loaderData as { q: string }).q || "empty"}`,
	}))
	.render((props) => (
		<main data-testid="search">
			<h1 data-testid="search-heading">Search</h1>
			<p data-testid="search-q">{props.loaderData.q}</p>
			<p data-testid="search-page">{props.loaderData.page}</p>
			<p data-testid="search-count">{String(props.loaderData.paramCount)}</p>
			<nav>
				<Link to="/">Home</Link>
				<Link search={{ page: "3", q: "flare" }} to="/search">
					Next
				</Link>
			</nav>
		</main>
	));
