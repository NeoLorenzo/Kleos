"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import KleosSidebar from "@/components/KleosSidebar";
import { KLEOS_PAGES } from "@/lib/kleos/routes";
import { supabase } from "@/lib/supabase/client";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger
} from "@/fabbro-design/components/application-sidebar/react/sidebar";
import styles from "./KleosAppShell.module.css";

function normalizeRelativePath(pathname, basePath) {
  let value = pathname || "/";
  if (basePath && value.startsWith(basePath)) {
    value = value.slice(basePath.length) || "/";
  }
  if (!value.startsWith("/")) value = `/${value}`;
  if (value !== "/" && !value.endsWith("/")) value += "/";
  return value;
}

export default function KleosAppShell({ basePath = "", children }) {
  const pathname = usePathname();
  const [hasSession, setHasSession] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const currentPage = useMemo(() => {
    const relativePath = normalizeRelativePath(pathname, basePath);
    return (
      KLEOS_PAGES.find((page) =>
        page.path === "/"
          ? relativePath === "/"
          : relativePath === page.path || relativePath.startsWith(page.path)
      ) || KLEOS_PAGES[0]
    );
  }, [basePath, pathname]);

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
    <SidebarProvider defaultOpen>
      <KleosSidebar basePath={basePath} />

      <SidebarInset className={styles.inset}>
        <header className={styles.utilityBar}>
          <div className={styles.context}>
            <SidebarTrigger />
            <span className={styles.pageLabel}>{currentPage.label}</span>
          </div>

          <div className={styles.utilities}>
            <img
              className={styles.familyMark}
              src={`${basePath}/brand/fabbro-mark.svg`}
              alt="Fabbro Systems"
            />
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
        </header>

        <div className={styles.workspace}>{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
