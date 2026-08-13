import { For } from "solid-js"
import { Link, createFileRoute } from "@tanstack/react-router"
import { posts } from "../../../shared/data"

export const Route = createFileRoute("/")({
	component: HomePage,
	head: () => ({
		meta: [{ title: "Blog Posts" }],
	}),
})

function HomePage() {
	return (
		<main>
			<h1>Blog Posts</h1>
			<ul>
				<For each={posts}>
					{(post) => (
						<li>
							<Link to="/posts/$slug" params={{ slug: post.slug }}>
								{post.title}
							</Link>
							<span> by {post.author}</span>
						</li>
					)}
				</For>
			</ul>
		</main>
	)
}
