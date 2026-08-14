import { createLayout } from "flare/layout"
import { Link } from "flare/link"

export const route = createLayout("_root_/(dashboard)")
	.loader(() => ({
		layoutLabel: "dashboard",
	}))
	.headers(() => ({
		"x-dashboard-layout": "true",
	}))
	.render((props) => (
		<div data-testid="dashboard-layout">
			<header data-testid="dashboard-header">
				<span data-testid="layout-label">{props.loaderData.layoutLabel}</span>
				<nav>
					<Link to="/dashboard">Overview</Link>
					<Link to="/dashboard/settings">Settings</Link>
				</nav>
			</header>
			<main data-testid="dashboard-main">{props.children}</main>
		</div>
	))
