import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import { acquire, type Remote } from "./safari-lock.ts"
import { SafariSession, type Fetcher } from "./safari-driver.ts"
import { configOf, FLOWS, runFlows, tunnel, verifySafari, type Flow } from "./verify-safari.ts"

// The defaults: the Mac at `ssh mac`, its driver on 4799, and this machine at its first Tailscale address.
it("config defaults", () => {
	expect(configOf({}, () => "100.1.2.3\nfd7a::1\n")).toEqual({ ssh: "mac", driverPort: 4799, host: "100.1.2.3" })
	const set = { FLARE_SAFARI_SSH: "air", FLARE_SAFARI_DRIVER_PORT: "4800", FLARE_SAFARI_HOST: "10.0.0.2" }
	expect(configOf(set, () => "")).toEqual({ ssh: "air", driverPort: 4800, host: "10.0.0.2" })
})

// With no address the Mac can reach, the run fails before it starts.
it("no address fails", () => {
	expect(() => configOf({}, () => "")).toThrow("set FLARE_SAFARI_HOST")
})

// A Mac that is not reachable fails the run with what to do; it never skips.
it("unreachable fails", async () => {
	const config = { ssh: "flare-no-such-mac.invalid", driverPort: 4799, host: "10.0.0.2" }
	await expect(tunnel(config, fetch)).rejects.toThrow("Run `safaridriver -p 4799` in a Terminal on the Mac")
}, 30_000)

// A WebDriver that opens a session and answers every command with null.
const driver: Fetcher = async (url) => ({
	json: async () => ({
		value: url.endsWith("/session") ? { sessionId: "s1", capabilities: { browserVersion: "17.6" } } : null,
	}),
})

// One failed flow, by its answer or by a throw, fails the run, and every flow still runs and reports.
it("failed flow fails", async () => {
	const safari = await SafariSession.open("http://driver", driver)
	const site = { origin: "http://site", callFn: async () => undefined }
	const flows: Flow[] = [
		{ name: "passes", run: async () => undefined },
		{ name: "answers", run: async () => "stuck" },
		{ name: "throws", run: async () => Promise.reject(new Error("gone")) },
	]
	const lines: string[] = []
	expect(await runFlows(safari, site, { log: (line) => lines.push(line), flows })).toBe(1)
	expect(lines).toEqual([
		"PASS  passes",
		"FAIL  answers: stuck",
		"FAIL  throws: Error: gone",
		"verify:safari: 1 of 3 flows passed in Safari 17.6",
	])
	expect(await runFlows(safari, site, { log: () => undefined, flows: [flows[0] as Flow] })).toBe(0)
})

// The /hr flow against a session that restores the path and the click position, and reports the window mark by
// whether Back has run yet.
async function hrFlow(mark: (backed: boolean) => boolean): Promise<string | undefined> {
	let backed = false
	const fake: Fetcher = async (url, init) => ({
		json: async () => {
			if (url.endsWith("/session")) return { value: { sessionId: "s1", capabilities: { browserVersion: "17.6" } } }
			if (url.endsWith("/element")) return { value: { element: "e1" } }
			if (url.endsWith("/back")) backed = true
			if (!url.endsWith("/execute/sync")) return { value: null }
			const script = String(Reflect.get(Object(JSON.parse(init.body ?? "{}")), "script") ?? "")
			if (script === "return window.__flareMark === 1") return { value: mark(backed) }
			if (script === "return window.__at") return { value: 0 }
			return { value: script.startsWith("return") ? true : null }
		},
	})
	const safari = await SafariSession.open("http://driver", fake)
	const flow = FLOWS.find((entry) => entry.name === "Back restores the position at the click")
	return flow?.run(safari, { origin: "http://site", callFn: async () => undefined })
}

// Client navigations both ways pass.
it("back client passes", async () => {
	expect(await hrFlow(() => true)).toBeUndefined()
})

// Back to /hr that lands as a document load is not a pass, though the browser restores the scroll itself: the mark is
// there after the forward click and gone after Back.
it("back reload fails", async () => {
	expect(await hrFlow((backed) => !backed)).toBe("Back loaded a document")
})

// A forward click to /hr/docs/media that falls back to a document load is not a pass either: Back is then a
// document-to-document traversal, and Safari's back-forward cache restores /hr with its window, mark included. The mark
// is gone after the forward click and back after Back.
it("forward reload fails", async () => {
	expect(await hrFlow((backed) => backed)).toBe("the media link loaded as a document")
})

// The lock's shell scripts, run by a local `sh` as the Mac's would run them over ssh.
const localRemote: Remote = (script, args) => {
	const result = spawnSync("sh", ["-c", script, "sh", ...args], { encoding: "utf8" })
	return { status: result.status, stdout: result.stdout }
}

// A second verify:safari while another holds the Mac's lock fails at once, naming the holder, before it opens a
// tunnel or boots anything: the ssh destination here does not resolve, so reaching the tunnel would fail differently.
it("lock held fails", async () => {
	const dir = mkdtempSync(join(tmpdir(), "flare-safari-lock-"))
	try {
		const path = join(dir, "safari.lock")
		acquire(localRemote, { path, owner: "other-host:4242", staleMs: 60_000 }, Date.now())
		const env = {
			FLARE_SAFARI_SSH: "flare-no-such-mac.invalid",
			FLARE_SAFARI_HOST: "10.0.0.2",
			FLARE_SAFARI_LOCK: path,
		}
		const started = Date.now()
		await expect(verifySafari(env, { remote: localRemote })).rejects.toThrow(
			"Safari is in use by other-host:4242, since ",
		)
		expect(Date.now() - started).toBeLessThan(1000)
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})

// A run past its limit fails with the limit, closes what its drive opened, and frees the lock, so the process can end
// instead of driving Safari unlocked.
it("limit closes", async () => {
	const dir = mkdtempSync(join(tmpdir(), "flare-safari-lock-"))
	try {
		const path = join(dir, "safari.lock")
		const closed: string[] = []
		const drive = (_config: unknown, signal: AbortSignal): Promise<number> =>
			new Promise<number>(() => {
				signal.addEventListener("abort", () => closed.push("tunnel, docs, and proxy"))
			})
		const env = {
			FLARE_SAFARI_SSH: "flare-no-such-mac.invalid",
			FLARE_SAFARI_HOST: "10.0.0.2",
			FLARE_SAFARI_LOCK: path,
		}
		await expect(verifySafari(env, { remote: localRemote, drive, limitMs: 50 })).rejects.toThrow(
			"verify:safari ran past its limit of 50 ms",
		)
		expect(closed).toEqual(["tunnel, docs, and proxy"])
		expect(existsSync(path)).toBe(false)
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})
