import { Link } from "@lovrozagar/flare/link";
import { createPage } from "@lovrozagar/flare/page";
import { For } from "solid-js";

export const route = createPage("_root_/(blog)/blog")
	.loader(() => ({
		posts: [
			{ slug: "hello-world", title: "Hello World" },
			{ slug: "second-post", title: "Second Post" },
			{ slug: "third-post", title: "Third Post" },
		],
	}))
	.head(() => ({ title: "Blog" }))
	.render((props) => (
		<main data-testid="blog-index">
			<div data-testid="blog-list">
				<h1>Blog</h1>
				<ul>
					<For each={props.loaderData.posts}>
						{(post) => (
							<li>
								<Link
									data-testid={post.slug === "hello-world" ? "post-link" : undefined}
									params={{ slug: post.slug }}
									to="/blog/[slug]"
								>
									{post.title}
								</Link>
							</li>
						)}
					</For>
				</ul>
			</div>
		</main>
	));
