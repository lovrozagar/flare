import { Link } from "@lovrozagar/flare/link";
import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/echo")
	.loader((ctx) => {
		const headers = ctx.request.headers;
		return {
			host: headers.get("host") ?? "none",
			method: ctx.request.method,
			xCustom: headers.get("x-custom-test") ?? "not-set",
		};
	})
	.render((props) => (
		<main data-testid="echo">
			<h1 data-testid="echo-heading">Echo</h1>
			<p data-testid="echo-method">{props.loaderData.method}</p>
			<p data-testid="echo-host">{props.loaderData.host}</p>
			<p data-testid="echo-custom">{props.loaderData.xCustom}</p>
			<nav>
				<Link to="/">Home</Link>
			</nav>
		</main>
	));
