import { createLayout } from "flare/layout"

export const route = createLayout("_root_/(dashboard)")
	.loader((ctx) => {
		const ua = ctx.request.headers.get("user-agent") ?? "unknown"
		return {
			layoutPlatform: "Standard",
			layoutTimestamp: Date.now(),
			userAgentShort: ua.slice(0, 30),
		}
	})
	.headers(() => ({
		"x-dashboard-layout": "true",
		"x-platform": "Standard",
	}))
	.render((props) => (
		<div data-testid="dashboard-layout">
			<header data-testid="dashboard-header">
				<span data-testid="layout-platform">{props.loaderData.layoutPlatform}</span>
				<span data-testid="layout-ts">{String(props.loaderData.layoutTimestamp)}</span>
				<nav>
					<a href="/dashboard">Overview</a>
					<a href="/dashboard/settings">Settings</a>
				</nav>
			</header>
			<main data-testid="dashboard-main">{props.children}</main>
		</div>
	))
