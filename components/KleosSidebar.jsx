"use client";

import { usePathname } from "next/navigation";
import {
  BookOpen,
  Brain,
  BriefcaseBusiness,
  Compass,
  HeartPulse,
  Palette,
  UserRound,
  UsersRound,
  WalletCards
} from "lucide-react";
import { KLEOS_PAGES } from "@/lib/kleos/routes";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar
} from "@/fabbro-design/components/application-sidebar/react/sidebar";
import styles from "./KleosSidebar.module.css";

const PAGE_ICONS = {
  "character-sheet": UserRound,
  physical: HeartPulse,
  psychological: Brain,
  intellectual: BookOpen,
  professional: BriefcaseBusiness,
  financial: WalletCards,
  relational: UsersRound,
  creative: Palette,
  experiential: Compass
};

function normalizeRelativePath(pathname, basePath) {
  let value = pathname || "/";
  if (basePath && value.startsWith(basePath)) {
    value = value.slice(basePath.length) || "/";
  }

  if (!value.startsWith("/")) value = `/${value}`;
  if (value !== "/" && !value.endsWith("/")) value += "/";
  return value;
}

export default function KleosSidebar({ basePath = "" }) {
  const pathname = usePathname();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const relativePath = normalizeRelativePath(pathname, basePath);
  const compact = state === "collapsed" && !isMobile;

  return (
    <Sidebar collapsible="icon" aria-label="Kleos primary navigation">
      <SidebarHeader className={styles.header}>
        <a className={styles.brandLink} href={`${basePath}/`} aria-label="Kleos home">
          <img
            className={compact ? styles.brandMark : styles.brandLockup}
            src={
              compact
                ? `${basePath}/brand/kleos-mark.svg`
                : `${basePath}/brand/kleos-lockup.svg`
            }
            alt="Kleos"
          />
        </a>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Current state</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {KLEOS_PAGES.map((page) => {
                const Icon = PAGE_ICONS[page.id] || Compass;
                const active =
                  page.path === "/"
                    ? relativePath === "/"
                    : relativePath === page.path || relativePath.startsWith(page.path);

                return (
                  <SidebarMenuItem key={page.id}>
                    <SidebarMenuButton
                      href={`${basePath}${page.path}`}
                      icon={Icon}
                      isActive={active}
                      tooltip={page.label}
                      onClick={() => {
                        if (isMobile) setOpenMobile(false);
                      }}
                    >
                      {page.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
