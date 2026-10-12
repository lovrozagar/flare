// A value an invariant guarantees, such as the page of a non-empty match chain. `noUncheckedIndexedAccess` types an
// index read as possibly undefined. A broken invariant is a bug, so it throws and names what was missing.
export function defined<T>(value: T | undefined, what: string): T {
	if (value === undefined) throw new Error(`Flare invariant: ${what} is missing`);
	return value;
}
