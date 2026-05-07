import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef, type ReactNode } from "react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

type Mode =
  | "fade-up"      // simple opacity 0→1, translateY 28→0 on enter
  | "stagger"      // children stagger fade-up
  | "scrub-fade"   // opacity scrubs 0.15 → 1 across viewport
  | "scale-pop";   // scale 0.92 → 1 + opacity, on enter

interface Props {
  mode?: Mode;
  delay?: number;
  stagger?: number;
  children: ReactNode;
  className?: string;
  /**
   * Selector for stagger mode — defaults to direct children (root.children).
   * Pass any valid CSS selector to target nested elements (e.g. ".bento-cell").
   */
  childSelector?: string;
}

export default function Reveal({
  mode = "fade-up",
  delay = 0,
  stagger = 0.08,
  children,
  className,
  childSelector,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;
      const targets: Element[] = childSelector
        ? Array.from(root.querySelectorAll(childSelector))
        : Array.from(root.children);

      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        gsap.set(root, { opacity: 1, y: 0 });
        if (targets.length) gsap.set(targets, { opacity: 1, y: 0 });
        return;
      }

      if (mode === "fade-up") {
        gsap.from(root, {
          opacity: 0,
          y: 28,
          duration: 0.8,
          ease: "power2.out",
          delay,
          scrollTrigger: { trigger: root, start: "top 85%", toggleActions: "play none none reverse" },
        });
      } else if (mode === "stagger") {
        if (targets.length) {
          gsap.from(targets, {
            opacity: 0,
            y: 36,
            duration: 0.8,
            ease: "power2.out",
            stagger,
            delay,
            scrollTrigger: { trigger: root, start: "top 85%", toggleActions: "play none none reverse" },
          });
        }
      } else if (mode === "scrub-fade") {
        gsap.fromTo(
          root,
          { opacity: 0.15 },
          {
            opacity: 1,
            ease: "none",
            scrollTrigger: {
              trigger: root,
              start: "top 90%",
              end: "top 35%",
              scrub: 0.6,
            },
          },
        );
      } else if (mode === "scale-pop") {
        gsap.from(root, {
          scale: 0.92,
          opacity: 0.4,
          duration: 0.95,
          ease: "power3.out",
          delay,
          scrollTrigger: { trigger: root, start: "top 80%", toggleActions: "play none none reverse" },
        });
      }
    },
    { scope: ref, dependencies: [mode, delay, stagger, childSelector] },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
