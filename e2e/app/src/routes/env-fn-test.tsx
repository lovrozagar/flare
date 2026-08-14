import { createClientOnlyFn } from "flare/client-only"
import { createIsomorphicFn } from "flare/isomorphic"
import { createPage } from "flare/page"
import { createServerOnlyFn } from "flare/server-only"
import { createSignal, onMount } from "solid-js"

const getServerSecret = createServerOnlyFn(() => "server-secret-42")

const getEnvLabel = createIsomorphicFn()
	.server(() => "rendered-on-server")
	.client(() => "rendered-on-client")

const getClientMark = createClientOnlyFn(() => "client-only-mark")

export const route = createPage("_root_/env-fn-test")
	.loader(() => ({
		envLabel: getEnvLabel(),
		secret: getServerSecret(),
	}))
	.render((props) => {
		const [clientMark, setClientMark] = createSignal("")
		const [liveEnv, setLiveEnv] = createSignal("")

		onMount(() => {
			setClientMark(getClientMark())
			setLiveEnv(getEnvLabel())
		})

		return (
			<main data-testid="env-fn-test">
				<p data-testid="server-data">{props.loaderData.secret}</p>
				<p data-testid="loader-env">{props.loaderData.envLabel}</p>
				<p data-testid="client-mark">{clientMark()}</p>
				<p data-testid="live-env">{liveEnv()}</p>
			</main>
		)
	})
