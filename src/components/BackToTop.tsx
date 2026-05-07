import { useEffect, useState } from "react";
import { ArrowUp } from "@phosphor-icons/react";

const SHOW_AFTER_PX = 240;

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const onClick = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Back to top"
      tabIndex={visible ? 0 : -1}
      className={`fixed bottom-5 right-5 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-hairline)] bg-white text-[var(--color-ink)] transition-all duration-200 ease-out hover:border-[var(--color-ink)] hover:bg-[var(--color-bg-soft)] active:scale-95 ${
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0"
      }`}
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
    >
      <ArrowUp weight="bold" size={14} />
    </button>
  );
}
