import { For } from "solid-js"
import { createPage, Link } from "@lovrozagar/flare"
import { posts } from "../../data.ts"

export const route = createPage("_root_/")
	.loader(() => posts.map((p) => ({ author: p.author, slug: p.slug, title: p.title })))
	.head(() => ({ title: "Blog Posts" }))
	.render((props) => (
		<main>
			<h1>Blog Posts</h1>
			<ul>
				<For each={props.loaderData}>
					{(post) => (
						<li>
							<Link to="_root_/posts/[slug]" params={{ slug: post.slug }}>
								{post.title}
							</Link>
							<span> by {post.author}</span>
						</li>
					)}
				</For>
			</ul>
		</main>
	))
