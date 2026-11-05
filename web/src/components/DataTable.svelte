<script lang="ts">
  import { VARIABLES, variable, type SeriesSource } from "../lib/ui/variables";

  let { sources, horizon }: { sources: SeriesSource[]; horizon: number } = $props();
  let varId = $state("TATM");

  const v = $derived(variable(varId));
  const live = $derived(sources.filter((s) => s.sol));
  const cols = $derived(live.map((s) => v.get(s.sol!)));
  const years = $derived(live.length ? Array.from(live[0].sol!.exogenous.year).filter((y) => y <= horizon) : []);
</script>

<div class="wrap">
  <label>
    Variable
    <select bind:value={varId} data-testid="table-variable">
      {#each VARIABLES as opt}
        <option value={opt.id}>{opt.label}</option>
      {/each}
    </select>
  </label>
  <span class="unit">{v.unit}</span>
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th scope="col">Year</th>
          {#each live as s}<th scope="col">{s.label}</th>{/each}
        </tr>
      </thead>
      <tbody>
        {#each years as y, i}
          <tr>
            <th scope="row">{y}</th>
            {#each cols as c}<td>{Number.isFinite(c[i]) ? v.format(c[i]) : "–"}</td>{/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .wrap { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
  label { display: flex; gap: 8px; align-items: center; }
  .unit { color: var(--text-muted); font-size: 13px; }
  .scroll { width: 100%; max-height: 420px; overflow: auto; border: 1px solid var(--border); border-radius: 8px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; font-variant-numeric: tabular-nums; }
  th, td { padding: 4px 10px; text-align: right; border-bottom: 1px solid var(--grid); white-space: nowrap; }
  thead th { position: sticky; top: 0; background: var(--surface-2); font-weight: 600; color: var(--text-secondary); }
  tbody th { font-weight: 500; color: var(--text-secondary); }
</style>
