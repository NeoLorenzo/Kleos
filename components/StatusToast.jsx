"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const PERSISTENT_PATTERN = /fail|error|denied|could not|unavailable|required|must|enter /i;
const AUTO_DISMISS_MS = 6000;

/**
 * Transient workspace status. Success and progress messages fade after a few
 * seconds; failures stay until dismissed so they are never missed.
 */
export default function StatusToast({ message }) {
  const [dismissed, setDismissed] = useState(null);

  useEffect(() => {
    setDismissed(null);
    if (!message || PERSISTENT_PATTERN.test(message) || /…|\.\.\.$/.test(message)) return undefined;
    const timer = window.setTimeout(() => setDismissed(message), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!message || dismissed === message) return null;

  return (
    <div className="status-line" role="status" aria-live="polite">
      <span>{message}</span>
      <button
        type="button"
        className="status-line-close"
        aria-label="Dismiss"
        onClick={() => setDismissed(message)}
      >
        <X aria-hidden="true" />
      </button>
    </div>
  );
}
