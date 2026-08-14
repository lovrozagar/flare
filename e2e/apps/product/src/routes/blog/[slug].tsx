import { Await } from "flare/await"
import { createPage } from "flare/page"
import { For } from "solid-js"

interface Comment {
	author: string
	text: string
}

export const route = createPage("_root_/(blog)/blog/[slug]")
	.loader((ctx) => {
		const slug = ctx.location.params.slug
		const comments = ctx.defer<Comment[]>(async () => {
			await new Promise((r) => setTimeout(r, 80))
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
	.render((props) => (
		<main data-testid="blog-post">
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
		</main>
	))
