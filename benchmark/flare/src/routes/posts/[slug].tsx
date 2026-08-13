import { createPage } from "flare"
import { Await } from "flare/await"
import { Link } from "flare/link"
import { createSignal, For } from "solid-js"
import type { Comment } from "../../../../shared/data"
import { getDelayedComments, getPost, headForPost, initialLikes } from "../../../../shared/data"

function LikeButton(props: { initial: number }) {
	const [count, setCount] = createSignal(props.initial)
	return (
		<button data-testid="like-button" onClick={() => setCount((c) => c + 1)} type="button">
			Like ({count()})
		</button>
	)
}

export const route = createPage("_root_/posts/[slug]")
	.loader((ctx) => {
		const slug = ctx.location.params.slug
		const post = getPost(slug)
		if (!post) throw new Error(`Post not found: ${slug}`)

		const comments = ctx.defer<Comment[]>(async () => {
			return getDelayedComments(slug)
		})

		return { comments, likes: initialLikes[slug] ?? 0, post }
	})
	.head((ctx) => {
		const h = headForPost(ctx.loaderData.post)
		return {
			description: h.description,
			openGraph: {
				description: h.openGraph.description,
				title: h.openGraph.title,
				type: h.openGraph.type,
			},
			title: h.title,
		}
	})
	.render((props) => (
		<article>
			<h1>{props.loaderData.post.title}</h1>
			<p>By {props.loaderData.post.author}</p>
			<LikeButton initial={props.loaderData.likes} />
			<div>{props.loaderData.post.body}</div>

			<h2>Comments</h2>
			<Await promise={props.loaderData.comments} pending={<p>Loading comments...</p>}>
				{(comments) => (
					<ul>
						<For each={comments}>
							{(c) => (
								<li>
									<strong>{c.author}</strong> ({c.date}): {c.text}
								</li>
							)}
						</For>
					</ul>
				)}
			</Await>

			<p>
				<Link to="/">Back to posts</Link>
			</p>
		</article>
	))
