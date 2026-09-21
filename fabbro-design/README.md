# Adopted Fabbro Design System

Kleos consumes a local snapshot of the canonical Fabbro Design System.

**Adopted version:** 0.3.0  
**Upstream:** `NeoLorenzo/Fabbro-Systems/design-system`

## Rules

- Treat this directory as an upstream snapshot, not a place for Kleos-specific design decisions.
- Do not edit canonical tokens or approved assets locally to make Kleos look different.
- Shared family-level changes must be made in Fabbro Systems first, versioned there, then synced here explicitly.
- Kleos may extend the system for domain-specific workflows, data visualizations, semantic states, and dense application UI.
- Public/deployment copies of approved assets under `public/brand/` must remain byte-identical to the matching snapshot assets where applicable.
- Authenticated product navigation uses the standalone Fabbro Systems mark only for family endorsement; visible family text and wordmark lockups are not allowed in that slot.
- Authenticated desktop primary navigation uses canonical Fabbro Application Sidebar 1.0.0; top/right regions remain secondary utility surfaces.
- React consumers must use the vendored canonical source under `components/application-sidebar/react/` unchanged.

## Snapshot contents

- `VERSION` — adopted Fabbro Design System version
- `core.json` — canonical shared tokens
- `product.json` — canonical Kleos identity tokens
- `fabbro-tokens.css` — framework-agnostic CSS variables
- `assets/` — approved production SVGs used by Kleos
- `components/application-sidebar/` — canonical Application Sidebar 1.0.0 contract and React source
- `components/public-shell/` — canonical Public Shell 1.0.0 framework-agnostic contract
