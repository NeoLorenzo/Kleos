"use client";

import { useEffect, useState } from "react";
import CurrentVectorState from "@/components/CurrentVectorState";
import { AUTHORIZED_KLEOS_EMAIL } from "@/lib/kleos/data";
import { supabase } from "@/lib/supabase/client";

export default function VectorStatePage() {
  const [accessState, setAccessState] = useState("loading");
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase) {
      setAccessState("unconfigured");
      return undefined;
    }

    let active = true;

    const applyUser = (nextUser) => {
      if (!active) return;
      const email = String(nextUser?.email || "").trim().toLowerCase();
      setUser(nextUser || null);
      setMessage("");

      if (!nextUser) {
        setAccessState("signed-out");
      } else if (email !== AUTHORIZED_KLEOS_EMAIL) {
        setAccessState("unauthorized");
      } else {
        setAccessState("authorized");
      }
    };

    void supabase.auth.getUser().then(({ data }) => applyUser(data?.user || null));
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => applyUser(session?.user || null));

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async () => {
    if (!supabase) return;
    setMessage("");
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const redirectTo = typeof window === "undefined"
      ? undefined
      : `${window.location.origin}${basePath}/vector-state/`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, queryParams: { prompt: "select_account" } }
    });
    if (error) setMessage(error.message || "Google sign-in failed.");
  };

  const signOut = async () => {
    if (!supabase) return;
    setMessage("");
    const { error } = await supabase.auth.signOut();
    if (error) setMessage(error.message || "Sign-out failed.");
  };

  return (
    <main className="kleos-shell">
      <section className="kleos-board">
        <header className="kleos-header">
          <div>
            <p className="kleos-kicker">Shared 8D Character State</p>
            <h1>Kleos</h1>
            <p className="kleos-subtitle">Dated current-state assessments across the eight canonical vectors.</p>
          </div>
          {accessState === "authorized" ? (
            <div className="kleos-header-actions">
              <a className="secondary-btn" href={homeHref()}>Measurements</a>
              <button type="button" className="secondary-btn" onClick={signOut}>Sign Out</button>
            </div>
          ) : null}
        </header>

        {accessState === "authorized" ? (
          <div className="kleos-scroll">
            <CurrentVectorState userId={user?.id} />
            {message ? <p className="status-line">{message}</p> : null}
          </div>
        ) : (
          <AccessState state={accessState} user={user} message={message} onSignIn={signIn} />
        )}
      </section>
    </main>
  );
}

function AccessState({ state, user, message, onSignIn }) {
  const content = {
    loading: ["Loading Kleos", "Checking the authenticated session."],
    unconfigured: ["Kleos is not configured", "Add the public Supabase URL and publishable key."],
    "signed-out": ["Sign in to Kleos", "Vector snapshots are private and available only after owner authentication."],
    unauthorized: ["Account not authorized", `Signed in as ${user?.email || "another account"}.`]
  }[state] || ["Kleos unavailable", "The vector-state surface could not be opened."];

  return (
    <section className="access-panel">
      <div className="access-mark">K</div>
      <h2>{content[0]}</h2>
      <p>{content[1]}</p>
      {message ? <p>{message}</p> : null}
      {state === "signed-out" || state === "unauthorized" ? (
        <button type="button" className="primary-btn" onClick={onSignIn}>Sign in with Google</button>
      ) : null}
    </section>
  );
}

function homeHref() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return `${basePath || ""}/`;
}
