"use client";

import { useEffect, useState } from "react";
import PsychologicalAssessment from "@/components/PsychologicalAssessment";
import { AUTHORIZED_KLEOS_EMAIL } from "@/lib/kleos/data";
import { supabase } from "@/lib/supabase/client";

export default function PsychologicalAssessmentPage() {
  const [accessState, setAccessState] = useState("loading");
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase) {
      setAccessState("unconfigured");
      return undefined;
    }

    let mounted = true;

    const handleUser = (nextUser) => {
      if (!mounted) return;
      const email = String(nextUser?.email || "").trim().toLowerCase();

      if (!nextUser) {
        setUser(null);
        setAccessState("signed-out");
        return;
      }

      setUser(nextUser);
      if (email !== AUTHORIZED_KLEOS_EMAIL) {
        setAccessState("unauthorized");
        return;
      }

      setAccessState("authorized");
    };

    void supabase.auth.getUser().then(({ data, error }) => {
      if (error && mounted) setMessage(error.message || "Unable to verify the current session.");
      handleUser(data?.user || null);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      handleUser(session?.user || null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async () => {
    if (!supabase) return;
    setMessage("");
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}${basePath}/psychological-assessment/`
        : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { prompt: "select_account" }
      }
    });
    if (error) setMessage(error.message || "Google sign-in failed.");
  };

  return (
    <main className="kleos-shell">
      <section className="kleos-board">
        <header className="kleos-header">
          <div>
            <p className="kleos-kicker">Kleos Measurement</p>
            <h1>Psychological Assessment</h1>
            <p className="kleos-subtitle">Take the standardized battery whenever you want and retain dated history.</p>
          </div>
        </header>

        {accessState === "authorized" ? (
          <div className="kleos-scroll">
            <PsychologicalAssessment userId={user.id} />
          </div>
        ) : (
          <AccessGate
            state={accessState}
            user={user}
            message={message}
            onSignIn={signIn}
          />
        )}
      </section>
    </main>
  );
}

function AccessGate({ state, user, message, onSignIn }) {
  const title = {
    loading: "Checking Kleos Access",
    unconfigured: "Supabase Required",
    "signed-out": "Private Kleos Workspace",
    unauthorized: "Access Denied"
  }[state] || "Private Kleos Workspace";

  const body = {
    loading: "Verifying the signed-in account before loading psychological assessment data.",
    unconfigured: "This deployment needs the shared Kleos Supabase configuration.",
    "signed-out": `Sign in with ${AUTHORIZED_KLEOS_EMAIL} to take or review assessments.`,
    unauthorized: `${user?.email || "This account"} is not authorized for Kleos.`
  }[state];

  return (
    <section className="access-panel">
      <div className="access-mark">K</div>
      <h2>{title}</h2>
      <p>{message || body}</p>
      {state === "signed-out" ? (
        <button type="button" className="primary-btn" onClick={onSignIn}>
          Sign In With Google
        </button>
      ) : null}
    </section>
  );
}
