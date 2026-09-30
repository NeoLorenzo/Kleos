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

function normalizeRelativePath(pathname) {
  let value = pathname || "/";

  if (!value.startsWith("/")) value = `/${value}`;
  if (value !== "/" && !value.endsWith("/")) value += "/";
  return value;
}

export default function KleosSidebar() {
  const pathname = usePathname();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const relativePath = normalizeRelativePath(pathname);
  const compact = state === "collapsed" && !isMobile;
  const items = KLEOS_PAGES.map((page) => ({
    ...page,
    icon: PAGE_ICONS[page.id] || Compass,
    active:
      page.path === "/"
        ? relativePath === "/"
        : relativePath === page.path || relativePath.startsWith(page.path)
  }));
  const groups = [
    { label: "Overview", items: items.filter((item) => item.id === "character-sheet") },
    { label: "Dimensions", items: items.filter((item) => item.id !== "character-sheet") }
  ];

  return (
    <Sidebar collapsible="icon" aria-label="Kleos primary navigation">
      <SidebarHeader className={styles.header}>
        <a className={styles.brandLink} href="/" aria-label="Kleos home">
          <img
            className={compact ? styles.brandMark : styles.brandLockup}
            src={
              compact
                ? "/brand/kleos-mark.svg"
                : "/brand/kleos-lockup.svg"
            }
            alt="Kleos"
          />
        </a>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((page) => (
                  <SidebarMenuItem key={page.id}>
                    <SidebarMenuButton
                      href={page.path}
                      icon={page.icon}
                      isActive={page.active}
                      tooltip={page.label}
                      onClick={() => {
                        if (isMobile) setOpenMobile(false);
                      }}
                    >
                      {page.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
