# /public/fonts

Web fonts used by the Report Design modal's live preview. Loaded via
`src/styles/report-fonts.css`, referenced by URL `/fonts/*.woff2`.

**Not the same fonts as the exported PDF.** The Chromium container that
renders PDFs picks fonts through fontconfig, not `@font-face`. Both
stacks must resolve to the same face — see
`../../Centriton/templates/reports/default/README.md` for the container
install.

All twelve files are OFL-licensed and pulled from Fontsource's
jsdelivr mirror. Each URL is stable and versioned; re-run the fetch
below to re-pull:

```
cd Centrion_Frontend/public/fonts
for pair in \
  "inter@5/files/inter-latin-400-normal.woff2:inter-regular.woff2" \
  "inter@5/files/inter-latin-700-normal.woff2:inter-bold.woff2" \
  "ibm-plex-sans@5/files/ibm-plex-sans-latin-400-normal.woff2:ibm-plex-sans-regular.woff2" \
  "ibm-plex-sans@5/files/ibm-plex-sans-latin-700-normal.woff2:ibm-plex-sans-bold.woff2" \
  "lato@5/files/lato-latin-400-normal.woff2:lato-regular.woff2" \
  "lato@5/files/lato-latin-700-normal.woff2:lato-bold.woff2" \
  "source-serif-4@5/files/source-serif-4-latin-400-normal.woff2:source-serif-4-regular.woff2" \
  "source-serif-4@5/files/source-serif-4-latin-700-normal.woff2:source-serif-4-bold.woff2" \
  "merriweather@5/files/merriweather-latin-400-normal.woff2:merriweather-regular.woff2" \
  "merriweather@5/files/merriweather-latin-700-normal.woff2:merriweather-bold.woff2" \
  "libre-baskerville@5/files/libre-baskerville-latin-400-normal.woff2:libre-baskerville-regular.woff2" \
  "libre-baskerville@5/files/libre-baskerville-latin-700-normal.woff2:libre-baskerville-bold.woff2" \
; do
  src="${pair%%:*}"; dst="${pair##*:}"
  curl -fsSL -o "$dst" "https://cdn.jsdelivr.net/npm/@fontsource/${src}"
done
```
