// The cross-runtime parity run's comparison (docs-parity.test.ts, plan 21 17.1): each runtime's answers to the same
// probes, masked of what differs per request or per build, set against Node's, one line per probe and runtime that
// differs, naming where.

// A nonce, a render time, a query's fetch time, and a build id are the request's or the build's own (the Workers
// build is another build), and the docs app's serverContext gives each request an eight-hex id and names its runtime.
// seroval's helpers, which it writes as its own functions' source text (`$R[3]=() => {…}`, `$R[7]=(resolver, data) =>
// {…}`): Bun reprints a module it loads and the Workers bundle is minified, so the same helper reads three ways. Each
// body is masked to its closing brace.
const HELPER = /\$R\[\d+\]=\((?:\w+(?:,\s*\w+)*)?\)\s*=>\s*\{/g

function maskedHelpers(text: string): string {
	let out = ""
	let from = 0
	for (const match of text.matchAll(HELPER)) {
		if (match.index < from) continue
		let depth = 0
		let end = match.index + match[0].length - 1
		do {
			if (text[end] === "{") depth++
			else if (text[end] === "}") depth--
			end++
		} while (depth > 0 && end < text.length)
		out += `${text.slice(from, match.index)}$R[<n>]=<helper>`
		from = end
	}
	return out + text.slice(from)
}

export function masked(text: string): string {
	return maskedHelpers(text)
		.replaceAll(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, "<date>")
		.replaceAll(/[0-9a-f]{32}/g, "<nonce>")
		.replaceAll(/"build":"[0-9a-f]+"/g, '"build":"<build>"')
		.replaceAll(/\b1\d{12}\b/g, "<time>")
		.replaceAll(/\b[0-9a-f]{8}\b/g, "<id>")
		.replaceAll(/\b(?:node|bun|workers)\b/g, "<runtime>")
		.replaceAll(/"at":\d+/g, '"at":<at>')
		.replaceAll(/flare-build[^,;]*/g, "flare-build")
}

// Where two answers part: the character, and the text around it on both sides.
export function firstDifference(left: string, right: string): string {
	let at = 0
	while (at < left.length && left[at] === right[at]) at++
	const around = (text: string) => JSON.stringify(text.slice(Math.max(0, at - 60), at + 60))
	return `part at ${at}: ${around(left)} vs ${around(right)}`
}

// The docs app's render stamp: a page whose loaders run per render prints the request id of the render its data came
// from (`renderedBy`), and its data answer carries the same id as a wire string.
const STAMP = /(?:api|changelog)-rendered-by">([0-9a-f]{8})</
const CACHE = /^flare-cache: (?:hit|miss)$/m
const DATA = /[?&]_flare=data$/

// One runtime's answers with the single-flight label settled (dx/cache.md: a miss renders once per key; a request that
// lands during the flight reuses the render and says `miss`, one after the store write reads it and says `hit`). A data
// request sent right after its page's document, when that document missed, reads `joined or stored` if it carries the
// document's render stamp, as either side of the write does; one with a render of its own is a violation, whatever
// the label. Every other answer stays as it was.
function settled(lines: readonly string[], answers: readonly string[]): { answers: string[]; violations: string[] } {
	const violations: string[] = []
	const out = answers.map((answer, index) => {
		const line = lines[index] ?? ""
		const previous = index > 0 ? (answers[index - 1] ?? "") : ""
		if (!DATA.test(line) || lines[index - 1] !== line.replace(DATA, "")) return answer
		const id = /^flare-cache: miss$/m.test(previous) ? STAMP.exec(previous)?.[1] : undefined
		if (id === undefined) return answer
		if (!answer.includes(`"s":"${id}"`)) {
			violations.push(`${line}: <runtime> rendered again after the document's miss (document ${id})`)
			return answer
		}
		return answer.replace(CACHE, "flare-cache: joined or stored")
	})
	return { answers: out, violations }
}

// Each runtime's answers, in probe order, settled and masked, against Node's: a probe whose answer differs is one line
// naming where, and a data request that rendered again after its document's miss is one line on any runtime.
export function differences(lines: readonly string[], answers: Readonly<Record<string, readonly string[]>>): string[] {
	const runs = Object.entries(answers).map(([name, theirs]) => {
		const { answers: out, violations } = settled(lines, theirs)
		return { name, masked: out.map(masked), violations: violations.map((v) => v.replace("<runtime>", name)) }
	})
	const node = runs.find((run) => run.name === "node")?.masked ?? []
	return runs.flatMap((run) => [
		...run.violations,
		...(run.name === "node"
			? []
			: lines.flatMap((line, index) => {
					const n = node[index] ?? ""
					const other = run.masked[index] ?? ""
					return other === n ? [] : [`${line}: node and ${run.name} ${firstDifference(n, other)}`]
				})),
	])
}
