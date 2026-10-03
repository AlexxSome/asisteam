export function LoadingState({ label = "Cargando contenido…" }: { label?: string }) {
  return <div className="min-h-80 space-y-4">
    <p role="status" className="text-small text-muted-foreground">{label}</p>
    <section aria-label={label} aria-busy="true">
    <div aria-hidden="true" className="space-y-3">
      {[0, 1, 2].map(row => <div key={row} className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div className="h-5 w-2/3 rounded bg-muted" />
        <div className="h-4 w-1/2 rounded bg-muted" />
        <div className="h-4 w-1/3 rounded bg-muted" />
      </div>)}
    </div>
    </section>
  </div>;
}
