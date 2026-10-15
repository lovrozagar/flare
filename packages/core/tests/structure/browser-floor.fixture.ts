// A planted use above the browser floor, outside src: browser-floor.test.ts `planted URL.parse` proves the scanner
// fails it. `URL.parse` is Chrome 126 and Safari 18, above the floor's Chrome 111 and Safari 16.4 (decision B123).
export function planted(href: string): URL | null {
	return URL.parse(href)
}
