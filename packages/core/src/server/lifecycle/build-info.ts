// The deploy's build id and the URL of the client entry (B84, B89). The source is what a server without the plugin
// has: the `dev` id and no client script. flare() replaces this module in the ssr and worker environments: in dev
// with the project-relative entry, and in a build with the client manifest's hash and hashed entry
// (vite/plugin/build-id.ts).
export const buildId: string = "dev"
export const clientEntry: string | undefined = undefined
// What `transformIndexHtml` adds to an empty document, which a dev server's documents carry last in `<head>` (B95
// (b)). Empty outside `vite dev`.
export const devHead: string = ""

// The modules a production document preloads: the client entry's, and per route source path its chunk's (plan 21
// 15.3, vite/plugin/preloads.ts). Empty outside a deploy's bundle.
export type PreloadTable = { entry: readonly string[]; routes: Readonly<Record<string, readonly string[]>> }
export const preloads: PreloadTable = { entry: [], routes: {} }
