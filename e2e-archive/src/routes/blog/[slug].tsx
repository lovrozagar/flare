import { For } from "solid-js"
import { createPage } from "flare/page"
import { Await } from "flare/await"
import { useRouter } from "flare/router"

interface Comment {
	author: string
	text: string
}

export const route = createPage("_root_/(blog)/blog/[slug]")
	.loader((ctx) => {
		const slug = ctx.location.params.slug
		const comments = ctx.defer<Comment[]>(async () => {
			await new Promise((r) => setTimeout(r, 500))
			return [
				{ author: "Alice", text: `Comment on ${slug}` },
				{ author: "Bob", text: "Great post" },
			]
		})
		return {
			comments,
			slug,
			title: `Post: ${slug}`,
		}
	})
	.head((ctx) => ({
		title: ctx.loaderData.title,
	}))
	.render((props) => {
		const r = useRouter()
		const params = r.useParams({ from: "_root_/(blog)/blog/[slug]" })
		const search = r.useSearch({ from: "_root_/(blog)/blog/[slug]" })

		return (
			<article data-testid="blog-post">
				<h1 data-testid="post-title">{props.loaderData.title}</h1>
				<p data-testid="post-slug">{props.loaderData.slug}</p>
				<section data-testid="comments-section">
					<Await
						pending={<div data-testid="comments-pending">Loading comments...</div>}
						promise={props.loaderData.comments}
					>
						{(comments) => (
							<ul data-testid="comments-resolved">
								<For each={comments}>
									{(c) => (
										<li>
											{c.author}: {c.text}
										</li>
									)}
								</For>
							</ul>
						)}
					</Await>
				</section>
			</article>
		)
	})
