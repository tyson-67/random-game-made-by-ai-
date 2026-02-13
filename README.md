# Mini Motorsport (Web Prototype)

This repository now contains a playable **time-trial racing MVP** for the long-term motorsport plan.

## Current playable scope

- One car
- One track
- One mode: Time Trial
- Currency reward based on lap time
- Basic upgrades:
  - Engine (+acceleration, +top speed)
  - Tires (+grip, +turn rate)
  - Brakes (+stability under braking)

## Controls

- `W` / `Arrow Up`: throttle
- `S` / `Arrow Down`: brake / reverse
- `A` / `Arrow Left`: steer left
- `D` / `Arrow Right`: steer right

## Run locally

You can open `index.html` directly, or run a static server:

```bash
python3 -m http.server 4173
```

Then visit <http://localhost:4173>.

## Planned next milestones

1. Circuit races with up to 3 AI cars
2. Drift zone scoring mode
3. Deeper tuning system
4. Lightweight adaptive AI (pace-based target lap updates)
