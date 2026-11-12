# Perception

An open online book on perception for robots, from the PRAISe Lab at CU Boulder. Published at https://perception.praisecu.com.

Built with [Quarto](https://quarto.org). Every push to `main` rebuilds and publishes the book through GitHub Actions.

## Writing

| Task | How |
|---|---|
| Add a chapter | Create `chapters/name.qmd` starting with `# Title {#sec-name}`, then list it under `chapters:` in `_quarto.yml` |
| Reorder chapters | Move the lines under `chapters:` in `_quarto.yml` |
| Add a part | Add `- part: "Name"` with its own `chapters:` list in `_quarto.yml` |
| Cross-reference | `@sec-edges` links to the chapter with `{#sec-edges}` |
| Equation | `$...$` inline, `$$...$$` on its own line |
| Editable Python | A ` ```{pyodide} ` code block. In the chapter's front matter set `engine: markdown` and list packages such as `opencv-python` under `pyodide: packages:` (see `chapters/images.qmd`) |
| Live webcam demo | `{{< include ../demos/_canny.qmd >}}`; see "Adding a live demo" below |

## Preview locally

```
quarto preview
```

## Adding a live demo

Each demo has two files in `demos/`:

- `_name.qmd`: the markup (video, canvas, sliders) inside a ` ```{=html} ` block, plus `<script>` tags for `opencv-loader.js` and the demo script.
- `name.js`: the processing loop. Call `await window.loadOpenCV()` to get `cv`, then read frames with `cv.VideoCapture` and draw with `cv.imshow`.

Copy `_canny.qmd` and `canny.js` as a starting point and give the new demo its own element id.
