"use client";

import { useEffect, useRef, useState } from "react";

/** Reports once an element has entered the viewport. */
export function useInView({ threshold = 0.25, rootMargin = "0px", once = true } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return [ref, inView];
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return reduced;
}

/** Animates a number from 0 to `target` once `active` becomes true. */
export function useCountUp(target, active, duration = 1400) {
  // Starts at the final value so the number is correct even if animation frames never run.
  const [value, setValue] = useState(target ?? 0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!active || target === null || target === undefined) return undefined;
    if (reduced) {
      setValue(target);
      return undefined;
    }

    let frame = 0;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - Math.pow(1 - progress, 4);
      setValue(target * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, active, duration, reduced]);

  return value;
}
