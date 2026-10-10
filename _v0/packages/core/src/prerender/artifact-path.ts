/** File stem of a prerendered page: `/` → `/index`, `/a/b` → `/a/b`. Runtime-safe (no node:*). */
export function artifactBase(pathname: string): string {
	return pathname === "/" ? "/index" : pathname;
}
