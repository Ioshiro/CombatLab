# DESIGN.md — Combat Lab

Same Knox AEBS teletype as Armory Lab. Combat Lab does not invent a second world.

## Tokens

- ground `#0c0f0c`, paper `#141810`, paper-2 `#1b2116`
- ink `#c4b48a`, ink-dim/sage `#8a9378`, amber `#d6a11a`, alarm `#c45c4a`, ghost `#4a4e3a`, line `#3a3f30`
- figure-ink `#e4d2a8`, figure-dim `#b49a6c`, figure-median `#e0b03a`, figure-alarm `#f08a78`
- IBM Plex Mono 400/500/600/700 self-hosted, 14px, −0.03em, tabular nums
- pressed cue: amber fill + 3px `#b88814` stripe
- sheets pad `0.85rem 1rem`; cut `1.35rem`; full viewport (no 1280 cap)
- one motion: 200ms `cubic-bezier(0.16, 1, 0.3, 1)`

## Surface

Header: `Combat.balance`. View and category cues carry label + pattern. Chart stage and tuning rail are detached thermal sheets. Heatmap is its own column, not a 220px strip beside copy.

## Figures

Traces keep dash + marker encoding. Hue is allowed to spread so overlapping tier-build series (weapon skill + strength) stay separable on the dark ground: teal, steel, paper, gold, copper, salmon, alarm, lilac, lime, amber, sky. Heatmap cells use the same inks plus hatch for fail states.

## Refuse

Kickers as eyebrows, KPI-hero cards, rounded pills, shadows, a second typeface, compressing charts below print width, rainbow SaaS palettes that ignore the Knox ground.
