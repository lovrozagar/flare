// The kinds of branch message the formatter knows (dx/features.md i18n).
export type BranchKind = "plural" | "selectordinal" | "select"

export type BranchInput = {
	kind: BranchKind
	value: number | string
	tag: string
	branches: ReadonlySet<string>
}

// The branch a value picks. An exact `=N` branch wins over the category. A plural takes its category from
// `Intl.PluralRules` for the tag, cardinal or ordinal, and a select takes the branch named by the value. A branch the
// message does not list is `other`, which every branch message has.
export function branchFor(input: BranchInput): string {
	const exact = `=${String(input.value)}`
	if (input.kind !== "select" && input.branches.has(exact)) return exact
	const key =
		input.kind === "select"
			? String(input.value)
			: new Intl.PluralRules(input.tag, { type: input.kind === "plural" ? "cardinal" : "ordinal" }).select(
					Number(input.value),
				)
	return input.branches.has(key) ? key : "other"
}
