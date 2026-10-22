import { connect } from "node:net"
import type { Answer } from "./hostile-corpus.ts"

// One raw HTTP/1.1 request, as a client that does not normalize sends it, and the whole answer: its status, head, and
// body, at most 1 MB, within 5 s. The body ends where its framing says, Content-Length or chunked, or is empty for HEAD,
// 204, and 304, since miniflare keeps the socket open whatever the request's Connection header asks; with no framing it
// ends when the server closes. The path is written as it is, dot segments and escapes included. Only the test's own
// servers, on loopback, are ever asked.
export async function raw(origin: string, text: string): Promise<Answer> {
	const url = new URL(origin)
	if (url.hostname !== "127.0.0.1") throw new Error(`the black-box suites ask loopback only, not ${url.hostname}`)
	const first = text.split("\r\n")[0] ?? ""
	return new Promise((resolve, reject) => {
		const socket = connect(Number(url.port), url.hostname, () => socket.write(text))
		let got = ""
		let settled = false
		const finish = (): void => {
			if (settled) return
			settled = true
			socket.destroy()
			const top = headOf(got)
			if (top === undefined) return reject(new Error(`closed with no answer to ${first}`))
			const body = got.slice(top.length + 4)
			const chunked = /chunked/i.test(header(top, "transfer-encoding") ?? "")
			resolve({ status: Number(top.split(" ")[1]), head: top, body: chunked ? dechunked(body) : body })
		}
		socket.setEncoding("latin1")
		socket.on("data", (chunk: string) => {
			got += chunk
			const top = headOf(got)
			if (top === undefined) return
			if (got.length > 1_000_000 || framedEnd(first, top, got.slice(top.length + 4))) finish()
		})
		socket.on("error", (error) => {
			if (!settled) {
				settled = true
				reject(error)
			}
		})
		socket.on("close", finish)
		socket.setTimeout(5000, () => {
			if (settled) return
			settled = true
			socket.destroy()
			reject(new Error(`no answer to ${first}`))
		})
	})
}

// The head of what was read so far, once it is whole.
function headOf(got: string): string | undefined {
	const split = got.indexOf("\r\n\r\n")
	return split === -1 ? undefined : got.slice(0, split)
}

// Whether the body read so far is the whole of it, by the answer's framing.
function framedEnd(requestLine: string, head: string, body: string): boolean {
	const status = Number(head.split(" ")[1])
	if (requestLine.startsWith("HEAD ") || status === 204 || status === 304 || (status >= 100 && status < 200))
		return true
	const length = header(head, "content-length")
	if (length !== undefined) return body.length >= Number(length)
	if (/chunked/i.test(header(head, "transfer-encoding") ?? "")) return /(?:^|\r\n)0\r\n\r\n$/.test(body)
	return false
}

// A chunked body's content: each chunk's bytes, without the sizes and line ends that frame them.
function dechunked(body: string): string {
	let content = ""
	let at = 0
	while (at < body.length) {
		const end = body.indexOf("\r\n", at)
		if (end === -1) break
		const size = Number.parseInt(body.slice(at, end), 16)
		if (!Number.isFinite(size) || size === 0) break
		content += body.slice(end + 2, end + 2 + size)
		at = end + 2 + size + 2
	}
	return content
}

// A header's value in an answer's head, its name matched in any case, or undefined.
export function header(head: string, name: string): string | undefined {
	for (const line of head.split("\r\n").slice(1)) {
		const colon = line.indexOf(":")
		if (colon > 0 && line.slice(0, colon).trim().toLowerCase() === name) return line.slice(colon + 1).trim()
	}
	return undefined
}
