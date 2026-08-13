import { createPage } from "flare/page"

export const route = createPage("_root_/json-edge")
	.loader(() => {
		const data = {
			emoji: "Hello 🌍🔥",
			escapedQuotes: 'She said "hello"',
			isoDate: new Date(0).toISOString(),
			maxSafe: Number.MAX_SAFE_INTEGER,
			nested: { deep: { value: 42 } },
			newlines: "line1\nline2\ttab",
			nullValue: null as null,
			platform: "CF Durable",
			unicode: "\u00e9\u00e8\u00ea\u00eb",
			zero: 0,
		}
		/* Round-trip: serialize then parse to verify consistency */
		const serialized = JSON.stringify(data)
		const parsed = JSON.parse(serialized) as typeof data
		const roundTripMatch =
			parsed.maxSafe === data.maxSafe &&
			parsed.emoji === data.emoji &&
			parsed.nullValue === null &&
			parsed.zero === 0 &&
			parsed.nested.deep.value === 42
		return { ...data, roundTripMatch, serializedLength: serialized.length }
	})
	.render((props) => (
		<div>
			<h1 data-testid="json-heading">JSON Edge — CF Durable</h1>
			<dl>
				<dt>Emoji</dt>
				<dd data-testid="json-emoji">{props.loaderData.emoji}</dd>
				<dt>Max Safe Int</dt>
				<dd data-testid="json-max-safe">{String(props.loaderData.maxSafe)}</dd>
				<dt>ISO Date</dt>
				<dd data-testid="json-date">{props.loaderData.isoDate}</dd>
				<dt>Unicode</dt>
				<dd data-testid="json-unicode">{props.loaderData.unicode}</dd>
				<dt>Null Value</dt>
				<dd data-testid="json-null">{String(props.loaderData.nullValue)}</dd>
				<dt>Escaped</dt>
				<dd data-testid="json-escaped">{props.loaderData.escapedQuotes}</dd>
				<dt>Newlines</dt>
				<dd data-testid="json-newlines">{props.loaderData.newlines}</dd>
				<dt>Nested</dt>
				<dd data-testid="json-nested">{String(props.loaderData.nested.deep.value)}</dd>
				<dt>Round-trip</dt>
				<dd data-testid="json-match">{String(props.loaderData.roundTripMatch)}</dd>
				<dt>Serialized Length</dt>
				<dd data-testid="json-length">{String(props.loaderData.serializedLength)}</dd>
			</dl>
			<nav>
				<a href="/">Home</a>
			</nav>
		</div>
	))
