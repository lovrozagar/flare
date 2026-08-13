import { Await, Link, createFileRoute } from "@tanstack/react-router"
import { Suspense, useState } from "react"
import { getPost, headForPost, initialLikes } from "../../../shared/data"
import { fetchComments } from "../server-fns"

function LikeButton(props: { initial: number }) {
	const [count, setCount] = useState(props.initial)
	return (
		<button data-testid="like-button" onClick={() => setCount((c) => c + 1)} type="button">
			Like ({count})
		</button>
	)
}

export const Route = createFileRoute("/posts/$slug")({
	component: PostPage,
	head: ({ loaderData }) => {
		const h = headForPost(loaderData.post)
		return {
			meta: [
				{ title: h.title },
				{ content: h.description, name: "description" },
				{ content: h.openGraph.title, property: "og:title" },
				{ content: h.openGraph.description, property: "og:description" },
				{ content: h.openGraph.type, property: "og:type" },
			],
		}
	},
	loader: async ({ params }) => {
		const post = getPost(params.slug)
		if (!post) throw new Error(`Post not found: ${params.slug}`)
		return {
			comments: fetchComments({ data: params.slug }),
			likes: initialLikes[params.slug] ?? 0,
			post,
		}
	},
})

function PostPage() {
	const { post, comments, likes } = Route.useLoaderData()

	return (
		<article>
			<h1>{post.title}</h1>
			<p>By {post.author}</p>
			<LikeButton initial={likes} />
			<div>{post.body}</div>

			<h2>Comments</h2>
			<Suspense fallback={<p>Loading comments...</p>}>
				<Await promise={comments}>
					{(resolvedComments) => (
						<ul>
							{resolvedComments.map((c, i) => (
								<li>
									<strong>{c.author}</strong> ({c.date}): {c.text}
								</li>
							))}
						</ul>
					)}
				</Await>
			</Suspense>

			<p>
				<Link to="/">Back to posts</Link>
			</p>
		</article>
	)
}
