import { createPage } from "flare/page"
import { Image } from "flare/image"
import hero from "../assets/test-hero.jpg"

export const route = createPage("_root_/static-image-test").render(() => (
	<div data-testid="static-image-test">
		{/* Static responsive — auto dimensions + blur */}
		<Image alt="Static hero" data-testid="img-static-responsive" src={hero} />

		{/* Static with maxWidth override */}
		<Image
			alt="Static constrained"
			data-testid="img-static-constrained"
			maxWidth={100}
			src={hero}
		/>

		{/* Static fill mode */}
		<div
			data-testid="fill-container"
			style={{ "height": "300px", "position": "relative", "width": "400px" }}
		>
			<Image alt="Static fill" data-testid="img-static-fill" fill src={hero} />
		</div>

		{/* Static with no blur */}
		<Image alt="Static no blur" data-testid="img-static-no-blur" placeholder="none" src={hero} />

		{/* Debug: raw data */}
		<pre data-testid="static-data">{JSON.stringify(hero, null, 2)}</pre>
	</div>
))
