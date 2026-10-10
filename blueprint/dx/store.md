# Stores and revalidate

## FlareStore

`createServer({ store })` and `createServer({ static })` both take this interface. `static` is read. A `put` on that object is never called (`server.md`).

| method | required | outcome | pitfall | test |
| --- | --- | --- | --- | --- |
| `get(key)` | yes | `FlareStoreEntry` or `null` | a miss is `null`, not a throw | `server/cache/memory.test.ts` `round trip` |
| `set(key, entry, ttl?)` | yes | stores the entry. `ttl` is milliseconds | the framework passes `ttl`. An implementation that ignores it keeps the entry forever, which is the bug `ttl` exists to close | `server/cache/write.test.ts` `ssr ttl` |
| `delete(key)` | yes | on a mutable store, writes a tombstone for that key. A later `get` returns `{ data: { tombstone: true }, storedAt }`, not null. The cache layer does not serve it | the assets store rejects `delete`. SSG reads that store and ignores tombstones | `server/cache/tombstone.test.ts` `delete writes`, `key purge` |
| `deleteByTags(tags)` | yes | not called by `revalidate`. A tag purge gets and sets `epoch:<tag>`, a number | a store that lists every key is wrong on Cache API. There is no tag index | `server/cache/epoch.test.ts` `tag purge` |
| `deleteByKeys(keys)` | no | batch delete. Absent: the framework calls `delete` per key | | `epoch.test.ts` `get cost` |

`FlareStoreEntry` is `{ data, storedAt: number, tags?: string[] }`. `storedAt` is milliseconds. The framework sets it. An implementation does not invent a second timestamp.

The key is built by the framework: `static:<build>:<routeId>:<rawParams>`. There is no identity class in the key. The policy class `anonymous` is not a segment. There is no author key (B32, B73).

## createMemoryStore

```ts
createMemoryStore(): FlareStore
```

No arguments. Two calls do not share entries (`memory.test.ts` `isolated`). The map lives for the process. A second instance does not see the first, which is the pitfall of constructing it inside a request.

## createFilesystemStore

```ts
createFilesystemStore({ dir? })
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `dir` | no | `".flare/cache"` | a directory path | one file per key under that directory | the default is relative to the process cwd. Production passes an absolute directory | `adapters/stores/fs/store.test.ts` `dir` |

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
| `read` | yes | — | `(path: string) => Promise<Response \| Uint8Array \| null \| undefined>` | `get` calls `read` with the artifact path. `Uint8Array` is the file bytes. A `Response` that is ok is read as text. `null` and `undefined` are a miss | a `Response` that is not ok is a miss, and its body is cancelled. A throw from `read` propagates. A missing file is a miss, not a 500 | `assets.test.ts` `workers read`, `node read`, `not ok` |
| `base` | no | `"/assets/_flare-static"` | a path that starts with `/` and does not end with `/` | the directory prefix | a query, a hash, a trailing slash, or `..` throws when the store is created. Changing `flare({ assetsBase })` without passing the same prefix here makes every SSG `get` miss | `assets.test.ts` `custom base`, `bad base` |

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
${base}/${build}/${encodeURIComponent(tail)}.json
```

`tail` is everything after `static:<build>:`. Encoding it keeps a route id that contains `/` inside one path segment. `shared/cache/artifact-path.ts` is the only function that builds this path. Prerender writes the file there (`vite/prerender/artifacts.test.ts` `path`). The store does not format a path of its own.

A key `static:b:_root_/about` and the default base produce `/assets/_flare-static/b/_root_%2Fabout.json` (`artifact-path.test.ts` `about`). A key `static:b:home:042` produces `/assets/_flare-static/b/home%3A042.json` (`params`).

The JSON is `{ seed: true, renderedAt, tags, data }`. `data` is the value the write path stored. The entry returned from `get` is `{ data, tags, storedAt: renderedAt }`. JSON that does not parse, or a seed the checker refuses, is a miss and not a throw (`bad seed`). `storedAt` is `renderedAt` from the file. The store does not invent `0`.

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

CDN purge is the `Cache-Tag` header on the response (`cache.md`). Flare does not call a CDN API.

These v0 fields do not exist: `tiers`, `callerData`, `cdnPurgeAdapter`, `tagHeader`, `revalidateSecret`. A cast throws when the options are read (`revalidate.test.ts` `no tiers`).

`POST /_flare/revalidate` does not exist. An external caller uses a route the app writes, and that route calls `revalidate()`.
