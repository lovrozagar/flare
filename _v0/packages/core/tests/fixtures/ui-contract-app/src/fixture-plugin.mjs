/* A minimal Tailwind v4 plugin: proves `@plugin` loads during the app build. */
export default function fixturePlugin({ addUtilities }) {
	addUtilities({ ".fixture-contract": { color: "#0c0ffe" } });
}
