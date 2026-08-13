import { createServer } from "flare/server"
import { router } from "./router"

export default createServer(router).serverContext(({ request }) => {
	const url = new URL(request.url)
	return {
		origin: url.origin,
		pathname: url.pathname,
		requestId: crypto.randomUUID(),
		timestamp: Date.now(),
	}
})
