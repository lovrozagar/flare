import { decodeLine, type Frame } from "../shared/protocol/index.ts"
import { matchFromWire } from "../shared/protocol/value.ts"

// A data answer's frames, decoded as the client reads them (B145).
export function framesIn(text: string): Frame[] {
	return text
		.split("\n")
		.filter((line) => line !== "")
		.map((line) => decodeLine(line))
}

// The document state's matches, each match's data and preloader context decoded as the client reads them (B145).
export function stateIn(html: string): Array<Record<string, unknown>> {
	const payload = /self\.flare=(.*?)<\/script>/.exec(html)?.[1]
	if (payload === undefined) throw new Error("state script")
	const matches: Array<Record<string, unknown>> = JSON.parse(payload).matches
	return matches.map(matchFromWire)
}
