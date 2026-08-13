import { For } from "solid-js"
import { createPage } from "flare/page"
import { Link } from "flare/link"

export const route = createPage("_root_/(blog)/blog/")
	.loader(() => [
		{ slug: "hello-world", title: "Hello World" },
		{ slug: "second-post", title: "Second Post" },
		{ slug: "third-post", title: "Third Post" },
	])
	.head(() => ({ title: "Blog" }))
	.render((props) => (
		<main data-testid="blog-list">
			<h1>Blog</h1>
			<ul>
				<For each={props.loaderData}>
					{(post) => (
						<li>
							<Link params={{ slug: post.slug }} to="/blog/[slug]">
								{post.title}
							</Link>
						</li>
					)}
				</For>
			</ul>
		</main>
	))
