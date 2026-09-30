"use client";

import { useId, useRef, useState } from "react";
import { Info } from "lucide-react";

/**
 * Keeps methodology and provenance notes one hover or tap away instead of
 * printing them as body copy on every card.
 */
export default function InfoHint({ label = "More information", children }) {
  const id = useId();
  const rootRef = useRef(null);
  const [alignRight, setAlignRight] = useState(false);

  const align = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) setAlignRight(rect.left > window.innerWidth / 2);
  };

  return (
    <span
      ref={rootRef}
      className={alignRight ? "kleos-info is-right" : "kleos-info"}
      onPointerEnter={align}
      onFocus={align}
    >
      <button type="button" className="kleos-info-trigger" aria-label={label} aria-describedby={id}>
        <Info aria-hidden="true" />
      </button>
      <span role="tooltip" id={id} className="kleos-info-popover">
        {children}
      </span>
    </span>
  );
}
