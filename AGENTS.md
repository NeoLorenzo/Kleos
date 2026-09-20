# AGENTS.md

## Repository role

Kleos is a Fabbro Systems product. It owns evidence-based current-state modeling and its domain-specific application interface.

## Fabbro Design System adoption

Kleos currently adopts **Fabbro Design System 0.1.2**.

The local upstream snapshot lives in `fabbro-design/`.

For shared visual decisions, precedence is:

1. approved assets in `fabbro-design/assets/`
2. machine-readable values in `fabbro-design/core.json` and `fabbro-design/product.json`
3. `fabbro-design/fabbro-tokens.css`
4. Kleos application implementation

Do not independently redefine family-level branding in Kleos.

## Canonical Kleos identity

- Product: Kleos
- Symbol: Radiance
- Core idea: Recognition
- Accent: `#CB30E0`
- Shared type family: Inter
- Shared neutral field: black / white Fabbro system

## Shared versus local ownership

Kleos must consume the Fabbro source for:

- product accent
- family typography
- shared neutral colors
- shared spacing/radius/control tokens where applicable
- Kleos product mark and lockup
- Fabbro Systems mark
- shared motion primitives

Kleos may define locally:

- evidence and assessment workflows
- vector/state visualizations
- tables and dense information layouts
- domain semantic colors such as success, warning, error, and chart-series colors
- product-specific information architecture and interaction patterns

Do not force the Fabbro public marketing shell onto the authenticated Kleos application.

## Change workflow

When a shared design decision changes:

1. update and version it in Fabbro Systems first;
2. sync the new snapshot into `fabbro-design/`;
3. update any deployment copies under `public/brand/`;
4. update the Kleos adaptation layer only as needed;
5. update the adopted version and branding contract tests;
6. run `npm test`, privacy validation, and the static build.

Do not edit the local Fabbro snapshot as the origin of a new family-level decision.
