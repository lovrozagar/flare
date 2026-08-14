import { createClient } from "flare/client"
import { getQueryClient } from "./query-client"
import { router } from "./router"

const w = window as unknown as Record<string, unknown>

createClient(() => router).onReady((ctx) => {
	w.__flareNavigate = (to: string, opts?: Record<string, unknown>) =>
		ctx.navigate({ to, ...opts })
	w.__flareNavigationPhase = () => ctx.navigationPhase()
	w.__flareInvalidate = (opts?: Record<string, unknown>) => ctx.invalidate(opts)
	w.__flareQueryClient = getQueryClient()
})
