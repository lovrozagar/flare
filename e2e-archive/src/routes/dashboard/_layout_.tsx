import { createLayout } from "flare/layout"
import { Link } from "flare/link"

export const route = createLayout("_root_/(dashboard)")
	.authenticate()
	.render((props) => (
		<div data-testid="dashboard-layout">
			<header data-testid="dashboard-header">
				<h2>Dashboard</h2>
				<nav>
					<Link to="/dashboard">Home</Link>
					<Link to="/dashboard/settings">Settings</Link>
				</nav>
			</header>
			<main>{props.children}</main>
		</div>
	))
	.unauthorizedRender(() => (
		<div data-testid="unauthorized">
			<h1>401 Unauthorized</h1>
			<p>Please sign in to access the dashboard.</p>
			<Link to="/">Go Home</Link>
		</div>
	))
