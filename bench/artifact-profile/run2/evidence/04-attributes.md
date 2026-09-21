# Every attribute this interface uses

Counted over 3358 elements across the four states in `02-raw-dom.md`.
Nothing is filtered: this is the raw attribute census.

| attribute | elements | distinct values |
|---|---:|---:|
| `class` | 2256 | 139 |
| `transform` | 772 | 168 |
| `y` | 716 | 23 |
| `x` | 696 | 24 |
| `style` | 672 | 15 |
| `d` | 446 | 52 |
| `width` | 336 | 5 |
| `height` | 336 | 5 |
| `dy` | 252 | 2 |
| `paint-order` | 232 | 1 |
| `rx` | 232 | 1 |
| `ry` | 232 | 1 |
| `transform-origin` | 232 | 1 |
| `id` | 104 | 25 |
| `xmlns` | 96 | 1 |
| `viewBox` | 96 | 17 |
| `fill` | 90 | 24 |
| `version` | 72 | 1 |
| `xmlns:xlink` | 72 | 1 |
| `xml:space` | 72 | 1 |
| `xmlns:serif` | 72 | 1 |
| `href` | 52 | 12 |
| `type` | 40 | 5 |
| `stroke` | 24 | 1 |
| `rel` | 20 | 3 |
| `data-vite-dev-id` | 20 | 5 |
| `opacity` | 20 | 1 |
| `y2` | 20 | 1 |
| `name` | 16 | 4 |
| `cx` | 12 | 1 |
| `cy` | 12 | 1 |
| `r` | 12 | 1 |
| `placeholder` | 12 | 3 |
| `src` | 8 | 2 |
| `role` | 8 | 1 |
| `title` | 8 | 2 |
| `for` | 8 | 2 |
| `target` | 8 | 1 |
| `lang` | 4 | 1 |
| `charset` | 4 | 1 |
| `content` | 4 | 1 |
| `crossorigin` | 4 | 1 |
| `fill-rule` | 4 | 1 |
| `min` | 4 | 1 |
| `max` | 4 | 1 |
| `tabindex` | 4 | 1 |
| `font-size` | 4 | 1 |
| `font-family` | 4 | 1 |
| `text-anchor` | 4 | 1 |
| `spellcheck` | 4 | 1 |

The attributes that carry names rather than geometry:

- `id` — `app`, `popper-tooltip-top`, `popper-tooltip-bottom`, `icon-contour2`, `icon-point`, `icon-grid`, `icon-label3`, `checkbox-label`, `slider-label-num`, `icon-time2`, `icon-play-solid`, `icon-pause-solid`, `time-slider-middle-thumb`, `dataset-dialog`, … 11 more
- `class` — `stand-alone-page`, `mapview-page s-n1WHAIkRHwGF`, `popper-tooltip hidden s-n1WHAIkRHwGF`, `popper-content s-n1WHAIkRHwGF`, `popper-arrow s-n1WHAIkRHwGF`, `app-wrapper s-n1WHAIkRHwGF`, `main-app s-n1WHAIkRHwGF`, `main-app-container s-n1WHAIkRHwGF`, `embedding-wrapper s-ovhWPbaoO3ET`, `grab-blocker s-ovhWPbaoO3ET`, `embedding s-ovhWPbaoO3ET`, `top-svg s-ovhWPbaoO3ET`, `top-group`, `mouse-track-rect`, … 125 more
- `name` — `viewport`, `checkbox-label`, `label-num`, `search-query`
- `for` — `checkbox-label`, `slider-label-num`
- `placeholder` — `https://xxx.ndjson`, `https://xxx.json`, `Search WizMap Embeddings`
- `title` — `Window`, `Close`
- `role` — `tooltip`
- `type` — `module`, `text/css`, `checkbox`, `range`, `text`
- `href` — `/favicon.ico`, `/global.css`, `https://fonts.googleapis.com`, `https://fonts.gstatic.com`, `https://fonts.googleapis.com/css2?family…`, `./?dataset=diffusiondb`, `./?dataset=acl-abstracts`, `./?dataset=imdb`, `https://github.com/poloclub/wizmap#use-m…`, `https://arxiv.org/abs/2306.09328`, `https://github.com/poloclub/wizmap`, `https://youtu.be/8fJG87QVceQ`
- `tabindex` — `-1`

There is no `data-testid`, `data-test`, `data-cy`, `data-qa`, `data-e2e` or any
other test-harness attribute anywhere in this interface, and no
application-provided `data-…-id` either. The only `data-` attribute present is
`data-vite-dev-id`, which the development server puts on its injected
`<style>` tags; its value is an absolute file path.
