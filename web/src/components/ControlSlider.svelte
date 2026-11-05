<script lang="ts">
  import type { Params } from "../lib/dice/params";
  import { DEFAULT } from "../lib/dice/params";
  import type { Control } from "../lib/ui/controls";
  import { isDefault } from "../lib/ui/controls";

  let { control, params, onchange }: { control: Control; params: Params; onchange: (p: Params) => void } = $props();

  const value = $derived(control.get(params));
  const changed = $derived(!isDefault(control, params));
  const inputId = $derived("ctl-" + control.id);
</script>

<div class="control" class:changed>
  <div class="row">
    <label for={inputId}>{control.label}</label>
    <output for={inputId} data-testid={"value-" + control.id}>{control.format(value)}</output>
  </div>
  <input
    id={inputId}
    type="range"
    min={control.min}
    max={control.max}
    step={control.step}
    value={value}
    aria-describedby={inputId + "-help"}
    oninput={(e) => onchange(control.set(params, +(e.currentTarget as HTMLInputElement).value))}
  />
  <div class="row meta">
    <span id={inputId + "-help"} class="unit">{control.unit}</span>
    {#if changed}
      <button class="reset" type="button" onclick={() => onchange(control.set(params, control.get(DEFAULT)))}
        aria-label={"Reset " + control.label + " to " + control.format(control.get(DEFAULT))}>
        Reset to {control.format(control.get(DEFAULT))}
      </button>
    {:else}
      <span class="unit">DICE default</span>
    {/if}
  </div>
  <details>
    <summary>About this setting</summary>
    <p>{control.help}</p>
  </details>
</div>

<style>
  .control { padding: 10px 0 8px; border-bottom: 1px solid var(--border); }
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  label { font-weight: 500; }
  output { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
  .changed output { color: var(--accent); }
  input[type="range"] { width: 100%; margin: 6px 0 2px; accent-color: var(--accent); }
  .meta { font-size: 12.5px; color: var(--text-muted); min-height: 24px; }
  .reset { font-size: 12px; padding: 1px 8px; }
  details { font-size: 13px; color: var(--text-secondary); }
  summary { cursor: pointer; color: var(--text-muted); font-size: 12.5px; width: fit-content; }
  details p { margin: 4px 0 2px; }
</style>
