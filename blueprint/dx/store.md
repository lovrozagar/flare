# Stores and revalidate


A store that fails never takes the site down with it. A stored page's read waits 2 s at most: a read that throws or does not answer in time is logged at error level, and the page renders live, `private, no-store`, with nothing written. A record whose envelope the store was never given, a `storedAt` that is no number or `tags` that are no list of strings, is logged and read as a miss, so the render writes a good record over it (`tests/integration/cache-modes.test.ts` `store read fails`, `corrupt record heals`, `server/cache/epoch.test.ts` `corrupt envelope`, BUGS.md 175).
## FlareStore

`createServer({ store })` and `createServer({ static })` both take this interface. `static` is read. A `put` on that object is never called (`server.md`).

| method | required | outcome | pitfall | test |
| --- | --- | --- | --- | --- |
| `get(key)` | yes | `FlareStoreEntry` or `null` | a miss is `null`, not a throw | `server/cache/memory.test.ts` `round trip` |
| `set(key, entry, ttl?)` | yes | stores the entry. `ttl` is milliseconds. Both built-in stores drop an entry past it: on its next read, and through the sweep each write runs over a few entries, so one nothing reads again is dropped too and anonymous requests over endless slugs cannot grow the store with expired entries (BUGS.md 380) | the framework passes `ttl`. An implementation that ignores it keeps the entry forever, which is the bug `ttl` exists to close | `server/cache/write.test.ts` `ssr ttl`; `server/cache/memory.test.ts` `expired swept`; `adapters/stores/fs/store.test.ts` `expired swept` |
| `delete(key)` | yes | on a mutable store, writes a tombstone for that key. A later `get` returns `{ data: { tombstone: true }, storedAt }`, not null. The cache layer does not serve it | the assets store rejects `delete`. SSG reads that store and ignores tombstones | `server/cache/tombstone.test.ts` `delete writes`, `key purge` |
| `deleteByTags(tags)` | yes | not called by `revalidate`. A tag purge gets and sets `epoch:<tag>`, a number | a store that lists every key is wrong on Cache API. There is no tag index | `server/cache/epoch.test.ts` `tag purge` |
| `deleteByKeys(keys)` | no | batch delete. Absent: the framework calls `delete` per key | | `epoch.test.ts` `get cost` |

`FlareStoreEntry` is `{ data, storedAt: number, tags?: string[] }`. `storedAt` is milliseconds. The framework sets it. An implementation does not invent a second timestamp.

The key is built by the framework: `static:<build>:<routeId>:<rawParams>`. There is no identity class in the key. The policy class `anonymous` is not a segment. There is no author key (B32, B73). `<build>` is the build id, which covers server code too (B84): a deploy that changes only server code rotates every key on purpose, so no page a previous server rendered is served by the new one; it pairs with the deploy runbook (plan 21 16.10, BUGS.md 176).

## createMemoryStore

```ts
createMemoryStore({ maxBytes? }): FlareStore
```

Two calls do not share entries (`memory.test.ts` `isolated`). The map lives for the process. A second instance does not see the first, which is the pitfall of constructing it inside a request.

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `maxBytes` | no | 50 MiB | a positive whole number of bytes | an LRU over each entry's size, the UTF-8 byte length of its JSON: a read makes an entry the most recent, a write past the bound evicts the least recent, and an entry larger than the bound is not stored. Epoch records are never counted or evicted (B147, BUGS.md 380) | a Workers isolate has 128 MB of memory, so a Workers app with a large live set lowers `maxBytes` or uses the Cache API store. Anything else throws | `server/cache/memory.test.ts` `lru bound` |

## createFilesystemStore

```ts
createFilesystemStore({ dir? })
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `dir` | no | `".flare/cache"` | a directory path | one file per key under that directory, named by the SHA-256 hex of the key, `epoch-` first for an epoch record. The record holds the key, and a mismatch is a miss | the default is relative to the process cwd. Production passes an absolute directory | `adapters/stores/fs/store.test.ts` `dir` |
| `maxBytes` | no | 1 GiB | a positive whole number of bytes | FIFO by write time: each pass of the expiry sweep lists the directory once, and past the bound removes the oldest-written records first, never an epoch. The directory can pass the bound by one pass's writes (B147, BUGS.md 380) | anything else throws | `adapters/stores/fs/store.test.ts` `bound` |

Keys `a/b` and `a_b` are two files (`no collision`). A key containing `\` throws and nothing is written (`backslash`). A key the filesystem would truncate throws (`long key`). The implementation does not shorten the name.

## fileAssets

```ts
fileAssets(root: string): (path: string) => Promise<Uint8Array | null>
```

`root` is required. A path that escapes `root` after decoding throws (`assets.test.ts` `escape`). A path inside `root` returns the bytes (`inside`). A missing file is `null` (`missing`). This function is not a `FlareStore`. It is the reader `createAssetsStore` calls on Node.

## createAssetsStore

Read-only `FlareStore` over the SSG seeds prerender wrote into the client output. `set`, `delete`, `deleteByKeys`, and `deleteByTags` reject with an error that says the store is read-only (`server/cache/assets.test.ts` `read only`).

```ts
createAssetsStore(read, { base? })
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `read` | yes | — | `(path: string) => Promise<Response \| Uint8Array \| null \| undefined>` | `get` calls `read` with the artifact path. `Uint8Array` is the file bytes. A `Response` that is ok is read as text. `null` and `undefined` are a miss | a `Response` that is not ok is a miss, and its body is cancelled. A throw from `read` propagates and is not kept. A missing file is a miss, not a 500. A seed never changes within a deploy, so the store keeps each key's read, hit or miss, for the 512 most recently read keys: a second `get` reads no file and parses nothing (`assets.test.ts` `kept reads`, plan 21 15.2) | `assets.test.ts` `workers read`, `node read`, `not ok` |
| `base` | no | `"/assets/_flare-static"` | a path that starts with `/` and does not end with `/` | the directory prefix. The default is the seeds' path inside the client output, `/<assetsDir>/_flare-static`, without Vite `base`, which `fileAssets` and the Workers assets binding read. A `read` that fetches seeds by their public URL passes that public prefix as `base` | a query, a hash, a trailing slash, or `..` throws when the store is created. Changing `flare({ assetsBase })` without passing the same prefix here makes every SSG `get` miss | `assets.test.ts` `custom base`, `bad base` |

Workers, where the binding is on `env`:

```ts
createServer({
  static: (env) => createAssetsStore((path) => env.ASSETS.fetch(new URL(path, "http://assets"))),
});
```

Node, where the files are on disk:

```ts
createServer({
  static: createAssetsStore(fileAssets(clientDir)),
});
```

`get` returns `null` without calling `read` when the key's build id is not the build that is running (`other build`). The path for a key `static:<build>:<tail>` is:

```
${base}/${build}/${sha256Hex(tail)}.json
```

`tail` is everything after `static:<build>:`. Hashing it keeps the name to one 64-character segment whatever the route id or param holds, and keeps two tails that differ only in case apart on a case-insensitive file system (APFS, NTFS), where a readable name would let one slug's seed overwrite another's. The seed JSON holds its `key`, and a seed whose key differs from the one asked for is a miss. `shared/cache/artifact-path.ts` is the only function that builds this path. Prerender writes the file there (`vite/prerender/artifacts.test.ts` `path`). The store does not format a path of its own.

A key `static:b:_root_/about` and the default base produce `/assets/_flare-static/b/<sha256 hex of _root_/about>.json` (`artifact-path.test.ts` `about`, `params`, `case`). The path is async, because it uses Web Crypto.

The JSON is `{ seed: true, key, renderedAt, tags, data }`. `data` is the value the write path stored. The entry returned from `get` is `{ data, tags, storedAt: renderedAt }`. JSON that does not parse, or a seed the checker refuses, is a miss and not a throw (`bad seed`). `storedAt` is `renderedAt` from the file. The store does not invent `0`.

`createWorkersHandler({ assets })` is a different mechanism. That binding serves an unmatched `GET` or `HEAD` (`adapters.md`). A route that matched is served from this store.

## createCacheApiStore

```ts
createCacheApiStore({ cacheName?, caches? })
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `cacheName` | no | `"flare"` | string | the name passed to `caches.open` | two names are two stores | `adapters/stores/cache-api/store.test.ts` `round trip` |
| `caches` | no | the global `caches` | `CacheStorage` | | tests pass a fake. Production omits it | same |

The implementation does not call `keys()` (`no list`). Tombstones live in the cache (`tombstone in cache`).

On Cloudflare the Cache API is local to the data center that handled the call. A tag delete clears that location only. Old deploys stay unreachable because the key contains the build id. A purge that must be global uses a store that replicates. That is why this store is not the only one.

## revalidate

```ts
revalidate({ keys?, tags? }): Promise<void>
createRevalidateFn(store): (options) => Promise<void>
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `keys` | one of `keys` or `tags` | — | `string[]` | a tombstone per key. A later `get` returns `{ data: { tombstone: true }, storedAt }` (B86) | an empty call, neither field, throws at the call. `revalidate` does not call `deleteByTags` | `server/cache/revalidate.test.ts` `empty` |
| `tags` | one of `keys` or `tags` | — | `string[]` | gets and sets `epoch:<tag>`, a number | | `epoch.test.ts` `tag purge` |

The handler's `revalidate` and `createRevalidateFn(store)` write the same store (`revalidate.test.ts` `same store`). The promise is handed to `waitUntil` (`background`).

A key purge names stored pages by key, and the server builds them: `server.cache.key({ to, params })` takes what `buildUrl` takes, writes that URL, and matches it as a request would, under the router's base path and trailing-slash rule, so it gives the key that page's requests store under, raw params percent-encoded as a request's are, on the build that serves (`server.buildId`). A queue consumer or a script next to the server then purges one page of the live build:

```ts
const purge = createRevalidateFn(store)
await purge({ keys: [server.cache.key({ to: "_root_/post/[slug]", params: { slug } })] })
```

An id the router has no page for throws. Tags stay the way to purge a set of pages, a page across its params included (`tests/integration/cache.test.ts` `key purge`, `server/cache/key.test.ts` `route key`, BUGS.md 231).

CDN purge is the `Cache-Tag` header on the response (`cache.md`). Flare does not call a CDN API.

These v0 fields do not exist: `tiers`, `callerData`, `cdnPurgeAdapter`, `tagHeader`, `revalidateSecret`. A cast throws when the options are read (`revalidate.test.ts` `no tiers`).

`POST /_flare/revalidate` does not exist. An external caller uses a route the app writes, and that route calls `revalidate()`: `cache.md` Purge from a webhook is the pattern, with the secret checked in constant time.
