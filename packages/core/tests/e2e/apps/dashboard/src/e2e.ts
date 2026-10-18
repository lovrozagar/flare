// The e2e-only controls answer only under the e2e boot, which sets FLARE_E2E=1: in the process env of the Node and Bun
// servers, and in the worker's env on Workers.
export function e2eOnly(env: unknown): void {
	if (Reflect.get(Object(env), "FLARE_E2E") === "1") return
	if (typeof process !== "undefined" && process.env["FLARE_E2E"] === "1") return
	throw new Error("e2e controls are off")
}
