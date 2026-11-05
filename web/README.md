# DICE-2013R explorer (web)

An interactive browser version of DICE-2013R. Change an assumption (discounting,
climate sensitivity, damages, abatement costs, growth, a temperature cap) and the
optimal policy and the "no new policy" baseline are re-solved in the browser.
No server is involved.

## Run

```bash
cd web
npm install
npm run dev          # http://localhost:5173
npm run build        # static site in dist/ (relative paths, so it can be hosted anywhere, e.g. GitHub Pages)
```

## Test

```bash
npm test             # ~480 unit tests (Vitest), ~5 s
npm run check        # TypeScript + Svelte type check
npm run test:e2e     # 12 browser tests (Playwright; builds and serves the app)
```

## How it works

| File | Role |
|---|---|
| `src/lib/dice/params.ts` | Parameters (same names as GAMS and the Python reference) |
| `src/lib/dice/exogenous.ts`, `equations.ts`, `simulate.ts` | Line-by-line port of the model, given control paths |
| `src/lib/dice/adjoint.ts` | Exact gradient of welfare with respect to every control (reverse pass) |
| `src/lib/dice/lbfgsb.ts`, `newton.ts` | Box-constrained optimizers: projected L-BFGS warm-up, then projected Newton |
| `src/lib/dice/solve.ts` | Optimal and baseline (Hotelling) runs, state constraints (augmented Lagrangian), SCC |
| `src/lib/ui/*`, `src/components/*`, `src/App.svelte` | Controls, charts, table, CSV, URL state |
| `src/lib/worker.ts` | Web Worker that runs the solver off the main thread |

The optimization picks the emissions control rate and savings rate in each
period, about 110 numbers. Everything else follows by simulation. A cold solve
takes ~40 ms. A re-solve after a slider move starts from the previous solution
and takes ~5–10 ms (3 Newton iterations). The page solves both the optimal and
the baseline run on every change.

## Accuracy

The tests compare against three references:

- **GAMS** (solutions embedded in `models/excel/DICE2013R.xlsm`, extracted to
  `reference/`): the optimal, baseline, 2 °C-limit and Stern runs match to
  about 1e-7 relative, and welfare to 1e-10.
- **Python/Ipopt** (`python/`): fixtures in `test/fixtures/` cover several
  parameter sets. Simulations match to 1e-12; optimal and baseline solutions
  and the SCC match to 2e-6.
- **Finite differences**: the gradient is checked component by component.

See `python/README.md` for the GAMS quirks found along the way. The main one:
the SCC printed in the Excel sheets uses output rather than consumption as
numeraire. The two differ only in the last 10 periods. The app shows the vanilla
(consumption) definition.

Regenerate the fixtures after changing the Python model:
`cd python && python scripts/make_web_fixtures.py`.

## Known limits

- In the final period (2305) the control rate has no future benefit. The
  optimum sits on a flat stretch near zero, so the period-2305 control rate,
  emissions and carbon price are not meaningful. Charts default to 2200.
- A temperature cap below what inertia allows (around 1.5 °C or less) cannot be
  met. The app says so and shows the closest feasible path.
- With very steep damages the baseline's output turns negative, and the model
  has no solution there. The app reports this and shows only the optimal run.
