// WebKit warns that a resource "was preloaded using link preload but not used within a few seconds from the window's
// load event" when the preload is consumed by flipping the link's `rel` to `stylesheet`, as B15's nonced swap does.
// Measured behind a counting proxy (BUGS.md 81): the stylesheet reaches the network once on every engine, with no cache
// headers, the Workers assets defaults, and `immutable` alike, so the warning is engine noise. Only that message naming
// the built stylesheet is ignored. Any other preload warning, a JS chunk's among them (BUGS.md 79), is still a problem.
const STYLESHEET_PRELOAD =
	/^The resource \S+\/assets\/style-[\w-]+\.css was preloaded using link preload but not used within a few seconds/;

export function engineNoise(text: string): boolean {
	return STYLESHEET_PRELOAD.test(text);
}
