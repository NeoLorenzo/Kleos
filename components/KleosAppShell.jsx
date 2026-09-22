"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import KleosPublicSite from "@/components/KleosPublicSite";
import KleosSidebar from "@/components/KleosSidebar";
import MeasurementCorrections from "@/components/MeasurementCorrections";
import { KLEOS_PAGES } from "@/lib/kleos/routes";
import { supabase } from "@/lib/supabase/client";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger
} from "@/fabbro-design/components/application-sidebar/react/sidebar";
import styles from "./KleosAppShell.module.css";

const PUBLIC_DOCUMENT_PATHS = new Set(["/privacy/", "/terms/"]);

function normalizeRelativePath(pathname) {
  let value = pathname || "/";
  if (!value.startsWith("/")) value = "/" + value;
  if (value !== "/" && !value.endsWith("/")) value += "/";
  return value;
}

export default function KleosAppShell({ children }) {
  const pathname = usePathname();
  const relativePath = normalizeRelativePath(pathname);
  const [authState, setAuthState] = useState(supabase ? "loading" : "signed-out");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  const isPublicDocument = PUBLIC_DOCUMENT_PATHS.has(relativePath);
  const hasSession = authState === "authenticated";

  const currentPage = useMemo(() => {
    return (
      KLEOS_PAGES.find((page) =>
        page.path === "/"
          ? relativePath === "/"
          : relativePath === page.path || relativePath.startsWith(page.path)
      ) || KLEOS_PAGES[0]
    );
  }, [relativePath]);

  useEffect(() => {
    if (!supabase) {
      setAuthState("signed-out");
      return undefined;
    }

    let mounted = true;

    const applyUser = (user) => {
      if (!mounted) return;
      setAuthState(user ? "authenticated" : "signed-out");
      if (user) setAuthMessage("");
    };

    void supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        setAuthState("signed-out");
        setAuthMessage("Sign in could not be checked. You can still explore the public Kleos model.");
        return;
      }
      applyUser(data?.user || null);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user || null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async () => {
    if (!supabase || isSigningIn) {
      if (!supabase) {
        setAuthMessage("Sign in is unavailable because this deployment has no Supabase client configuration.");
      }
      return;
    }

    setIsSigningIn(true);
    setAuthMessage("");

    const redirectTo =
      typeof window !== "undefined"
        ? window.location.origin + "/"
        : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { prompt: "select_account" }
      }
    });

    if (error) {
      setAuthMessage(error.message || "Google sign in failed.");
      setIsSigningIn(false);
    }
  };

  const signOut = async () => {
    if (!supabase || isSigningOut) return;

    setIsSigningOut(true);
    const { error } = await supabase.auth.signOut();
    setIsSigningOut(false);

    if (error) {
      setAuthMessage(error.message || "Sign out failed.");
      return;
    }

    setAuthState("signed-out");
  };

  if (isPublicDocument) {
    return children;
  }

  if (authState === "loading") {
    return (
      <KleosPublicSite
        onSignIn={signIn}
        isSigningIn={false}
        signInAvailable={false}
        authMessage=""
      />
    );
  }

  if (!hasSession) {
    return (
      <KleosPublicSite
        onSignIn={signIn}
        isSigningIn={isSigningIn}
        signInAvailable={Boolean(supabase)}
        authMessage={authMessage}
      />
    );
  }

  return (
    <SidebarProvider defaultOpen>
      <KleosSidebar />

      <SidebarInset className={styles.inset}>
        <header className={styles.utilityBar}>
          <div className={styles.context}>
            <SidebarTrigger />
            <span className={styles.pageLabel}>{currentPage.label}</span>
          </div>

          <div className={styles.utilities}>
            <img
              className={styles.familyMark}
              src="/brand/fabbro-mark.svg"
              alt="Fabbro Systems"
            />
            <button
              className={styles.signOut}
              type="button"
              onClick={signOut}
              disabled={isSigningOut}
            >
              {isSigningOut ? "Signing Out…" : "Sign Out"}
            </button>
          </div>
        </header>

        <div className={styles.workspace}>{children}</div>
      </SidebarInset>

      <MeasurementCorrections />
    </SidebarProvider>
  );
}
