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
			parsedEpoch: Date.parse("1970-01-01T00:00:00.000Z"),
		}
	})
	.render((props) => (
		<main data-testid="time">
			<p data-testid="time-epoch-iso">{props.loaderData.epochIso}</p>
			<p data-testid="time-epoch-ms">{String(props.loaderData.epochMs)}</p>
			<p data-testid="time-formatted">{props.loaderData.formatted}</p>
			<p data-testid="time-parsed">{String(props.loaderData.parsedEpoch)}</p>
		</main>
	))
