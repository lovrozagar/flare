export type Duration = number | `${number}${"d" | "h" | "m" | "s"}`;

const UNITS: Record<string, number> = { d: 86400, h: 3600, m: 60, s: 1 };
const DURATION_RE = /^(\d+)(s|m|h|d)$/;

export function parseSeconds(value: Duration): number {
	if (typeof value === "number") return value;
	const match = value.match(DURATION_RE);
	if (!match || !match[1] || !match[2]) throw new Error(`Invalid duration: ${value}`);
	const unit = UNITS[match[2]];
	if (unit === undefined) throw new Error(`Invalid duration: ${value}`);
	return Number(match[1]) * unit;
}

export function parseMilliseconds(value: Duration): number {
	if (typeof value === "number") return value;
	return parseSeconds(value) * 1000;
}
