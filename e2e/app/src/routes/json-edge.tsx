import { createPage } from "flare/page"

export const route = createPage("_root_/json-edge")
	.loader(() => {
		const data = {
			emoji: "Hello 🌍🔥",
			escapedQuotes: 'She said "hello"',
			maxSafe: Number.MAX_SAFE_INTEGER,
			nested: { deep: { value: 42 } },
			nullValue: null as null,
			unicode: "\u00e9\u00e8\u00ea\u00eb",
			zero: 0,
		}
		const parsed = JSON.parse(JSON.stringify(data)) as typeof data
		return {
			...data,
			roundTripMatch:
				parsed.maxSafe === data.maxSafe &&
				parsed.emoji === data.emoji &&
				parsed.nullValue === null &&
				parsed.nested.deep.value === 42,
		}
	})
	.render((props) => (
		<main data-testid="json-edge">
			<p data-testid="json-emoji">{props.loaderData.emoji}</p>
			<p data-testid="json-max-safe">{String(props.loaderData.maxSafe)}</p>
			<p data-testid="json-null">{String(props.loaderData.nullValue)}</p>
			<p data-testid="json-nested">{String(props.loaderData.nested.deep.value)}</p>
			<p data-testid="json-match">{String(props.loaderData.roundTripMatch)}</p>
		</main>
	))
