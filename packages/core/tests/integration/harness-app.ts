import type { Api } from "./hydrate.harness.ts"

// An app for the hydrate harness's app mode, from its source text: the body of a function of `api` that returns
// `{ router }`. The harness compiles an app into the server and the browser from its source, so the pages a test file
// shares are source too, and each app is that source plus its own router options (hydrate.app.ts).
export function appFrom(source: string): (api: Api) => { router: unknown } {
	// oxlint-disable-next-line no-new-func -- the harness compiles an app from its source text, so the shared pages are source
	return new Function("api", source) as (api: Api) => { router: unknown }
}
