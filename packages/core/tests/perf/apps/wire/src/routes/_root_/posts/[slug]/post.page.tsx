import { createSignal, For, Loading } from "solid-js"
import { createPage, Link, notFound, useDeferred } from "@lovrozagar/flare"
import { getDelayedComments, getPost, headForPost, initialLikes } from "../../../../data.ts"

function LikeButton(props: { initial: number }) {
	const [count, setCount] = createSignal(props.initial)
	return (
		<button data-testid="like-button" onClick={() => setCount((c) => c + 1)} type="button">
			Like ({count()})
		</button>
	)
}

export const route = createPage("_root_/posts/[slug]")
	.loader(({ params, defer }) => {
		const post = getPost(params.slug)
		if (!post) throw notFound()
		return { comments: defer(() => getDelayedComments(params.slug)), likes: initialLikes[params.slug] ?? 0, post }
	})
	.head((ctx) => {
		const h = headForPost(ctx.loaderData.post)
		return {
			description: h.description,
			openGraph: { description: h.openGraph.description, title: h.openGraph.title, type: "article" },
			title: h.title,
		}
	})
	.render((props) => {
		const comments = useDeferred(() => props.loaderData.comments)
		return (
			<article>
				<h1>{props.loaderData.post.title}</h1>
				<p>By {props.loaderData.post.author}</p>
				<LikeButton initial={props.loaderData.likes} />
				<div>{props.loaderData.post.body}</div>

				<h2>Comments</h2>
				<Loading fallback={<p>Loading comments...</p>}>
					<ul>
						<For each={comments()}>
							{(c) => (
								<li>
									<strong>{c.author}</strong> ({c.date}): {c.text}
								</li>
							)}
						</For>
					</ul>
				</Loading>

				<p>
					<Link to="_root_/">Back to posts</Link>
				</p>
			</article>
		)
	})
