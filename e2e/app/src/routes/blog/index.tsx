import { Link } from "flare/link"
import { createPage } from "flare/page"

export const route = createPage("_root_/(blog)/blog")
	.loader(() => ({ posts: ["hello-world"] }))
	.render((props) => (
		<main data-testid="blog-index">
			<Link data-testid="post-link" params={{ slug: "hello-world" }} to="/blog/[slug]">
				{props.loaderData.posts[0]}
			</Link>
		</main>
	))
