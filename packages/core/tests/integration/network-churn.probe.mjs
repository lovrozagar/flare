// Runs inside a throwaway container for network-churn.test.ts: a loopback server serves a page of 300 slow modules, and
// each engine named in ENGINES loads it ROUNDS times. Prints `PROBE <engine> <ok> <failed> <changed>`, the last whether
// a load failed with ERR_NETWORK_CHANGED.
import { createServer } from "node:http"
import { createRequire } from "node:module"

const pw = createRequire(import.meta.url)("/playwright-core")
const rounds = Number(process.env.ROUNDS ?? 3)
const imports = Array.from({ length: 300 }, (_, i) => `import "/m/${i}.js"`).join("\n")
const page = `<!doctype html><title>p</title><script type="module">${imports}\nwindow.__done = true</script>`
const server = createServer((req, res) => {
	if (new URL(req.url ?? "/", "http://x").pathname === "/")
		return res.writeHead(200, { "content-type": "text/html" }).end(page)
	setTimeout(() => res.writeHead(200, { "content-type": "text/javascript" }).end("export {}"), Math.random() * 60)
})
await new Promise((resolve) => server.listen(8080, "127.0.0.1", resolve))
for (const name of (process.env.ENGINES ?? "").split(",")) {
	const browser = await pw[name].launch()
	let ok = 0
	let changed = false
	for (let round = 0; round < rounds; round += 1) {
		const context = await browser.newContext()
		const tab = await context.newPage()
		tab.on("requestfailed", (request) => {
			if (request.failure()?.errorText === "net::ERR_NETWORK_CHANGED") changed = true
		})
		try {
			await tab.goto(`http://127.0.0.1:8080/?r=${round}`)
			await tab.waitForFunction(() => window.__done === true, undefined, { timeout: 30_000 })
			ok += 1
		} catch {}
		await context.close()
	}
	await browser.close()
	console.log(`PROBE ${name} ${ok} ${rounds - ok} ${changed}`)
}
server.close()
