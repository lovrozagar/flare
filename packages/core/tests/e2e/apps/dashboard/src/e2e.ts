// The e2e-only controls answer only under the e2e boot, which sets FLARE_E2E=1 in the env the server sees: the process
// env the Node and Bun adapters pass, and the worker's env on Workers (dx/adapters.md, BUGS.md 372).
export function e2eOnly(env: unknown): void {
	if (Reflect.get(Object(env), "FLARE_E2E") === "1") return
	throw new Error("e2e controls are off")
}
