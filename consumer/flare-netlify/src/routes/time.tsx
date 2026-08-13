import { createPage } from "flare/page"

export const route = createPage("_root_/time")
	.loader(() => {
		const epoch = new Date(0)
		const known = new Date("2024-06-15T12:30:00Z")
		const formatter = new Intl.DateTimeFormat("en-US", {
			day: "numeric",
			month: "short",
			timeZone: "UTC",
			year: "numeric",
		})

		return {
			epochIso: epoch.toISOString(),
			epochMs: epoch.getTime(),
			formatted: formatter.format(known),
			knownMs: known.getTime(),
			nowType: typeof Date.now(),
			parsedEpoch: Date.parse("1970-01-01T00:00:00.000Z"),
			platform: "Netlify",
			utcString: epoch.toUTCString(),
		}
	})
	.render((props) => (
		<div>
			<h1 data-testid="time-heading">Time — Netlify</h1>
			<dl>
				<dt>Epoch ISO</dt>
				<dd data-testid="time-epoch-iso">{props.loaderData.epochIso}</dd>
				<dt>Epoch ms</dt>
				<dd data-testid="time-epoch-ms">{String(props.loaderData.epochMs)}</dd>
				<dt>UTC String</dt>
				<dd data-testid="time-utc">{props.loaderData.utcString}</dd>
				<dt>Parsed Epoch</dt>
				<dd data-testid="time-parsed">{String(props.loaderData.parsedEpoch)}</dd>
				<dt>Known ms</dt>
				<dd data-testid="time-known-ms">{String(props.loaderData.knownMs)}</dd>
				<dt>Intl Formatted</dt>
				<dd data-testid="time-formatted">{props.loaderData.formatted}</dd>
				<dt>Now Type</dt>
				<dd data-testid="time-now-type">{props.loaderData.nowType}</dd>
			</dl>
			<nav>
				<a href="/">Home</a>
			</nav>
		</div>
	))
