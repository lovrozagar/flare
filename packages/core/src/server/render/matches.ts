import { defined } from "../../shared/errors/index.ts"
import type { OutletMatch } from "../../shared/components/index.ts"
import type { RawParams } from "../../shared/route-tree/index.ts"
import type { LoadedEntry } from "../../shared/router/create-router.ts"
import type { LoaderRun } from "../loaders/run.ts"
import type { Projected } from "./projector.ts"
import type { StateMatch } from "./state.ts"
import { isReplacing } from "../../shared/head/index.ts"
import type { HeadConfig } from "../../shared/route-builder/types.ts"

// One rendered document: the chain, its loader run, and what fills the slot below the kept matches. `failed`
// is the projected root-most failure. `unknown` is an unknown URL, painted with its not-found (B77).
export type Rendered = {
	chain: readonly LoadedEntry[]
	run: LoaderRun
	failed?: Projected
	unknown?: true
}

// The kept matches, then the failed match, root down. Each sees the page's params and search after its own
// `.input()`.
export function outletMatches(rendered: Rendered): OutletMatch[] {
	const count = rendered.run.data.length + (rendered.failed === undefined ? 0 : 1)
	return rendered.chain.slice(0, count).map((entry, index) => ({
		id: entry.id,
		kind: entry.kind,
		module: entry.module,
		...pick(defined(rendered.run.inputs[index], "the match's input")),
		data: rendered.run.data[index],
		preloader: rendered.run.contexts[index] ?? {},
	}))
}

// One entry per painted match in the B83 shape. The failed match carries the projected error and no data.
export function stateMatches(matches: readonly OutletMatch[], rendered: Rendered): StateMatch[] {
	const run = rendered.run
	const failure = rendered.failed?.wire ?? null
	return matches.map((match, index) => ({
		id: match.id,
		params: match.params,
		search: match.search,
		data: match.data ?? null,
		preloader: run.contexts[index] ?? null,
		head: run.heads[index] ?? null,
		error: index < run.data.length ? null : failure,
		...(replaces(run.heads[index]) && { replace: true as const }),
	}))
}

function replaces(head: HeadConfig | undefined): boolean {
	return head !== undefined && isReplacing(head)
}

// An absent optional param is left out.
export function definedParams(params: RawParams): Record<string, string | string[]> {
	return Object.fromEntries(
		Object.entries(params).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]])),
	)
}

function pick(input: { params: unknown; search: unknown }): { params: unknown; search: unknown } {
	return { params: input.params, search: input.search }
}
