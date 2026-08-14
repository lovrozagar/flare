import { Await } from "flare/await"
import { Link } from "flare/link"
import { createPage } from "flare/page"

export const route = createPage("_root_/a11y-nav-test")
	.loader((ctx) => {
		const deferred = ctx.defer<string>(async () => {
			await new Promise((r) => setTimeout(r, 300))
			return "Async content loaded"
		})
		return {
			deferred,
			items: ["Dashboard", "Settings", "Profile"],
			title: "Navigation A11y Test",
		}
	})
	.head(() => ({
		description: "Tests accessibility during SPA navigation and async content loading",
		title: "A11y Nav Test",
	}))
	.render((props) => (
		<main data-testid="a11y-nav-page">
			<h1>{props.loaderData.title}</h1>

			<nav aria-label="Test navigation" data-testid="test-nav">
				<ul>
					<li>
						<Link data-testid="nav-home" to="/">
							Home
						</Link>
					</li>
					<li>
						<Link data-testid="nav-about" to="/about">
							About
						</Link>
					</li>
					<li>
						<Link data-testid="nav-a11y" to="/a11y-test">
							A11y Test
						</Link>
					</li>
					<li>
						<Link data-testid="nav-slow" to="/slow">
							Slow Page
						</Link>
					</li>
				</ul>
			</nav>

			<section aria-labelledby="async-heading" data-testid="async-section">
				<h2 id="async-heading">Async Content</h2>
				<Await
					pending={
						<output aria-busy="true" data-testid="async-pending">
							Loading content...
						</output>
					}
					promise={props.loaderData.deferred}
				>
					{(val) => (
						<output aria-busy="false" data-testid="async-resolved">
							{val}
						</output>
					)}
				</Await>
			</section>

			<section data-testid="table-section">
				<h2 id="table-heading">Data Table</h2>
				<table aria-labelledby="table-heading" data-testid="a11y-table">
					<caption>Navigation items for testing</caption>
					<thead>
						<tr>
							<th scope="col">Item</th>
							<th scope="col">Index</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>{(props.loaderData.items as string[])[0]}</td>
							<td>0</td>
						</tr>
						<tr>
							<td>{(props.loaderData.items as string[])[1]}</td>
							<td>1</td>
						</tr>
						<tr>
							<td>{(props.loaderData.items as string[])[2]}</td>
							<td>2</td>
						</tr>
					</tbody>
				</table>
			</section>
		</main>
	))
