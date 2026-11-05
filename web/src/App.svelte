<script lang="ts">
  import { onMount } from "svelte";
  import ControlSlider from "./components/ControlSlider.svelte";
  import DataTable from "./components/DataTable.svelte";
  import LineChart from "./components/LineChart.svelte";
  import StatTile from "./components/StatTile.svelte";
  import { DEFAULT, type Params } from "./lib/dice/params";
  import { CAP_CONTROL, CONTROLS, GROUPS, NO_CAP } from "./lib/ui/controls";
  import type { Results } from "./lib/ui/session";
  import { SolverClient } from "./lib/ui/solver-client";
  import { consumptionEquivalent, summarize } from "./lib/ui/summary";
  import { decodeParams, encodeParams } from "./lib/ui/url";
  import { CHART_VARIABLES, toCsv, variable, type SeriesSource } from "./lib/ui/variables";
  import SolverWorker from "./lib/worker?worker";

  const initial = decodeParams(location.search);
  let params = $state<Params>(initial);
  let capValue = $state(initial.tatm_up < NO_CAP ? initial.tatm_up : 2);
  let results = $state<Results | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let horizon = $state(2200);
  let hoverIndex = $state<number | null>(null);
  let showTable = $state(false);
  let theme = $state<"auto" | "light" | "dark">("auto");

  let client: SolverClient | null = null;

  onMount(() => {
    const worker = new SolverWorker();
    client = new SolverClient(
      worker as unknown as ConstructorParameters<typeof SolverClient>[0],
      (r) => { results = r; error = null; },
      (msg) => { error = msg; },
      (b) => { busy = b; },
    );
    client.request($state.snapshot(params));
    return () => worker.terminate();
  });

  function update(p: Params) {
    params = p;
    const q = encodeParams(p);
    history.replaceState(null, "", q ? "?" + q : location.pathname);
    client?.request($state.snapshot(p));
  }

  const capOn = $derived(params.tatm_up < NO_CAP);
  const changed = $derived(encodeParams(params) !== "");

  const sources = $derived<SeriesSource[]>(results ? [
    { id: "opt", label: "Optimal policy", sol: results.optimal },
    { id: "base", label: "No new policy (baseline)", sol: results.baseline },
    ...(changed ? [{ id: "ref", label: "Optimal, DICE defaults", sol: results.reference }] : []),
  ] : []);
  const COLORS: Record<string, string> = { opt: "var(--series-1)", base: "var(--series-2)", ref: "var(--series-3)" };

  const years = $derived(results ? Array.from(results.optimal.exogenous.year) : []);
  const sOpt = $derived(results ? summarize(results.optimal) : null);
  const sBase = $derived(results?.baseline ? summarize(results.baseline) : null);
  const sRef = $derived(results ? summarize(results.reference) : null);
  const ce = $derived(results?.baseline ? consumptionEquivalent(results.optimal, results.baseline) : NaN);
  const capInfeasible = $derived(!!results && capOn && results.optimal.info.maxViolation > 1e-6);

  function cycleTheme() {
    theme = theme === "auto" ? "dark" : theme === "dark" ? "light" : "auto";
    if (theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  }

  function downloadCsv() {
    const blob = new Blob([toCsv(sources)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dice2013r-results.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const dollars = (v: number) => "$" + v.toFixed(1);
</script>

<header>
  <div>
    <h1>DICE-2013R explorer</h1>
    <p class="lede">
      William Nordhaus's climate-economy model, solved live in your browser. Change an assumption and
      the optimal climate policy is recomputed in milliseconds.
    </p>
  </div>
  <button type="button" class="theme" onclick={cycleTheme} aria-label="Color theme">Theme: {theme}</button>
</header>

<div class="layout">
  <aside id="assumptions" aria-label="Model settings">
    <div class="aside-head">
      <h2>Assumptions</h2>
      {#if changed}
        <button type="button" onclick={() => { capValue = 2; update({ ...DEFAULT }); }}>Reset all</button>
      {/if}
    </div>
    {#each GROUPS as g}
      <section>
        <h3>{g}</h3>
        {#each CONTROLS.filter((c) => c.group === g) as c (c.id)}
          <ControlSlider control={c} {params} onchange={update} />
        {/each}
        {#if g === "Policy & limits"}
          <div class="control">
            <label class="check">
              <input type="checkbox" checked={capOn} data-testid="cap-toggle"
                onchange={(e) => update({ ...params, tatm_up: (e.currentTarget as HTMLInputElement).checked ? capValue : NO_CAP })} />
              {CAP_CONTROL.label}
            </label>
            {#if capOn}
              <div class="row">
                <label for="ctl-cap">Maximum warming</label>
                <output for="ctl-cap" data-testid="value-cap">{params.tatm_up.toFixed(2)} °C</output>
              </div>
              <input id="ctl-cap" type="range" min={CAP_CONTROL.min} max={CAP_CONTROL.max} step={CAP_CONTROL.step}
                value={params.tatm_up}
                oninput={(e) => { capValue = +(e.currentTarget as HTMLInputElement).value; update({ ...params, tatm_up: capValue }); }} />
            {/if}
            <p class="help">{CAP_CONTROL.help}</p>
          </div>
        {/if}
      </section>
    {/each}
  </aside>

  <main>
    <a class="jump" href="#assumptions">Change assumptions ↓</a>
    <div class="status" aria-live="polite">
      {#if error}
        <span class="error" role="alert">The model could not be solved: {error}</span>
      {:else if !results}
        <span>Solving…</span>
      {:else}
        <span data-testid="status">
          {busy ? "Solving…" : "Solved in " + results.ms.toFixed(0) + " ms"}
        </span>
      {/if}
    </div>

    {#if capInfeasible}
      <p class="warning" role="alert" data-testid="cap-warning">
        A cap of {params.tatm_up.toFixed(2)} °C cannot be met: warming already in the pipeline exceeds it even
        with maximum abatement. The optimal run shows the closest the model can get.
      </p>
    {/if}
    {#if results?.baselineError}
      <p class="warning" role="alert" data-testid="baseline-warning">
        The baseline has no solution with these settings ({results.baselineError}) – without new policy,
        damages would wipe out world output. Only the optimal policy is shown.
      </p>
    {/if}

    {#if results && sOpt}
      <div class="tiles" class:stale={busy}>
        <StatTile label="Social cost of carbon, 2015" testid="tile-scc" value={dollars(sOpt.scc2015)}
          note={"per t CO₂, 2005 dollars" + (changed && sRef ? " · DICE default " + dollars(sRef.scc2015) : "")} />
        <StatTile label="Peak warming, optimal policy" testid="tile-peak-opt" value={sOpt.peakTemp.toFixed(2) + " °C"}
          note={"in " + sOpt.peakYear + " · " + sOpt.temp2100.toFixed(2) + " °C in 2100"} />
        <StatTile label="Peak warming, no new policy" testid="tile-peak-base"
          value={sBase ? sBase.peakTemp.toFixed(2) + " °C" : "–"}
          note={sBase ? "in " + sBase.peakYear + " · " + sBase.temp2100.toFixed(2) + " °C in 2100" : "no solution"} />
        <StatTile label="Gain from optimal policy" testid="tile-gain"
          value={Number.isFinite(ce) ? ce.toFixed(2) + "%" : "–"}
          note="of consumption, every year, forever (welfare-equivalent)" />
      </div>

      <div class="toolbar">
        <label>
          Show years to
          <select bind:value={horizon} data-testid="horizon">
            <option value={2100}>2100</option>
            <option value={2150}>2150</option>
            <option value={2200}>2200</option>
            <option value={2300}>2300</option>
          </select>
        </label>
        <ul class="legend" aria-label="Legend">
          {#each sources as s (s.id)}
            <li class:missing={!s.sol}><span class="lkey" style:background={COLORS[s.id]}></span>{s.label}{!s.sol ? " (no solution)" : ""}</li>
          {/each}
        </ul>
        <button type="button" onclick={downloadCsv}>Download CSV</button>
      </div>

      <div class="charts" class:stale={busy}>
        {#each CHART_VARIABLES as id (id)}
          {@const v = variable(id)}
          <div class="card">
            <LineChart title={v.label} unit={v.unit} {years} {horizon} format={v.format} zeroBased={v.zeroBased}
              series={sources.map((s) => ({ id: s.id, label: s.label, color: COLORS[s.id], values: s.sol ? v.get(s.sol) : null }))}
              {hoverIndex} onhover={(i) => (hoverIndex = i)} />
          </div>
        {/each}
      </div>

      <section class="card table-card">
        <div class="table-head">
          <h2>Data</h2>
          <button type="button" aria-expanded={showTable} onclick={() => (showTable = !showTable)} data-testid="table-toggle">
            {showTable ? "Hide table" : "Show table"}
          </button>
        </div>
        {#if showTable}
          <DataTable {sources} {horizon} />
        {/if}
      </section>
    {/if}

    <section class="about">
      <h2>About this model</h2>
      <p>
        DICE (Dynamic Integrated Climate-Economy) links a model of economic growth to a simple carbon cycle and
        climate. Each run chooses how fast to cut emissions and how much to save in every five-year period from 2010
        to 2305 so as to maximize discounted well-being. The <strong>baseline</strong> is DICE's "no new policy" run:
        a carbon price of about $1 per ton rising 2% a year until 2230. The <strong>social cost of carbon</strong> is
        the damage, in today's consumption, from one more ton of CO₂ emitted in that year.
      </p>
      <p>
        This is a reimplementation of the DICE-2013R GAMS code (Nordhaus and Sztorc, 2013). Its results match the
        published GAMS solutions to about seven significant figures, checked by automated tests. Like any model,
        it is only as good as its assumptions: the damage function in particular is highly uncertain.
      </p>
    </section>
  </main>
</div>

<style>
  header {
    display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
    max-width: 1400px; margin: 0 auto; padding: 20px 16px 8px;
  }
  h1 { margin: 0; font-size: 24px; }
  .lede { margin: 4px 0 0; color: var(--text-secondary); max-width: 70ch; }
  .layout {
    display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 20px;
    max-width: 1400px; margin: 0 auto; padding: 8px 16px 40px;
  }
  aside {
    background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 12px 16px; align-self: start; position: sticky; top: 12px; max-height: calc(100vh - 24px); overflow-y: auto;
  }
  .aside-head { display: flex; justify-content: space-between; align-items: center; }
  h2 { font-size: 17px; margin: 4px 0; }
  h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); margin: 18px 0 0; }
  .control { padding: 10px 0 8px; }
  .row { display: flex; justify-content: space-between; align-items: baseline; margin-top: 6px; }
  .row output { font-weight: 600; font-variant-numeric: tabular-nums; color: var(--accent); }
  .check { display: flex; gap: 8px; align-items: center; font-weight: 500; }
  input[type="range"] { width: 100%; accent-color: var(--accent); }
  .help { font-size: 13px; color: var(--text-secondary); margin: 4px 0 0; }
  main { min-width: 0; }
  .status { color: var(--text-muted); font-size: 13px; min-height: 20px; margin-bottom: 8px; }
  .error { color: var(--critical); }
  .warning {
    background: var(--warning-bg); color: var(--warning-ink); border-radius: 8px; padding: 8px 12px; margin: 0 0 12px;
  }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(190px, calc(50% - 6px)), 1fr)); gap: 12px; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 20px; margin: 18px 0 10px; }
  .toolbar label { display: flex; align-items: center; gap: 8px; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 16px; list-style: none; margin: 0; padding: 0; flex: 1; }
  .legend li { display: flex; align-items: center; gap: 6px; color: var(--text-secondary); font-size: 13.5px; }
  .legend li.missing { opacity: 0.6; }
  .lkey { width: 16px; height: 2px; border-radius: 1px; display: inline-block; }
  .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 12px; }
  .card { background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; min-width: 0; }
  .stale { opacity: 0.6; transition: opacity 0.2s 0.15s; }
  .table-card { margin-top: 12px; }
  .table-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .about { color: var(--text-secondary); max-width: 75ch; margin-top: 24px; }
  .about h2 { color: var(--text-primary); }

  .theme { white-space: nowrap; }
  .jump { display: none; }
  @media (max-width: 860px) {
    .layout { grid-template-columns: minmax(0, 1fr); }
    aside { position: static; max-height: none; order: 2; }
    .jump { display: inline-block; margin-bottom: 8px; }
    .legend { order: -1; flex-basis: 100%; }
    .charts { grid-template-columns: minmax(0, 1fr); }
  }
</style>
