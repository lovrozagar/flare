// The Workers entry the Wrangler config's `main` names under the Cloudflare plugin (B109). Inside Vite, flare()
// resolves this specifier to the app's server behind the Workers adapter before this file is reached, so anything that
// loads it ran outside Vite. The worker is a binding the package entry re-exports, so the package's
// `sideEffects: false` cannot let a build drop this module.
function outsideVite(): never {
	throw new Error(
		"@lovrozagar/flare/worker is the Wrangler main for the Cloudflare plugin: it runs only inside Vite with flare()",
	)
}

const worker: never = outsideVite()

export default worker
