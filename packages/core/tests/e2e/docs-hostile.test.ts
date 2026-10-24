import {
	type Answer,
	type Entry,
	invariantProblems,
	request,
	typeClass,
	withEcho,
} from "../black-box/hostile-corpus.ts"
import { mutations, WORKERD_OWN } from "../black-box/fuzz.ts"
import { raw } from "../black-box/raw.ts"
import { replayLine, runFrom } from "../black-box/seeded.ts"
import { expect, fnId, isProd, serverOf, test } from "./docs.fixture.ts"

// Every request of the corpus, raw, against the production server of each runtime: the status the corpus names for it,
// no answer that breaks an invariant (hostile-corpus.ts), and the server still answering a plain GET after each.
test("hostile corpus", async ({ docs }, info) => {
	test.skip(!isProd(info) || info.project.name.split("-")[2] !== "chromium", "once per server")
	const runtime = serverOf(info)
	const host = new URL(docs.origin).host
	const answered: Array<[string, number | string]> = []
	const broken: Array<[string, string[]]> = []
	const types: Array<[string, string]> = []
	for (const entry of withEcho(fnId("src/fns/echo.ts", "echo"))) {
		const answer = await raw(docs.origin, request(entry, host)).catch((error: unknown) => String(error))
		if (typeof answer === "string") {
			answered.push([entry.name, answer])
			continue
		}
		answered.push([entry.name, answer.status])
		types.push([entry.name, typeClass(answer.head)])
		const problems = invariantProblems(answer, { prod: true })
		if (problems.length > 0) broken.push([entry.name, problems])
		const after = await raw(docs.origin, request({ name: "after", path: "/", status: 200, type: "html" }, host)).catch(
			String,
		)
		if (typeof after === "string" || after.status !== 200) broken.push([entry.name, ["server down after it"]])
	}
	if (process.env["FLARE_HOSTILE_OBSERVE"] === "1") console.log(`HOSTILE-TYPES ${runtime} ${JSON.stringify(types)}`)
	// One comparison, so a failure shows every way the answers went wrong at once, a leaked stack beside its new type.
	const corpus = withEcho("")
	expect({ answered, types, broken }).toEqual({
		answered: corpus.map((entry): [string, number] => [entry.name, entry.runtime?.[runtime] ?? entry.status]),
		types: corpus.map((entry): [string, string] => [entry.name, entry.type]),
		broken: [],
	})
})

// The long form (plan 21 17.1, the nightly): seeded mutations of the corpus, 2000 per runtime, held to the corpus's
// invariants rather than a status: no 5xx the corpus does not name, nothing an answer must never show, and the server
// still answering after each. workerd answers some mutations itself, before the worker runs (fuzz.ts WORKERD_OWN,
// BUGS.md 487). Twenty minutes per runtime at most: a hang fails the run.
const FUZZ = runFrom(process.env, { name: "HOSTILE", seed: 20_261_022, steps: 0, longSteps: 2000 })
const FUZZ_CAP = 20 * 60_000

// A mutation's answer: no 5xx but the runtime's own, the entry's or workerd's (fuzz.ts WORKERD_OWN), and the invariants.
function fuzzProblems(entry: Entry, answer: Answer, runtime: string): string[] {
	const own = runtime === "workers-prod" && WORKERD_OWN.test(entry.name)
	const status =
		answer.status >= 500 && answer.status !== entry.runtime?.[runtime] && !own ? [String(answer.status)] : []
	return [...status, ...invariantProblems(answer, { prod: true })]
}

// Why the server does not answer the home page after a mutation, or undefined when it does.
async function downAfter(origin: string, host: string): Promise<string | undefined> {
	const after = await raw(origin, request({ name: "after", path: "/", status: 200, type: "html" }, host)).catch(
		(error: unknown) => String(error),
	)
	if (typeof after === "string") return after
	return after.status === 200 ? undefined : String(after.status)
}

test("hostile fuzz", async ({ docs }, info) => {
	test.skip(FUZZ.steps === 0, "the nightly's long form (FLARE_BLACKBOX_LONG=1 or FLARE_HOSTILE_STEPS)")
	test.skip(!isProd(info) || info.project.name.split("-")[2] !== "chromium", "once per server")
	test.setTimeout(FUZZ_CAP + 60_000)
	const runtime = serverOf(info)
	const host = new URL(docs.origin).host
	const replay = replayLine(FUZZ, {
		name: "HOSTILE",
		command: `bun run test:e2e -- --project=${info.project.name} docs-hostile -g "hostile fuzz"`,
	})
	const deadline = Date.now() + FUZZ_CAP
	const broken: string[] = []
	for (const entry of mutations(withEcho(fnId("src/fns/echo.ts", "echo")), { seed: FUZZ.seed, count: FUZZ.steps })) {
		if (Date.now() > deadline) {
			broken.push(`still running after ${FUZZ_CAP / 60_000} minutes`)
			break
		}
		const answer = await raw(docs.origin, request(entry, host)).catch(() => undefined)
		const problems = answer === undefined ? [] : fuzzProblems(entry, answer, runtime)
		const down = await downAfter(docs.origin, host)
		if (down !== undefined) problems.push(`server down after it (${down})`)
		broken.push(...problems.map((problem) => `${entry.name}: ${problem}`))
		if (broken.length >= 20) break
	}
	expect(broken, replay).toEqual([])
})
