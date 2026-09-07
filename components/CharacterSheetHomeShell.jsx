"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import CharacterSheet from "@/components/CharacterSheet";
import {
  AUTHORIZED_KLEOS_EMAIL,
  createEmptyKleosData,
  loadKleosData
} from "@/lib/kleos/data";
import { supabase } from "@/lib/supabase/client";

export default function CharacterSheetHomeShell() {
  const pathname = usePathname();
  const [state, setState] = useState({ status: "loading", user: null, kleosData: createEmptyKleosData() });

  useEffect(() => {
    if (!isHomePath(pathname) || !supabase) return undefined;

    let active = true;

    const applyUser = async (user) => {
      if (!active) return;
      const email = String(user?.email || "").trim().toLowerCase();
      if (!user || email !== AUTHORIZED_KLEOS_EMAIL) {
        setState({ status: "unavailable", user: user || null, kleosData: createEmptyKleosData() });
        return;
      }

      setState((current) => ({ ...current, status: "loading", user }));
      try {
        const kleosData = await loadKleosData(user.id);
        if (active) setState({ status: "ready", user, kleosData });
      } catch {
        if (active) setState({ status: "error", user, kleosData: createEmptyKleosData() });
      }
    };

    void supabase.auth.getUser().then(({ data }) => applyUser(data?.user || null));
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void applyUser(session?.user || null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [pathname]);

  if (!isHomePath(pathname) || state.status === "unavailable") return null;

  return (
    <main className="kleos-shell" aria-label="Kleos character sheet">
      <section className="kleos-board">
        <header className="kleos-header">
          <div>
            <p className="kleos-kicker">Character Sheet</p>
            <h1>Kleos</h1>
            <p className="kleos-subtitle">Current state, underlying evidence, and trajectory across the eight canonical vectors.</p>
          </div>
          {state.status === "ready" ? (
            <div className="kleos-header-actions">
              <button type="button" className="secondary-btn" onClick={scrollToMeasurementEditor}>
                Edit Measurements
              </button>
            </div>
          ) : null}
        </header>
        <div className="kleos-scroll">
          {state.status === "ready" ? (
            <CharacterSheet userId={state.user.id} kleosData={state.kleosData} />
          ) : state.status === "error" ? (
            <section className="kleos-card wide-card">
              <div className="section-header">
                <h2>Character state unavailable</h2>
                <p>The character sheet could not load. The measurement editor below remains available.</p>
              </div>
            </section>
          ) : (
            <section className="kleos-card wide-card">Loading character state…</section>
          )}
        </div>
      </section>
    </main>
  );
}

function isHomePath(pathname) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return pathname === "/" || pathname === basePath || pathname === `${basePath}/`;
}

function scrollToMeasurementEditor() {
  const shells = document.querySelectorAll("main.kleos-shell");
  shells[1]?.scrollIntoView({ behavior: "smooth", block: "start" });
}
