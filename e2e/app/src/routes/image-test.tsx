import { Image } from "flare/image"
import { createPage } from "flare/page"

const loader = ({ quality, src, width }: { quality: number; src: string; width: number }) =>
	`${src}?w=${width}&q=${quality}`

export const route = createPage("_root_/image-test").render(() => (
	<main data-testid="image-test">
		<Image
			alt="Responsive basic"
			data-testid="img-responsive-basic"
			maxHeight={400}
			maxWidth={600}
			src="/photos/basic.jpg"
		/>
		<Image
			alt="Loader srcset"
			data-testid="img-loader-srcset"
			loader={loader}
			maxWidth={800}
			src="/photos/basic.jpg"
			widths={[400, 600, 800]}
		/>
	</main>
))
