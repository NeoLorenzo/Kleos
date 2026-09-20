"use client";

import { useEffect, useState } from "react";
import { KLEOS_PAGES } from "@/lib/kleos/routes";
import { supabase } from "@/lib/supabase/client";
import styles from "./KleosNav.module.css";

export default function KleosNav({ basePath = "" }) {
  const [hasSession, setHasSession] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (!supabase) return undefined;

    let mounted = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (mounted) setHasSession(Boolean(data?.user));
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setHasSession(Boolean(session?.user));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    if (!supabase || isSigningOut) return;

    setIsSigningOut(true);
    const { error } = await supabase.auth.signOut();
    setIsSigningOut(false);

    if (!error) setHasSession(false);
  };

  return (
    <nav className={styles.nav} aria-label="Kleos navigation">
      <a className={styles.brand} href={`${basePath}/`} aria-label="Kleos home">
        <img src={`${basePath}/brand/kleos-lockup.svg`} alt="Kleos" />
      </a>

      <div className={styles.links}>
        {KLEOS_PAGES.map((page) => (
          <a key={page.id} href={`${basePath}${page.path}`}>
            {page.label}
          </a>
        ))}
      </div>

      <div className={styles.actions}>
        <span className={styles.family}>Fabbro Systems</span>
        {hasSession ? (
          <button
            className={styles.signOut}
            type="button"
            onClick={signOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? "Signing Out…" : "Sign Out"}
          </button>
        ) : null}
      </div>
    </nav>
  );
}
