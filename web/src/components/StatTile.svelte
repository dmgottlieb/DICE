<script lang="ts">
  let { label, value, note = "", testid = "" }: { label: string; value: string; note?: string; testid?: string } = $props();
</script>

<div class="tile">
  <div class="label">{label}</div>
  <div class="value" data-testid={testid}>{value}</div>
  {#if note}<div class="note">{note}</div>{/if}
</div>

<style>
  .tile {
    background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 12px 14px; min-width: 0;
  }
  .label { color: var(--text-secondary); font-size: 13px; }
  .value { font-size: clamp(20px, 5vw, 26px); font-weight: 600; margin: 2px 0; }
  .note { color: var(--text-muted); font-size: 12.5px; }
</style>
