import { assetUrl, type Urls } from "../plugin/environments.ts"

// A client bundle's output, as far as the stylesheet needs it: Rollup's assets carry their source, chunks do not.
type Output = { type: "asset"; fileName: string; source: string | Uint8Array } | { type: "chunk"; fileName: string }

export type BuiltStylesheet = { fileName: string; href: string; source: string }

const decoder = new TextDecoder()

// The client build's one stylesheet, its URL from the one resolver (`assetUrl`), and its text. A bundle with no
// CSS has none. Two stylesheets break the contract flare() sets with `cssCodeSplit: false`, so they throw.
export function stylesheetOf(bundle: Readonly<Record<string, Output>>, urls: Urls): BuiltStylesheet | undefined {
	const sheets = Object.values(bundle).flatMap((output) =>
		output.type === "asset" && output.fileName.endsWith(".css") ? [output] : [],
	)
	if (sheets.length > 1) {
		throw new Error(
			`One stylesheet is the contract, and the client build wrote ${sheets.map((sheet) => sheet.fileName).join(", ")}`,
		)
	}
	const sheet = sheets[0]
	if (sheet === undefined) return undefined
	const source = typeof sheet.source === "string" ? sheet.source : decoder.decode(sheet.source)
	return { fileName: sheet.fileName, href: assetUrl(sheet.fileName, urls), source }
}
