import { createPage } from "flare/page"

export const route = createPage("_root_/chain-final")
	.loader(() => ({
		arrived: true,
		chain: "a → b → final",
	}))
	.render((props) => (
		<div data-testid="chain-final-page">
			<h1>Chain Final</h1>
			<p data-testid="chain-path">{props.loaderData.chain}</p>
			<p data-testid="chain-arrived">{String(props.loaderData.arrived)}</p>
		</div>
	))
