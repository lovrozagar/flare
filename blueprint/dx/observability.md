# Observability

What a Flare server reports about itself: log lines, errors, a request log, a request id, traces, and the dev log bridge. **Planned (plan 15), not in v1.** `ServerOptions` has no `logger`, `onError`, `requestLog`, or `tracer` key, so passing one is a type error, and `createServer` given one anyway, from JavaScript or through a cast, throws `createServer: <key> is planned (dx/observability.md) and not in v1` instead of ignoring it (`create-input.test.ts` `planned options`, BUGS.md 113, 216). Every option below is a `createServer` option except `devLogs`, which is a `flare()` option (`plugin.md`). Core imports no logging or tracing package (B98, B99, B100).

```ts
createServer({ router, logger?, onError?, requestLog?, tracer?, trustProxy? })
flare({ devLogs? })
```

| prop | required | default | accepts | outcome | pitfall | test |
| --- | --- | --- | --- | --- | --- | --- |
| `logger` | no | `createLogger()` | a `Logger`, or `false` | every server-side line Flare writes, and every `ctx.log` and `log()` line, goes to it, one child per request | `false` makes `ctx.log` and `log()` no-ops and drops Flare's lines. A logger method that throws is caught, and that line is lost | `server/observe/logger.test.ts` `custom logger`, `logger false`, `sink throws` |
| `onError` | no | absent | `(report: ErrorReport) => void \| Promise<void>` | called once for every server error, whatever the logger | a returned promise goes to `waitUntil` and is never awaited before the response. A throw or rejection is logged once at `error` and never calls `onError` again | `server/observe/on-error.test.ts` `once`, `async`, `throws` |
| `requestLog` | no | `false` | `true`, or `{ skip?(entry): boolean }` | one `info` line per request after its body ends | `requestLog` with `logger: false` throws at `createServer` and names both options | `server/observe/request-log.test.ts` `on`, `skip`, `off by default`; `create.test.ts` `request log without logger` |
| `tracer` | no | absent | a `Tracer` (Tracing below) | one span tree per request | absent means no span object is created | `server/observe/trace.test.ts` `no tracer` |
| `trustProxy` | no | `0` | `server.md` | also decides whether an incoming `x-request-id` or `traceparent` is trusted (Request id, Tracing) | | `request-id.test.ts` `trusted reuse`, `untrusted ignored` |

## Logger

```ts
type Logger = {
  trace(fields: LogFields | string, message?: string): void; // also debug, info, warn, error, fatal
  child(bindings: Partial<LogFields>): Logger;
};
```

The shape is pino's: a method takes a fields object then a message, or a message alone. A pino instance is a `Logger` as is. A request's child has `requestId`, `method`, `path`, and, once matched, `routeId` bound. `ctx.log` on the loader, preloader, `authorize`, `.response()`, server-function handler and stream, and middleware contexts is that child. `log()` from `@lovrozagar/flare/server` returns it, and throws outside a request as `serverCtx()` does (`logger.test.ts` `request child`, `ctx log`, `log outside`).

`createLogger({ level?, format? })` builds the default logger. `level` is `trace`, `debug`, `info`, `warn`, `error`, `fatal`, or `silent`. The default is `debug` in dev and `info` in production. `format` is `pretty` or `json`. The default is `pretty` in dev and `json` in production. `json` writes one JSON object per line: `time` (ISO), `level` (the name), `msg`, then the fields. `pretty` writes `HH:MM:SS LEVEL [tag] msg key=value`, colored only when the output is a terminal. Below the level, nothing is built: a field getter is never read (`logger.test.ts` `levels`, `format json`, `format pretty`, `defaults`). `createServer` has no `logLevel` (B89). An app that wants the default sink at another level passes `logger: createLogger({ level: "warn" })`.

On Workers, `json` writes the object itself with `console.log`, so Workers Logs indexes its fields (verified on workerd in `logger.test.ts` `workers object`).

## LogFields

Every line Flare writes has `tag` and, inside a request, the request child's bindings. The fields are plain data. No field holds pre-formatted text.

| field | when | value |
| --- | --- | --- |
| `tag` | always | the area: `render`, `loader`, `server-fn`, `middleware`, `cache`, `store`, `query`, `request`, `adapter`, `prerender`, `seo`, `dev` |
| `requestId` | inside a request | Request id below |
| `method` | inside a request | the request method |
| `path` | inside a request | the canonical pathname, never the query |
| `routeId` | once matched | the route id, not the URL |
| `phase` | an error | `ErrorReport.phase` |
| `status` | a response or an error | the HTTP status |
| `digest` | a bug | the 12-hex digest B93 makes |
| `error` | an error | `{ name, message, stack }`, also in production (B76 revised) |
| `durationMs` | the request log and spans | one measurement per request |
| `cache` | the request log | `hit`, `stale`, `miss`, `bypass`, or `none` |

## Request id

Every request has an id, set before middleware runs and echoed as the response header `x-request-id` on every answer, errors and mounts included (`request-id.test.ts` `echoed`).

1. With a tracer and a trusted `traceparent` (Tracing below), the id is the trace id.
2. Otherwise, with `trustProxy` of at least 1 and an incoming `x-request-id` that matches `^[\w.:+/=-]{1,128}$`, the id is that value.
3. Otherwise, with a tracer, the id is the new trace's id.
4. Otherwise it is `crypto.randomUUID()`.

An incoming value that fails the pattern, or arrives with `trustProxy` 0, is ignored, so a client never writes text into the logs or picks the id (`request-id.test.ts` `generated`, `trusted reuse`, `untrusted ignored`, `unsafe replaced`, `trace id wins`). `requestId()` from `@lovrozagar/flare/server` returns it, and throws outside a request.

## onError

```ts
type ErrorReport = {
  error: unknown;
  request: Request;
  requestId: string;
  routeId: string | undefined;
  phase: "middleware" | "authenticate" | "preloader" | "authorize" | "loader" | "head" | "headers" | "render" | "deferred" | "server-fn" | "response" | "background" | "store";
  digest: string;
  status: number;
};
```

It receives the error the app threw, with its stack, in dev and in production. A named status (`notFound()`, `unauthenticated()`, `unauthorized()`, `redirect()`, an input failure) is not an error and does not call it. A thrown `markSafeError` does. Each bug calls it exactly once, even when the same error is also logged and painted by `errorRender` (`on-error.test.ts` one case per phase). The error never reaches the client through this hook. What the client receives is unchanged (B76).

## Request log

With `requestLog`, the request's child writes one `info` line, with message `request`, when the body ends or the client disconnects. Its fields: `method`, `path`, `status` (or `aborted`), `durationMs`, `routeId`, `kind` (`document`, `data`, `prefetch`, `fill`, `server-fn`, `mount`, `static`, `asset`), `cache`, `bytes` when known, `requestId`, and `runtime` (`node`, `bun`, `workers`). `skip(entry)` returning `true` drops the line. The duration is the root span's, when a tracer is set (`request-log.test.ts` `on`, `aborted`, `skip`, `one duration`).

## Tracing

```ts
type Tracer = {
  startSpan(name: string, attributes: Record<string, string | number | boolean>, parent?: Span, link?: SpanContext): Span;
  run?<T>(span: Span, fn: () => T): T;
  extract?(traceparent: string): SpanContext | undefined;
};
type Span = {
  context(): SpanContext;
  isRecording(): boolean;
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: "ok" | "error" | "aborted"): void;
  recordException(error: unknown): void;
  end(): void;
};
```

Flare passes each span's parent explicitly. It does not depend on an async context manager, which Workers lacks. `run(span, fn)` is called around loaders, preloaders, the render, and server-function handlers, so app instrumentation that reads the active context nests under Flare's span. A span whose `isRecording()` is `false` gets no attributes built.

| span | parent | attributes |
| --- | --- | --- |
| `http.request` | the trusted incoming context, or none | `http.request.method`, `url.path`, `http.route` (the route id), `http.response.status_code`, `flare.kind`, `flare.cache`, `flare.request_id` |
| `flare.middleware` | `http.request` | `flare.middleware.index` |
| `flare.auth` | `http.request` | `flare.route_id` |
| `flare.loader` | `http.request`, one per match | `flare.route_id`, `flare.phase` (`preloader` or `loader`) |
| `flare.render` | `http.request` | `flare.route_id` |
| `flare.defer` | `flare.render`, one per deferred key | `flare.defer.key` |
| `flare.server_fn` | `http.request` | `flare.fn.name` |
| `flare.store` | the span that read or wrote | `flare.store.op` (`get`, `put`, `delete`), `flare.store.hit` |

A stored hit has `http.request` and `flare.store` only. An error sets that span's status to `error` and records the exception. In production the recorded message is the digest, not the thrown message. A client disconnect ends the root with `aborted`. The root ends when the body ends, not when the headers leave (`trace.test.ts` `tree`, `parents`, `hit`, `error`, `aborted`, `streamed end`).

`traceparent` is read only with a tracer that has `extract`. With `trustProxy` of at least 1, a valid value is the root's parent. With `trustProxy` 0, a valid value becomes a link on a new root trace, the OTel rule for an untrusted boundary. An invalid value is ignored (`trace.test.ts` `trusted parent`, `untrusted link`, `invalid`). A `proxy` mount forwards `traceparent` for the current span (`trace.test.ts` `proxy forwards`).

`@lovrozagar/flare/otel` exports `otelTracer(tracer)`, which maps this interface onto `@opentelemetry/api` (an optional peer). Importing it without that package throws at import, with the install command in the message (`otel.test.ts` `maps`, `missing peer`).

## Dev log bridge

Only `vite dev` has it. A production bundle contains no bridge code (`log-bridge.test.ts` `prod empty`).

| direction | what | how | shown as |
| --- | --- | --- | --- |
| server to browser | every line a request's child writes, Flare's and the app's | the hot channel event `flare:log` with the request id, the level, the message, the fields, and for app lines `file:line` | the browser console at the same level, prefixed `[server]` and `file:line`, only in the tab that made the request, routed by the dev tab token `plugin.md` defines for the overlay |
| browser to server | `console.warn`, `console.error`, a `window` `error`, and an `unhandledrejection` | the hot channel event `flare:client-log` | the terminal through Vite's logger, prefixed `[browser]` with the page path |

The bridge reads lines before the app's logger, so it works with a custom logger and with `logger: false`. It does not use the NDJSON wire (B6). `flare({ devLogs })` is `{ server?: boolean, browser?: false | "error" | "warn" | "all" }`, default `{ server: true, browser: "warn" }` (`plugin.md`).

## Configuration matrix

Each option is independent. The rules that join them:

| when | then | test |
| --- | --- | --- |
| `logger: false` | `ctx.log` and `log()` exist and do nothing. `onError` still fires. The dev bridge still shows lines. The request id is still set and echoed | `observability-matrix.test.ts` |
| `logger: false` and `requestLog` | `createServer` throws and names both | `create.test.ts` `request log without logger` |
| a logger whose level drops `error` | `onError` still fires | matrix |
| `onError` and a logger | the error is logged and reported, once each | matrix |
| no tracer | `traceparent` does not set the request id, and no span exists | matrix |
| a tracer and `trustProxy` 0 | an incoming trace is linked, not continued, and the request id is the new trace id | matrix |
| `requestLog` and a tracer | one duration for both | matrix |

`tests/integration/observability-matrix.test.ts` runs every combination of `logger` (default, custom, `false`), `onError` (absent, present), `requestLog` (off, on), `tracer` (absent, present), and `trustProxy` (0, 1), in dev and production: 96 cases, in process. Each serves a document, a data request, a server-function call, a loader bug, and a stored hit. In every case the status and body equal the unconfigured server's, nothing throws or rejects unhandled, `x-request-id` is present and matches the pattern, each line reaches the sink these rules name, `onError` fires once per bug, the span set matches, and Privacy holds.

## Privacy

No log field and no span attribute holds a cookie, an `Authorization` value, a `Set-Cookie` value, a query string, a request body, or a server-function input. Paths are logged without the query. Spans and route series are named by route id, never by raw path. `onError` receives the request object itself, because the app reports from it. The app's own logger receives only the fields above (`privacy.test.ts` `no cookie`, `no query`, `no body`, `no fn input`).

## Silent failures

No error Flare catches is dropped without a report. A catch either logs one `warn` or `error` line with its `tag` (and calls `onError` when it is a server error), or carries a comment naming who reports that error instead. The classified list is in `bits/16-observability.md` (`silent.test.ts`).

## Performance

`scripts/bench-observe.ts` serves the minimal app's `/` 10,000 times in process in four configurations: nothing configured, a logger at `info`, a logger with the request log, and a logger with a no-op tracer. Nothing configured stays within 2% of the throughput before plan 15. A regression past that fails the gate.
