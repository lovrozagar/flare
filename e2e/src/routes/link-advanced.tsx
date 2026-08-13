import { createPage } from "flare/page"
import { Link } from "flare/link"

export const route = createPage("_root_/link-advanced")
	.loader(() => ({
		timestamp: Date.now(),
	}))
	.render((props) => (
		<div data-testid="link-advanced">
			<p data-testid="link-advanced-ts">{props.loaderData.timestamp}</p>

			<Link to="/about" replace data-testid="link-replace">
				Replace Nav
			</Link>
			<Link hash="target-section" to="/link-advanced" data-testid="link-hash">
				Hash Nav
			</Link>
			<Link to="/link-advanced" force data-testid="link-force">
				Force Refresh
			</Link>
			<Link
				to="/link-advanced"
				activeClass="is-active"
				inactiveClass="is-inactive"
				data-testid="link-active-self"
			>
				Self Active
			</Link>
			<Link
				to="/about"
				activeClass="is-active"
				inactiveClass="is-inactive"
				data-testid="link-active-other"
			>
				Other Page
			</Link>
			<Link to="/about" shallow data-testid="link-shallow">
				Shallow Nav
			</Link>
			<Link to="/about" disabled data-testid="link-disabled">
				Disabled Link
			</Link>

			<div id="target-section" data-testid="target-section" style={{ "margin-top": "20px" }}>
				<p>Target section for hash navigation</p>
			</div>
		</div>
	))
