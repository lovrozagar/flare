# Framework Wire Format Comparison Results

> Generated: 2026-02-22T18:31:49.252Z
> Mode: **Production** (built + served from dist)
> Test page: `/posts/building-web-frameworks`
> Identical data fixture: 1 post (title, author, 1178-char body) + 3 comments (500ms deferred) + Like button (interactive)

## Summary

| Metric                       | Flare                                  | Next.js                                | TanStack Start                         |
| ---------------------------- | -------------------------------------- | -------------------------------------- | -------------------------------------- |
| SSR HTML size                | 6.5 KB                                 | 12.8 KB                                | 5.8 KB                                 |
| HTML only (no state)         | 3.3 KB                                 | 4.7 KB                                 | 2.9 KB                                 |
| Embedded state size          | 3.1 KB                                 | 8.1 KB                                 | 2.9 KB                                 |
| SSR HTML gzipped             | 1.8 KB                                 | 3.5 KB                                 | 2.0 KB                                 |
| SPA nav gzipped              | 1.1 KB                                 | 1.7 KB                                 | 400 B                                  |
| SPA nav payload              | 2.8 KB                                 | 4.5 KB                                 | 826 B                                  |
| SPA nav content-type         | `application/x-ndjson`                 | `text/x-component`                     | `application/json`                     |
| User data / overhead         | 1.9 KB / 905 B (31% overhead)          | 2.1 KB / 2.4 KB (53% overhead)         | 359 B / 467 B (57% overhead)           |
| TTFB SSR (median 5 runs)     | 502.67ms                               | 504.07ms                               | 502.9ms                                |
| TTFB SPA nav (median 5 runs) | 501.37ms                               | 502.59ms                               | N/A (client-side)                      |
| Initial page JS (runtime)    | 71.6 KB (5 files)                      | 347.0 KB (6 files)                     | 315.0 KB (2 files)                     |
| JS loaded on SPA nav         | 2.8 KB (1 files)                       | 488 B (1 files)                        | 816 B (1 files)                        |
| **Total SPA nav cost**       | **5.6 KB** (2.8 KB data + 2.8 KB JS)   | **5.0 KB** (4.5 KB data + 488 B JS)    | **1.6 KB** (826 B data + 816 B JS)     |
| Client bundle total          | 76.2 KB                                | 755.7 KB                               | 316.2 KB                               |
| Server bundle total          | 144.4 KB                               | 526.6 KB                               | 839.1 KB                               |
| Entry chunk size             | 0 KB                                   | 116.2 KB                               | 314.7 KB                               |
| document.title after nav     | "Building Web Frameworks from Scratch" | "Building Web Frameworks from Scratch" | "Building Web Frameworks from Scratch" |
| og:title after nav           | "Building Web Frameworks from Scratch" | "Building Web Frameworks from Scratch" | "Building Web Frameworks from Scratch" |
| og:description after nav     | present                                | present                                | present                                |
| Re-fetches on back/fwd       | 0 (cached)                             | 0 (cached)                             | 1 requests                             |
| Prefetch on hover            | none                                   | none                                   | 1 requests                             |
| Interactivity (Like button)  | OK (Like (42) -> Like (43))            | OK (Like (42) -> Like (43))            | OK (Like (42) -> Like (43))            |

## Flare (port 4001)

### SSR Response

- Total HTML: 6.5 KB
- Gzipped: 1.8 KB
- HTML only: 3.3 KB
- Embedded state: 3.1 KB

### TTFB

- SSR (median 5 runs): 502.67ms
- SPA nav (median 5 runs): 501.37ms

### SPA Navigation Response

- URL: `http://localhost:4001/posts/building-web-frameworks`
- Status: 200
- Content-Type: `application/x-ndjson`
- Size: 2.8 KB
- Gzipped: 1.1 KB

**Headers:**

```
cache-control: no-store
content-type: application/x-ndjson
transfer-encoding: chunked
vary: Origin
```

**Response body (first 50 lines):**

```
{"m":"_root_:{\"slug\":\"building-web-frameworks\"}:[]","t":"l"}
{"d":{"comments":{"__deferred":true,"key":"d0"},"likes":42,"post":{"slug":"building-web-frameworks","title":"Building Web Frameworks from Scratch","author":"Sarah Chen","body":"Building a web framework from scratch teaches you more about the web platform than years of using existing tools. You start by understanding how HTTP request routing works at the lowest level, mapping URL patterns to handler functions. Then you layer on server-side rendering, which means generating HTML strings from component trees. The real complexity emerges when you add client-side hydration — the process of attaching event listeners and state to server-rendered markup without re-rendering the entire page. Streaming SSR adds another dimension, allowing you to send HTML chunks as data becomes available rather than waiting for everything. This is where frameworks diverge most: some send complete HTML with embedded state, others stream structured data formats that the client interprets. Error boundaries, code splitting, and prefetching each add their own wire protocol requirements. The framework must coordinate between server and client, maintaining a shared understanding of route structure, data dependencies, and component hierarchy. Every framework makes different tradeoffs in this design space, and understanding those tradeoffs requires building one yourself."}},"m":"_root_/posts/[slug]:{\"slug\":\"building-web-frameworks\"}:[]","t":"l"}
{"d":{"meta":{"charset":"utf-8","viewport":"width=device-width, initial-scale=1"},"title":"Flare Benchmark"},"m":"_root_:{\"slug\":\"building-web-frameworks\"}:[]","t":"h"}
{"d":{"meta":{"charset":"utf-8","viewport":"width=device-width, initial-scale=1"},"title":"Building Web Frameworks from Scratch","description":"Building a web framework from scratch teaches you more about the web platform than years of using existing tools. You start by understanding how HTTP reque...","openGraph":{"description":"Building a web framework from scratch teaches you more about the web platform than years of using existing tools. You start by understanding how HTTP reque...","title":"Building Web Frameworks from Scratch","type":"article"}},"m":"_root_/posts/[slug]:{\"slug\":\"building-web-frameworks\"}:[]","t":"h"}
{"t":"r"}
{"d":[{"author":"Alex Kim","text":"This mirrors my experience building our internal framework at work. The hydration step is where most complexity lives.","date":"2025-03-15"},{"author":"Jordan Blake","text":"Have you looked at how Qwik handles this differently with resumability instead of hydration?","date":"2025-03-16"},{"author":"Morgan Lee","text":"Great write-up. Would love a follow-up on how you handle streaming with error boundaries.","date":"2025-03-17"}],"k":"d0","m":"_root_/posts/[slug]:{\"slug\":\"building-web-frameworks\"}:[]","t":"c"}
{"t":"d"}

```

**JS loaded during SPA nav:** 2.8 KB (1 files)

### Head Tags After SPA Navigation

- `document.title`: "Building Web Frameworks from Scratch"
- `og:title`: Building Web Frameworks from Scratch
- `og:description`: Building a web framework from scratch teaches you more about the web platform than years of using existing tools. You start by understanding how HTTP reque...
- `description`: Building a web framework from scratch teaches you more about the web platform than years of using existing tools. You start by understanding how HTTP reque...

### Back/Forward Re-fetches

- 0 -- fully cached

### Prefetch on Hover

- None

### Interactivity (Like Button)

- Button found: yes
- Initial: "Like (42)"
- After click: "Like (43)"
- Hydration + event handler: **working**

### Build Output

- Client bundle: 76.2 KB (8 files)
- Server bundle: 144.4 KB
- Entry chunk: 0 KB

---

## Next.js (port 4002)

### SSR Response

- Total HTML: 12.8 KB
- Gzipped: 3.5 KB
- HTML only: 4.7 KB
- Embedded state: 8.1 KB

### TTFB

- SSR (median 5 runs): 504.07ms
- SPA nav (median 5 runs): 502.59ms

### SPA Navigation Response

- URL: `http://localhost:4002/posts/building-web-frameworks`
- Status: 200
- Content-Type: `text/x-component`
- Size: 4.5 KB
- Gzipped: 1.7 KB

**Headers:**

```
cache-control: private, no-cache, no-store, max-age=0, must-revalidate
content-type: text/x-component
transfer-encoding: chunked
vary: RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch, Accept-Encoding
```

**Response body (first 50 lines):**

```
1:"$Sreact.fragment"
3:I[9665,[],"OutletBoundary"]
6:I[4911,[],"AsyncMetadataOutlet"]
8:I[9665,[],"ViewportBoundary"]
a:I[9665,[],"MetadataBoundary"]
c:"$Sreact.suspense"
d:I[4911,[],"AsyncMetadata"]
f:I[6472,["874","static/chunks/874-902439cddad6b9e5.js","858","static/chunks/app/posts/%5Bslug%5D/page-f39ea98c2f34c843.js"],"LikeButton"]
12:I[6874,["874","static/chunks/874-902439cddad6b9e5.js","858","static/chunks/app/posts/%5Bslug%5D/page-f39ea98c2f34c843.js"],""]
0:{"b":"CPX3tY0AhYI0CB34Stp47","f":[["children","posts","children",["slug","building-web-frameworks","d"],"children","__PAGE__",["__PAGE__",{}],["__PAGE__",["$","$1","c",{"children":["$L2","$undefined",null,["$","$L3",null,{"children":["$L4","$L5",["$","$L6",null,{"promise":"$@7"}]]}]]}],{},null,false],["$","$1","h",{"children":[null,["$","$1","twiacvYLEuoyd-e-uB5AE",{"children":[["$","$L8",null,{"children":"$L9"}],null]}],[["$","$La","twiacvYLEuoyd-e-uB5AE",{"children":"$Lb"}]],null]}],false]],"S":false}
b:["$","$c",null,{"fallback":null,"children":["$","$Ld",null,{"promise":"$@e"}]}]
10:T49e,Building a web framework from scratch teaches you more about the web platform than years of using existing tools. You start by understanding how HTTP request routing works at the lowest level, mapping URL patterns to handler functions. Then you layer on server-side rendering, which means generating HTML strings from component trees. The real complexity emerges when you add client-side hydration — the process of attaching event listeners and state to server-rendered markup without re-rendering the entire page. Streaming SSR adds another dimension, allowing you to send HTML chunks as data becomes available rather than waiting for everything. This is where frameworks diverge most: some send complete HTML with embedded state, others stream structured data formats that the client interprets. Error boundaries, code splitting, and prefetching each add their own wire protocol requirements. The framework must coordinate between server and client, maintaining a shared understanding of route structure, data dependencies, and component hierarchy. Every framework makes different tradeoffs in this design space, and understanding those tradeoffs requires building one yourself.2:["$","article",null,{"children":[["$","h1",null,{"children":"Building Web Frameworks from Scratch"}],["$","p",null,{"children":["By ","Sarah Chen"]}],["$","$Lf",null,{"initial":42}],["$","div",null,{"children":"$10"}],["$","h2",null,{"children":"Comments"}],["$","$c",null,{"fallback":["$","p",null,{"children":"Loading comments..."}],"children":"$L11"}],["$","p",null,{"children":["$","$L12",null,{"href":"/","children":"Back to posts"}]}]]}]
5:null
9:[["$","meta","0",{"charSet":"utf-8"}],["$","meta","1",{"name":"viewport","content":"width=device-width, initial-scale=1"}]]
4:null
7:{"metadata":[["$","title","0",{"children":"Building Web Frameworks from Scratch"}],["$","meta","1",{"name":"description","content":"Building a web framework from scratch teaches you more about the web platform than years of using existing tools. You start by understanding how HTTP reque..."}],["$","meta","2",{"property":"og:title","content":"Building Web Frameworks from Scratch"}],["$","meta","3",{"property":"og:description","content":"Building a web framework from scratch teaches you more about the web platform than years of using existing tools. You start by understanding how HTTP reque..."}],["$","meta","4",{"property":"og:type","content":"article"}],["$","meta","5",{"name":"twitter:card","content":"summary"}],["$","meta","6",{"name":"twitter:title","content":"Building Web Frameworks from Scratch"}],["$","meta","7",{"name":"twitter:description","content":"Building a web framework from scratch teaches you more about the web platform than years of using existing tools. You start by understanding how HTTP reque..."}]],"error":null,"digest":"$undefined"}
e:{"metadata":"$7:metadata","error":null,"digest":"$undefined"}
11:["$","ul",null,{"children":[["$","li","0",{"children":[["$","strong",null,{"children":"Alex Kim"}]," (","2025-03-15","): ","This mirrors my experience building our internal framework at work. The hydration step is where most complexity lives."]}],["$","li","1",{"children":[["$","strong",null,{"children":"Jordan Blake"}]," (","2025-03-16","): ","Have you looked at how Qwik handles this differently with resumability instead of hydration?"]}],["$","li","2",{"children":[["$","strong",null,{"children":"Morgan Lee"}]," (","2025-03-17","): ","Great write-up. Would love a follow-up on how you handle streaming with error boundaries."]}]]}]

```

**JS loaded during SPA nav:** 488 B (1 files)

### Head Tags After SPA Navigation

- `document.title`: "Building Web Frameworks from Scratch"
- `og:title`: Building Web Frameworks from Scratch
- `og:description`: Building a web framework from scratch teaches you more about the web platform than years of using existing tools. You start by understanding how HTTP reque...
- `description`: Building a web framework from scratch teaches you more about the web platform than years of using existing tools. You start by understanding how HTTP reque...

### Back/Forward Re-fetches

- 0 -- fully cached

### Prefetch on Hover

- None

### Interactivity (Like Button)

- Button found: yes
- Initial: "Like (42)"
- After click: "Like (43)"
- Hydration + event handler: **working**

### Build Output

- Client bundle: 755.7 KB (17 files)
- Server bundle: 526.6 KB
- Entry chunk: 116.2 KB

---

## TanStack Start (port 4003)

### SSR Response

- Total HTML: 5.8 KB
- Gzipped: 2.0 KB
- HTML only: 2.9 KB
- Embedded state: 2.9 KB

### TTFB

- SSR (median 5 runs): 502.9ms
- SPA nav: N/A (client-side loader)

### SPA Navigation Response

- URL: `http://localhost:4003/_serverFn/8e0188c0e7f02a2431565678bab7a8f03960a2b1de9e000a68a166b7874a5b4e?payload=%7B%22t%22%3A%7B%22t%22%3A10%2C%22i%22%3A0%2C%22p%22%3A%7B%22k%22%3A%5B%22data%22%5D%2C%22v%22%3A%5B%7B%22t%22%3A1%2C%22s%22%3A%22building-web-frameworks%22%7D%5D%7D%2C%22o%22%3A0%7D%2C%22f%22%3A63%2C%22m%22%3A%5B%5D%7D`
- Status: 200
- Content-Type: `application/json`
- Size: 826 B
- Gzipped: 400 B

**Headers:**

```
transfer-encoding: chunked
content-type: application/json
vary: Accept-Encoding
```

**Response body (first 50 lines):**

```
{"t":10,"i":0,"p":{"k":["result","error","context"],"v":[{"t":9,"i":1,"a":[{"t":10,"i":2,"p":{"k":["author","text","date"],"v":[{"t":1,"s":"Alex Kim"},{"t":1,"s":"This mirrors my experience building our internal framework at work. The hydration step is where most complexity lives."},{"t":1,"s":"2025-03-15"}]},"o":0},{"t":10,"i":3,"p":{"k":["author","text","date"],"v":[{"t":1,"s":"Jordan Blake"},{"t":1,"s":"Have you looked at how Qwik handles this differently with resumability instead of hydration?"},{"t":1,"s":"2025-03-16"}]},"o":0},{"t":10,"i":4,"p":{"k":["author","text","date"],"v":[{"t":1,"s":"Morgan Lee"},{"t":1,"s":"Great write-up. Would love a follow-up on how you handle streaming with error boundaries."},{"t":1,"s":"2025-03-17"}]},"o":0}],"o":0},{"t":2,"s":1},{"t":11,"i":5,"p":{"k":[],"v":[]},"o":0}]},"o":0}
```

**JS loaded during SPA nav:** 816 B (1 files)

### Head Tags After SPA Navigation

- `document.title`: "Building Web Frameworks from Scratch"
- `og:title`: Building Web Frameworks from Scratch
- `og:description`: Building a web framework from scratch teaches you more about the web platform than years of using existing tools. You start by understanding how HTTP reque...
- `description`: Building a web framework from scratch teaches you more about the web platform than years of using existing tools. You start by understanding how HTTP reque...

### Back/Forward Re-fetches

- 1 data requests

### Prefetch on Hover

- 1 requests

### Interactivity (Like Button)

- Button found: yes
- Initial: "Like (42)"
- After click: "Like (43)"
- Hydration + event handler: **working**

### Build Output

- Client bundle: 316.2 KB (4 files)
- Server bundle: 839.1 KB
- Entry chunk: 314.7 KB

---

## Deep Analysis

### A. Wire Protocol Annotated

What each framework actually sends on SPA navigation, line by line from the captured response.

#### Flare -- NDJSON (`application/x-ndjson`)

7 lines, each a complete JSON object with a `t` (type) field:

| Type   | Count | Purpose                                          |
| ------ | ----- | ------------------------------------------------ |
| loader | 2     | Route data keyed by matchId                      |
| head   | 2     | `<head>` config per route (title, meta, OG tags) |
| ready  | 1     | Signal: initial data complete, client can render |
| chunk  | 1     | Deferred data (resolved after `ready`)           |
| done   | 1     | Stream close signal                              |

**Annotated response:**

```
LOADER (route data) [_root_]
  {"m":"_root_:{\"slug\":\"building-web-frameworks\"}:[]","t":"l"}
LOADER (route data) [_root_/posts/[slug]]
  {"d":{"comments":{"__deferred":true,"key":"d0"},"likes":42,"post":{"slug":"building-web-frameworks","title":"Building We...
HEAD (route meta/title/OG tags) [_root_]
  {"d":{"meta":{"charset":"utf-8","viewport":"width=device-width, initial-scale=1"},"title":"Flare Benchmark"},"m":"_root_...
HEAD (route meta/title/OG tags) [_root_/posts/[slug]]
  {"d":{"meta":{"charset":"utf-8","viewport":"width=device-width, initial-scale=1"},"title":"Building Web Frameworks from ...
READY (initial data complete, start rendering)
  {"t":"r"}
CHUNK (deferred data resolved) [_root_/posts/[slug]] key=d0
  {"d":[{"author":"Alex Kim","text":"This mirrors my experience building our internal framework at work. The hydration ste...
DONE (stream complete)
  {"t":"d"}
```

**Key observation:** Every line is self-describing. The `m` field contains the route path + serialized params, so you can identify exactly which route produced which data in the Network tab without any tooling.

#### Next.js -- RSC Flight (`text/x-component`)

18 lines in a custom binary-ish format. Each line is `<hex_id>:<payload>`:

| Type         | Count | Purpose                                                  |
| ------------ | ----- | -------------------------------------------------------- |
| module-ref   | 7     | Client component import (module path + chunk file)       |
| object       | 3     | Props, metadata objects, router state tree               |
| vdom-node    | 3     | React vDOM element: `["$","tag",key,{props...}]`         |
| string-const | 2     | Shared string (e.g., `react.fragment`, `react.suspense`) |
| null         | 2     | Resolved empty value (e.g., awaited boundary ready)      |
| text-blob    | 1     | Length-prefixed raw text (e.g., post body)               |

**Annotated response (key lines):**

```
1: STRING_CONST = "$Sreact.fragment"
  1:"$Sreact.fragment"
3: MODULE_REF -> import OutletBoundary
  3:I[9665,[],"OutletBoundary"]
6: MODULE_REF -> import AsyncMetadataOutlet
  6:I[4911,[],"AsyncMetadataOutlet"]
8: MODULE_REF -> import ViewportBoundary
  8:I[9665,[],"ViewportBoundary"]
a: MODULE_REF -> import MetadataBoundary
  a:I[9665,[],"MetadataBoundary"]
c: STRING_CONST = "$Sreact.suspense"
  c:"$Sreact.suspense"
d: MODULE_REF -> import AsyncMetadata
  d:I[4911,[],"AsyncMetadata"]
f: MODULE_REF -> import 874
  f:I[6472,["874","static/chunks/874-902439cddad6b9e5.js","858","static/chunks/app/posts/%5Bslug%5D/page-f39ea98c2f34c843....
12: MODULE_REF -> import 874
  12:I[6874,["874","static/chunks/874-902439cddad6b9e5.js","858","static/chunks/app/posts/%5Bslug%5D/page-f39ea98c2f34c843...
0: OBJECT -> props/data
  0:{"b":"CPX3tY0AhYI0CB34Stp47","f":[["children","posts","children",["slug","building-web-frameworks","d"],"children","__...
b: VDOM -> lazy component reference
  b:["$","$c",null,{"fallback":null,"children":["$","$Ld",null,{"promise":"$@e"}]}]
10: TEXT_BLOB (1182 bytes of inline text)
  10:T49e,Building a web framework from scratch teaches you more about the web platform than years of using existing tools...
5: NULL -> resolved empty value
  5:null
9: VDOM -> <meta> tag(s)
  9:[["$","meta","0",{"charSet":"utf-8"}],["$","meta","1",{"name":"viewport","content":"width=device-width, initial-scale=...
4: NULL -> resolved empty value
  4:null
7: OBJECT -> resolved metadata
  7:{"metadata":[["$","title","0",{"children":"Building Web Frameworks from Scratch"}],["$","meta","1",{"name":"descriptio...
e: OBJECT -> resolved metadata
  e:{"metadata":"$7:metadata","error":null,"digest":"$undefined"}
11: VDOM -> <ul> (comments list)
  11:["$","ul",null,{"children":[["$","li","0",{"children":[["$","strong",null,{"children":"Alex Kim"}]," (","2025-03-15",...
```

**Key observation:** In production mode, debug-info lines are stripped, reducing overhead. The response still contains the full vDOM tree with module references and data interleaved.

#### TanStack Start -- Zero Wire

TanStack Start loaders are **isomorphic**: they run on the server during SSR, then **in the browser** during SPA navigation. No server request is made for data -- the loader function is bundled into the client code and executed locally.

Server communication only happens via explicit `createServerFn()` calls, which trigger RPCs to `/_serverFn/<hashed-id>`. The benchmark's loader uses `getPost()` and `getDelayedComments()` which are bundled into the client, so SPA navigation has zero wire overhead for data.

**Trade-off:** Zero wire overhead means the data-fetching code (and its dependencies) must be shipped to the client. If the loader accessed a database or secret, you'd need `createServerFn()` and the zero-wire benefit disappears.

### B. Data/UI Coupling

The fundamental architectural split: does the wire format carry **data only** or **data fused with UI structure**?

#### Flare: Data Only

Loader data is a pure JSON object, keyed by route matchId. The UI is already on the client (Solid components). Example from the actual response:

```json
{
	"d": {
		"comments": {
			"__deferred": true,
			"key": "d0"
		},
		"likes": 42,
		"post": {
			"slug": "building-web-frameworks",
			"title": "Building Web Frameworks from Scratch",
			"author": "Sarah Chen",
			"body": "Building a web framework from scratch teaches you more about the web platform than years of using existing tools. You start by understanding how HTTP request routing works at the lowest level, mapping URL patterns to handler functions. Then you layer on server-side rendering, which means generating HTML strings from component trees. The real complexity emerges when you add client-side hydration — the process of attaching event listeners and state to server-rendered markup without re-rendering the entire page. Streaming SSR adds another dimension, allowing you to send HTML chunks as data becomes available rather than waiting for everything. This is where frameworks diverge most: some send complete HTML with embedded state, others stream structured data formats that the client interprets. Error boundaries, code splitting, and prefetching each add their own wire protocol requirements. The framework must coordinate between server and client, maintaining a shared understanding of route structure, data dependencies, and component hierarchy. Every framework makes different tradeoffs in this design space, and understanding those tradeoffs requires building one yourself."
		}
	},
	"m": "_root_/posts/[slug]:{\"slug\":\"building-web-frameworks\"}:[]",
	"t": "l"
}
```

The data object (`d`) contains the post and a deferred comments placeholder. The `m` field is the matchId. No component structure, no element tags, no props wiring -- just data.

#### Next.js: Data + UI Fused

The RSC Flight response contains the full React virtual DOM tree with data inlined. The same post title appears inside a vDOM node:

```
10:T49e,Building a web framework from scratch teaches you more about the web platform than years of using existing tools. You start by understanding how HTTP request routing works at the lowest level, mapping URL patterns to handler functions. Then you layer on server-side rendering, which means gen...
```

That line encodes: `<article><h1>title</h1><p>By author</p><div>body</div>...</article>` -- the **component tree structure** and the **data** are one and the same. You cannot cache the data separately from the UI because they're fused into a single serialized tree.

#### TanStack Start: Data Only (Client-Side)

Like Flare, TanStack separates data from UI. But instead of sending data over the wire, the loader runs client-side and produces a plain object `{ post, comments }` that the React component consumes. During SSR, the same data is embedded in the HTML as a JSON blob inside a `<script class="$tsr">` tag.

#### Implications

| Capability                        | Flare                | Next.js                      | TanStack Start           |
| --------------------------------- | -------------------- | ---------------------------- | ------------------------ |
| Cache data independently of UI    | Yes (data-only wire) | No (data fused with vDOM)    | Yes (client-side object) |
| Swap UI without re-fetching data  | Yes                  | No (new RSC render needed)   | Yes                      |
| Server-side data cache (KV/Redis) | Natural fit          | Must cache entire RSC tree   | N/A (client-side)        |
| Inspect data in Network tab       | JSON -- readable     | vDOM -- needs React DevTools | N/A (no request)         |

### C. Head Management on SPA Navigation

All three frameworks correctly set `document.title`, `og:title`, `og:description`, and `description` after SPA navigation (verified in captured head tags). The mechanism differs:

#### Flare

Head config is streamed as structured data in dedicated `t:"h"` NDJSON lines, one per route in the match chain. From the actual response:

```json
{
  "d": {
    "meta": {
      "charset": "utf-8",
      "viewport": "width=device-width, initial-scale=1"
    },
    "title": "Flare Benchmark"
  },
  "m": "_root_:{\"slug\":\"building-web-frameworks\"}:[]",
  "t": "h"
}
{
  "d": {
    "meta": {
      "charset": "utf-8",
      "viewport": "width=device-width, initial-scale=1"
    },
    "title": "Building Web Frameworks from Scratch",
    "description": "Building a web framework from scratch teaches you more about the web platform than years of using existing tools. You start by understanding how HTTP reque...",
    "openGraph": {
      "description": "Building a web framework from scratch teaches you more about the web platform than years of using existing tools. You start by understanding how HTTP reque...",
      "title": "Building Web Frameworks from Scratch",
      "type": "article"
    }
  },
  "m": "_root_/posts/[slug]:{\"slug\":\"building-web-frameworks\"}:[]",
  "t": "h"
}
```

The root layout sends its head (`title: "Flare Benchmark"`), and the page overrides with post-specific metadata. The client merges these by route depth -- deeper routes override shallower ones. Head data is cached per `matchId`, so back-navigation can restore metadata from cache without refetching.

#### Next.js

Metadata is resolved via `generateMetadata()` on the server and embedded in the RSC Flight response as vDOM `<meta>` and `<title>` elements inside `MetadataBoundary` / `AsyncMetadata` components. From the actual response:

```

```

Metadata is part of the component tree -- it's rendered via `<MetadataBoundary>` and `<AsyncMetadata>` Suspense boundaries. This means metadata resolution is coupled to the component render cycle. In the captured response, Next.js also auto-generates `twitter:card`, `twitter:title`, and `twitter:description` tags from the OpenGraph config.

#### TanStack Start

The `head()` function runs client-side during SPA nav (isomorphic like the loader). It returns a meta descriptor array:

```ts
head: ({ loaderData }) => ({
	meta: [
		{ title: h.title },
		{ name: "description", content: h.description },
		{ property: "og:title", content: h.openGraph.title },
	],
});
```

The `<HeadContent />` component reads this and patches `<head>` DOM nodes. No server round-trip needed for head data on SPA nav.

### D. Streaming & Deferred Data

All three frameworks support deferred data (comments load with a 500ms delay). The streaming mechanism differs:

#### Flare: NDJSON Stream Timeline

```
1. LOADER  _root_         -> root layout data (empty)      immediate
2. LOADER  posts/[slug]   -> {post, comments: deferred}    immediate
3. HEAD    _root_         -> {title: "Flare Benchmark"}    immediate
4. HEAD    posts/[slug]   -> {title, description, OG...}   immediate
5. READY                  -> "all initial data sent"       immediate
   -- client starts rendering, shows <Await pending> fallback --
6. CHUNK   posts/[slug]   -> [{author, text, date}, ...]   +500ms
   -- <Await> resolves, comments appear --
7. DONE                   -> stream close                  +500ms
```

The `READY` signal (line 5) tells the client: "you have all non-deferred data, start rendering now." Deferred chunks arrive later and resolve `<Await>` boundaries. The stream stays open until `DONE`.

#### Next.js: RSC Flight Suspense

```
1-25. Module refs, debug info, vDOM structure    -> immediate (component tree)
  -- includes <Suspense fallback={...}> around <Comments> --
26.  1f:T49e,<post body text>                   -> immediate (text blob)
27.  2:["$","article",...]                      -> immediate (page vDOM)
28.  c:{metadata: [...]}                         -> immediate (resolved meta)
  -- client renders page with "Loading comments..." fallback --
29.  20:["$","ul",null,{children:[...]}]        -> +500ms (comments vDOM)
  -- Suspense boundary resolves, comments appear --
```

Next.js streams the full component tree first, with Suspense boundaries as placeholders. When the `<Comments>` async component resolves (after 500ms), the resolved vDOM chunk is sent and the client swaps the fallback.

#### TanStack Start: Client-Side Promise Resolution

During **SSR**, deferred data is handled via inline `<script>` tags that resolve a stream barrier:

```html
<!-- Initial render with fallback -->
<script class="$tsr">
	/* stream barrier + dehydrated router state */
</script>
<!-- After 500ms, deferred data resolves -->
<script>
	($R=>/* resolve deferred promise with comment data */)($R)
</script>
```

During **SPA navigation**, the promise runs entirely in the browser. `getDelayedComments()` is bundled client-side, so the 500ms delay happens locally. `<Suspense>` + `<Await promise={comments}>` shows the fallback until the promise resolves -- no streaming, no server involvement.

### E. Caching Architecture

Measured from actual captured data:

| Behavior             | Flare      | Next.js                                                   | TanStack Start   |
| -------------------- | ---------- | --------------------------------------------------------- | ---------------- |
| Cache-Control header | `no-store` | `private, no-cache, no-store, max-age=0, must-revalidate` | N/A (no request) |
| Back/fwd re-fetches  | 0 (cached) | 0 (cached)                                                | 1 requests       |
| Prefetch on hover    | none       | none                                                      | 1 requests       |

**Flare** refetches on back/forward because `staleTime` defaults to 0 -- the client-side matchCache considers data stale immediately. This is configurable per-route via `cache: { staleTime: 60_000 }`. When the KV CacheStore is enabled (Cloudflare Workers), data is also cached server-side, making refetches fast (~1ms KV hit instead of re-running the loader).

**Next.js** returns `cache-control: no-store, must-revalidate` but the Router Cache holds the RSC response in memory. Back/forward navigation serves from this in-memory cache without refetching. The Router Cache cannot be cleared programmatically (a known pain point).

**TanStack Start** has zero re-fetches because the data is already in the client-side React Query cache. The loader ran in the browser -- the data never left the process. Back/forward navigation reads directly from memory.

**Cache layer comparison:**

| Layer           | Flare                    | Next.js                   | TanStack Start          |
| --------------- | ------------------------ | ------------------------- | ----------------------- |
| Client memory   | matchCache (per matchId) | Router Cache (RSC tree)   | React Query cache       |
| Server KV/Redis | CacheStore interface     | Data Cache (fetch cache)  | N/A                     |
| CDN edge        | Standard HTTP caching    | Full Route Cache          | Standard HTTP           |
| Granularity     | Per-route data object    | Entire RSC component tree | Per-loader return value |

### F. Developer Experience Comparison

Side-by-side code patterns from the actual benchmark implementations:

| Aspect              | Flare                                                        | Next.js                                                       | TanStack Start                                                 |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Route definition    | `createPage("_root_/posts/[slug]").loader().head().render()` | `export default async function Page()` + `generateMetadata()` | `createFileRoute("/posts/$slug")({ loader, head, component })` |
| Head access to data | `ctx.loaderData` (shared from loader)                        | Must re-derive (call `getPost()` again or use cached fetch)   | `loaderData` (shared from loader)                              |
| Deferred data       | `ctx.defer<T>(async () => ...)` + `<Await>`                  | Async RSC + `<Suspense>` (implicit)                           | Return Promise + `<Suspense><Await>`                           |
| Type-safe params    | `ctx.location.params.slug` (typed from route pattern)        | `params: Promise<{ slug: string }>` (manually typed)          | `params.slug` (inferred from file path)                        |
| Type-safe links     | `<Link to="/">` (typed via generated registry)               | `<Link href="/">` (plain string, no validation)               | `<Link to="/">` (typed via generated route tree)               |
| Error boundary      | `.errorRender()` co-located on route builder                 | Separate `error.tsx` file in same directory                   | `errorComponent` option on route config                        |
| Not-found           | `.notFoundRender()` co-located on route builder              | Separate `not-found.tsx` file                                 | `notFoundComponent` option on route config                     |
| Colocation          | Single chained builder: loader -> head -> render             | 3 exports across 1 file + separate error/loading files        | Single config object with all options                          |

**Head/data sharing note:** In Next.js, `generateMetadata()` and the page component are separate functions. If they need the same data (like post title), either the fetch must be deduped (Next.js auto-dedupes `fetch()`) or the function must be called twice. Flare and TanStack pass loader data directly to the head function -- no duplication needed.

### G. Framework Overhead vs User Data

Measured by marking byte positions in the SPA nav response that contain known user data strings (post title, body, author, comment texts/authors/dates, head description, OG fields). Remaining bytes are framework structure (type markers, matchIds, chunk IDs, vDOM tags, debug info, module references).

| Metric                   | Flare  | Next.js | TanStack Start |
| ------------------------ | ------ | ------- | -------------- |
| Total SPA nav payload    | 2.8 KB | 4.5 KB  | 826 B          |
| User data bytes          | 1.9 KB | 2.1 KB  | 359 B          |
| Framework overhead bytes | 905 B  | 2.4 KB  | 467 B          |
| Overhead ratio           | 31%    | 53%     | 57%            |
| Wire lines               | 7      | 18      | 1              |

**JS loaded during SPA navigation** (route code-split chunks loaded on demand):

| Framework      | JS files | JS bytes | Wire data | Total SPA nav cost |
| -------------- | -------- | -------- | --------- | ------------------ |
| Flare          | 1        | 2.8 KB   | 2.8 KB    | **5.6 KB**         |
| Next.js        | 1        | 488 B    | 4.5 KB    | **5.0 KB**         |
| TanStack Start | 1        | 816 B    | 826 B     | **1.6 KB**         |

**TanStack Start** has 0 B wire data but loads **816 B** of JS during SPA navigation (1 code-split chunks). The loader code, data dependencies (`getPost`, `getDelayedComments`, posts/comments arrays), and the React component are all bundled and loaded on demand. This is the real cost -- it shifts from "server sends data" to "client downloads code that produces data."

**What's in the overhead?**

- **Flare** (905 B): matchIds, type markers (`t:"l"`, `t:"h"`), deferred keys (`__deferred`, `key:"d0"`), JSON structural characters (`{}`, `[]`, quotes, commas). The protocol structure is minimal -- matchIds are the largest overhead component because they encode the full route path + serialized params.

- **Next.js** (2.4 KB): 7 module-ref lines (client component import paths + chunk filenames), 3 vDOM nodes encoding the full `<article><h1>...<ul>...` tree structure with React element arrays (`["$","tag",key,{props},...]`), and the router state tree. Production build strips debug-info lines, but module refs and vDOM structure remain.

**Why this matters:** Frameworks that send data-only (Flare, TanStack) can achieve smaller SPA nav payloads because they skip sending UI structure the client already has. RSC (Next.js) re-sends the component tree on every navigation because the server is the source of truth for the render -- the client doesn't independently know how to render the data.

### H. Production Build Analysis

Build output size comparison after minification and tree-shaking:

| Metric                  | Flare    | Next.js   | TanStack Start |
| ----------------------- | -------- | --------- | -------------- |
| Client bundle           | 76.2 KB  | 755.7 KB  | 316.2 KB       |
| Server bundle           | 144.4 KB | 526.6 KB  | 839.1 KB       |
| Client chunks           | 8        | 17        | 4              |
| Entry chunk             | 0 KB     | 116.2 KB  | 314.7 KB       |
| Total (client + server) | 220.6 KB | 1282.3 KB | 1155.3 KB      |

**Build directories scanned:**

| Framework      | Client            | Server            |
| -------------- | ----------------- | ----------------- |
| Flare          | `dist/client/`    | `dist/server/`    |
| Next.js        | `.next/static/`   | `.next/server/`   |
| TanStack Start | `.output/public/` | `.output/server/` |
