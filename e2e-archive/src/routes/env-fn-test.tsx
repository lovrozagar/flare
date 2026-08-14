import { createPage } from "flare/page"
import { createClientOnlyFn } from "flare/client-only"
import { createIsomorphicFn } from "flare/isomorphic"
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
			<div data-testid="env-fn-test">
				<div data-testid="server-data">{props.loaderData.secret}</div>
				<div data-testid="loader-env">{props.loaderData.envLabel}</div>
				<div data-testid="client-mark">{clientMark()}</div>
				<div data-testid="live-env">{liveEnv()}</div>
			</div>
		)
	})
