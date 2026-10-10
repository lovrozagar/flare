import { Link } from "@lovrozagar/flare/link";
import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/(blog)/blog")
	.cache({ cdn: { maxAge: "1d", swr: "7d", tags: ["fs-paths"] }, isr: true })
	.render(() => (
		<>
			<main data-testid="blog-list">Blog</main>
			<Link data-testid="blog-data-link" to="/blog-data">
				Data
			</Link>
		</>
	));
