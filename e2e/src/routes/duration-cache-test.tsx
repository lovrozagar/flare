import { createPage } from "flare/page"

export const route = createPage("_root_/duration-cache-test")
	.cache({
		cdn: {
			maxAge: "5m",
			swr: "1m",
		},
		client: { staleTime: "10s" },
	})
	.loader(() => ({
		random: Math.random(),
		timestamp: Date.now(),
	}))
	.render((props) => (
		<div data-testid="duration-cache-test">
			<p data-testid="duration-timestamp">{props.loaderData.timestamp}</p>
			<p data-testid="duration-random">{props.loaderData.random}</p>
		</div>
	))
