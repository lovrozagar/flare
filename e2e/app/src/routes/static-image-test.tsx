import { Image } from "flare/image"
import { createPage } from "flare/page"
import hero from "../assets/test-hero.jpg"

export const route = createPage("_root_/static-image-test").render(() => (
	<main data-testid="static-image-test">
		<Image alt="Static hero" data-testid="img-static-responsive" src={hero} />
		<Image
			alt="Static constrained"
			data-testid="img-static-constrained"
			maxWidth={100}
			src={hero}
		/>
		<Image alt="Static no blur" data-testid="img-static-no-blur" placeholder="none" src={hero} />
		<pre data-testid="static-data">{JSON.stringify(hero, null, 2)}</pre>
	</main>
))
