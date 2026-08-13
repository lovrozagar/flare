import { For } from "solid-js"
import type { Metadata } from "next"
import Link from "next/link"
import { posts } from "../../shared/data"

export const metadata: Metadata = {
	title: "Blog Posts",
}

export default function HomePage() {
	return (
		<main>
			<h1>Blog Posts</h1>
			<ul>
				<For each={posts}>
					{(post) => (
						<li>
							<Link href={`/posts/${post.slug}`}>{post.title}</Link>
							<span> by {post.author}</span>
						</li>
					)}
				</For>
			</ul>
		</main>
	)
}
