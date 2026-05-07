import type { Provider } from "../views/types";

type Props = {
  active: Provider;
  onChange: (next: Provider) => void;
};

const TABS: { id: Provider; label: string }[] = [
  { id: "claude", label: "Claude" },
  { id: "codex", label: "Codex" },
];

export function ProviderTabs({ active, onChange }: Props) {
  return (
    <div role="tablist" aria-label="Provider" className="flex items-end gap-6 px-5">
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={`relative -mb-px py-2.5 text-[13px] tracking-tight transition-colors duration-200 ${
              isActive
                ? "font-semibold text-[var(--color-ink)]"
                : "font-medium text-[var(--color-text-dim)] hover:text-[var(--color-ink)]"
            }`}
          >
            {t.label}
            <span
              aria-hidden
              className={`pointer-events-none absolute bottom-[-1px] left-0 right-0 h-[1.5px] transition-opacity ${
                isActive ? "opacity-100" : "opacity-0"
              }`}
              style={{ background: "var(--color-ink)" }}
            />
          </button>
        );
      })}
    </div>
  );
}
