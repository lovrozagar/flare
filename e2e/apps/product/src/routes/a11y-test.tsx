import { Link } from "flare/link"
import { createPage } from "flare/page"
import { createSignal, For, Show } from "solid-js"

export const route = createPage("_root_/a11y-test")
	.loader(() => ({
		articles: [
			{
				id: 1,
				summary: "Introduction to web accessibility standards and WCAG guidelines.",
				title: "Getting Started with A11y",
			},
			{
				id: 2,
				summary: "How semantic HTML improves screen reader navigation.",
				title: "Semantic HTML Matters",
			},
			{
				id: 3,
				summary: "Testing keyboard navigation patterns in SPAs.",
				title: "Keyboard Navigation",
			},
		],
		heroAlt: "Decorative abstract pattern used as page banner",
		pageTitle: "Accessibility Test Page",
	}))
	.head(() => ({
		description: "A page designed to test accessibility patterns in Flare",
		title: "A11y Test",
	}))
	.render((props) => {
		const [expanded, setExpanded] = createSignal(false)
		const [notification, setNotification] = createSignal("")

		return (
			<main aria-label="Accessibility test content" data-testid="a11y-page">
				<header data-testid="a11y-header">
					<h1 data-testid="page-heading">{props.loaderData.pageTitle}</h1>
					<nav aria-label="Primary navigation" data-testid="a11y-nav">
						<ul>
							<li>
								<Link to="/">Home</Link>
							</li>
							<li>
								<Link to="/about">About</Link>
							</li>
							<li>
								<Link aria-current="page" to="/a11y-test">
									A11y Test
								</Link>
							</li>
						</ul>
					</nav>
				</header>

				<section data-testid="main-section" id="main-content">
					<label for="a11y-email-field">Email</label>
					<input id="a11y-email-field" name="email" type="email" />
					<h2>Articles</h2>
					<ul aria-label="Article list" data-testid="article-list">
						<For
							each={
								props.loaderData.articles as Array<{ id: number; summary: string; title: string }>
							}
						>
							{(article) => (
								<li data-testid={`article-${article.id}`}>
									<article aria-labelledby={`article-title-${article.id}`}>
										<h3 id={`article-title-${article.id}`}>{article.title}</h3>
										<p>{article.summary}</p>
									</article>
								</li>
							)}
						</For>
					</ul>
				</section>

				<section aria-labelledby="interactive-heading" data-testid="interactive-section">
					<h2 id="interactive-heading">Interactive Elements</h2>

					<button
						aria-controls="expandable-content"
						aria-expanded={expanded()}
						data-testid="toggle-btn"
						onClick={() => {
							setExpanded(!expanded())
							setNotification(expanded() ? "Content expanded" : "Content collapsed")
						}}
						type="button"
					>
						{expanded() ? "Collapse details" : "Expand details"}
					</button>

					<Show when={expanded()}>
						<section data-testid="expandable-content" id="expandable-content">
							<p>This content is revealed when the button is activated.</p>
						</section>
					</Show>

					<output aria-live="polite" data-testid="live-region">
						{notification()}
					</output>
				</section>

				<section aria-labelledby="media-heading" data-testid="media-section">
					<h2 id="media-heading">Media</h2>
					<img
						alt={props.loaderData.heroAlt}
						data-testid="hero-image"
						height="200"
						src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200'%3E%3Crect fill='%23ccc' width='400' height='200'/%3E%3C/svg%3E"
						width="400"
					/>
					<img
						alt=""
						aria-hidden="true"
						data-testid="decorative-image"
						src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3C/svg%3E"
					/>
				</section>

				<footer data-testid="a11y-footer">
					<p>Footer content for accessibility testing</p>
				</footer>
			</main>
		)
	})
