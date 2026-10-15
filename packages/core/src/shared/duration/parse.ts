const SCALE: Record<string, number> = {
	ms: 1,
	s: 1_000,
	m: 60_000,
	h: 3_600_000,
	d: 86_400_000,
}

export function parseDuration(value: string): number {
	if (value === "") throw new Error("duration")
	let rest = value
	let total = 0
	while (rest !== "") {
		const matched = /^(\d+)(ms|d|h|m|s)/.exec(rest)
		if (matched === null) throw new Error("duration")
		const amount = matched[1] as string
		const unit = matched[2] as string
		total += Number(amount) * (SCALE[unit] as number)
		rest = rest.slice(matched[0].length)
	}
	return total
}
