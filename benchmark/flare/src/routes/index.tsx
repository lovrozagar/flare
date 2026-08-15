import { For } from "solid-js";
import { createPage } from "@lovrozagar/flare";
import { Link } from "@lovrozagar/flare/link";
import { posts } from "../../../shared/data";

export const route = createPage("_root_/index")
	.loader(() => posts.map((p) => ({ author: p.author, slug: p.slug, title: p.title })))
	.head(() => ({ title: "Blog Posts" }))
	.render((props) => (
		<main>
			<h1>Blog Posts</h1>
			<ul>
				<For each={props.loaderData}>
					{(post) => (
						<li>
							<Link to={`/posts/${post.slug}`}>{post.title}</Link>
							<span> by {post.author}</span>
						</li>
					)}
				</For>
			</ul>
		</main>
	));
