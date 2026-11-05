<script lang="ts">
  import { formatTick } from "../lib/ui/format";
  import { linear, niceDomain, niceStep } from "../lib/ui/scale";

  export interface ChartSeries { id: string; label: string; color: string; values: number[] | null }

  let {
    title, unit, series, years, horizon, format, zeroBased = true,
    hoverIndex = null, onhover = () => {}, height = 220,
  }: {
    title: string; unit: string; series: ChartSeries[]; years: number[]; horizon: number;
    format: (v: number) => string; zeroBased?: boolean;
    hoverIndex?: number | null; onhover?: (i: number | null) => void; height?: number;
  } = $props();

  let width = $state(0);
  let hovering = $state(false);

  // Room on the right for direct end labels on wider charts.
  const margin = $derived({ top: 10, right: width >= 420 ? 58 : 14, bottom: 26, left: 46 });
  const n = $derived(years.filter((y) => y <= horizon).length);
  const live = $derived(series.filter((s) => s.values));

  const yDomain = $derived.by(() => {
    let lo = Infinity, hi = -Infinity;
    for (const s of live) for (let i = 0; i < n; i++) {
      const v = s.values![i];
      if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }
    if (zeroBased) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    return niceDomain(lo, hi, height > 180 ? 5 : 4);
  });

  const plotW = $derived(Math.max(10, width - margin.left - margin.right));
  const plotH = $derived(height - margin.top - margin.bottom);
  const x = $derived(linear(years[0], years[n - 1], margin.left, margin.left + plotW));
  const y = $derived(linear(yDomain.lo, yDomain.hi, margin.top + plotH, margin.top));

  const xTicks = $derived.by(() => {
    const span = years[n - 1] - years[0];
    const step = Math.max(10, niceStep(span, Math.max(2, Math.floor(plotW / 70))));
    const out: number[] = [];
    for (let t = Math.ceil(years[0] / step) * step; t <= years[n - 1]; t += step) out.push(t);
    return out;
  });

  function pathFor(values: number[]) {
    let d = "", pen = false;
    for (let i = 0; i < n; i++) {
      const v = values[i];
      if (!Number.isFinite(v)) { pen = false; continue; }
      d += (pen ? "L" : "M") + x(years[i]).toFixed(1) + "," + y(v).toFixed(1);
      pen = true;
    }
    return d;
  }

  // Direct end labels only when they don't collide.
  const endLabels = $derived.by(() => {
    if (width < 420) return [];
    const ls = live.map((s) => ({ s, py: y(s.values![n - 1]) })).filter((l) => Number.isFinite(l.py));
    const sorted = [...ls].sort((a, b) => a.py - b.py);
    for (let i = 1; i < sorted.length; i++) if (sorted[i].py - sorted[i - 1].py < 13) return [];
    return ls;
  });

  function indexAt(clientX: number, rect: DOMRect) {
    const px = clientX - rect.left;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(years[i]) - px);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function onpointermove(e: PointerEvent) {
    const svg = (e.currentTarget as SVGElement).closest("svg")!;
    hovering = true;
    onhover(indexAt(e.clientX, svg.getBoundingClientRect()));
  }

  function onkeydown(e: KeyboardEvent) {
    const cur = hoverIndex ?? -1;
    if (e.key === "ArrowRight") { onhover(Math.min(n - 1, cur + 1)); hovering = true; e.preventDefault(); }
    else if (e.key === "ArrowLeft") { onhover(Math.max(0, cur < 0 ? n - 1 : cur - 1)); hovering = true; e.preventDefault(); }
    else if (e.key === "Escape") { onhover(null); hovering = false; }
  }

  const hi = $derived(hoverIndex !== null && hoverIndex < n ? hoverIndex : null);
  const tipLeft = $derived(hi === null ? 0 : x(years[hi]));
  const tipFlip = $derived(tipLeft > width * 0.6);
</script>

<figure class="chart" bind:clientWidth={width}>
  <figcaption>
    <span class="title">{title}</span>
    <span class="unit">{unit}</span>
  </figcaption>
  {#if width > 0}
    <!-- Keyboard exploration of the chart (arrow keys move the crosshair). -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <svg {width} {height} role="img" tabindex="0"
      aria-label={title + " (" + unit + "), " + years[0] + " to " + years[n - 1] + ". Use the arrow keys to read values; the data table below lists them all."}
      onkeydown={onkeydown} onblur={() => { hovering = false; onhover(null); }}>
      {#each yDomain.ticks as t}
        <line class={t === 0 ? "baseline" : "grid"} x1={margin.left} x2={margin.left + plotW} y1={y(t)} y2={y(t)} />
        <text class="tick" x={margin.left - 6} y={y(t)} dy="0.32em" text-anchor="end">{formatTick(t, yDomain.step)}</text>
      {/each}
      {#each xTicks as t}
        <text class="tick" x={x(t)} y={margin.top + plotH + 17} text-anchor="middle">{t}</text>
      {/each}
      {#each live as s (s.id)}
        <path d={pathFor(s.values!)} style:stroke={s.color} class="line" data-series={s.id} />
      {/each}
      {#each endLabels as l (l.s.id)}
        <text class="endlabel" x={margin.left + plotW + 4} y={l.py} dy="0.32em">{format(l.s.values![n - 1])}</text>
      {/each}
      {#if hi !== null}
        <line class="crosshair" x1={x(years[hi])} x2={x(years[hi])} y1={margin.top} y2={margin.top + plotH} />
        {#each live as s (s.id)}
          {#if Number.isFinite(s.values![hi])}
            <circle cx={x(years[hi])} cy={y(s.values![hi])} r="4" style:fill={s.color} class="dot" />
          {/if}
        {/each}
      {/if}
      <rect class="hit" x={margin.left} y={margin.top} width={plotW} height={plotH}
        role="presentation"
        onpointermove={onpointermove} onpointerdown={onpointermove}
        onpointerleave={() => { hovering = false; onhover(null); }} />
    </svg>
    {#if hi !== null && hovering}
      <div class="tooltip" style:left={tipLeft + "px"} class:flip={tipFlip} role="status">
        <div class="year">{years[hi]}</div>
        {#each live as s (s.id)}
          <div class="trow">
            <span class="key" style:background={s.color}></span>
            <strong>{format(s.values![hi])}</strong>
            <span class="name">{s.label}</span>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</figure>

<style>
  .chart { position: relative; margin: 0; min-width: 0; }
  figcaption { display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: baseline; margin-bottom: 4px; }
  .title { font-weight: 600; }
  .unit { color: var(--text-muted); font-size: 12.5px; }
  svg { display: block; overflow: visible; touch-action: pan-y; }
  .grid { stroke: var(--grid); stroke-width: 1; }
  .baseline { stroke: var(--axis); stroke-width: 1; }
  .tick { fill: var(--text-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .endlabel { fill: var(--text-secondary); font-size: 11px; font-variant-numeric: tabular-nums; }
  .crosshair { stroke: var(--text-muted); stroke-width: 1; }
  .dot { stroke: var(--surface-1); stroke-width: 2; }
  .hit { fill: transparent; cursor: crosshair; }
  .tooltip {
    position: absolute; top: 28px; transform: translateX(12px);
    background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12); padding: 8px 10px; font-size: 12.5px;
    pointer-events: none; z-index: 5; min-width: 160px;
  }
  .tooltip.flip { transform: translateX(calc(-100% - 12px)); }
  .year { color: var(--text-muted); margin-bottom: 4px; }
  .trow { display: grid; grid-template-columns: 14px auto 1fr; gap: 6px; align-items: center; white-space: nowrap; }
  .trow strong { font-variant-numeric: tabular-nums; }
  .key { width: 12px; height: 2px; border-radius: 1px; }
  .name { color: var(--text-secondary); }
</style>
