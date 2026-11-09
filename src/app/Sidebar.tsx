import { ROUTES, type Route } from './routes';

export function Sidebar({ route, onSelect }: { route: Route; onSelect(r: Route): void }) {
  return (
    <aside className="flex w-[84px] shrink-0 flex-col items-center gap-6 border-r border-border bg-surface px-2 py-5">
      <span className="size-8 rounded-xl bg-accent" aria-hidden />
      <nav aria-label="Main" className="flex w-full flex-col gap-1">
        {ROUTES.map(({ id, label, icon: Icon }) => {
          const active = id === route;
          return (
            <button key={id} type="button" onClick={() => onSelect(id)} aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 rounded-control px-1 py-2 text-[11px] font-medium transition ${active ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2'}`}>
              <span aria-hidden className="size-5 [&>svg]:size-5"><Icon /></span>
              {label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
