# Third-party material

The root MIT license covers this project's original code and documentation.
Dependency packages retain their own licenses; see the pinned lockfile and each
package's license. No provider trademarks or API services are licensed here.

- The Sites build integration retains `build/sites-vite-plugin.LICENSE`.
- The vendored shadcn stylesheet and UI components retain their upstream terms;
  see `vendor/shadcn-tailwind-4.13.0.LICENSE.md` and https://github.com/shadcn-ui/ui.
- `tests/fixtures/public-pricing/` contains captured excerpts from first-party
  pricing documentation for parser regression testing. The factual price data
  and surrounding documentation retain their respective publishers' rights;
  these excerpts are not relicensed as project-authored MIT documentation.
  Source URLs appear in `lib/pricing-*.mjs` and `global-sources.json`.
- Google developer documentation excerpts are subject to the licenses indicated
  on their source pages (CC BY 4.0 text and Apache 2.0 code samples, except where
  otherwise noted): https://developers.google.com/site-policies.

The generated `lib/console-ui.mjs` includes bundled React and interface code;
source and applicable notices remain in this repository and its dependencies.
