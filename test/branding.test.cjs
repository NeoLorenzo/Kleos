const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function collectTextFiles(relativeDir, extensions) {
  const start = path.join(root, relativeDir);
  const files = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        files.push(full);
      }
    }
  }

  walk(start);
  return files;
}

test("Kleos adopts Fabbro Design System 0.3.0", () => {
  assert.equal(read("fabbro-design/VERSION").trim(), "0.3.0");

  const product = JSON.parse(read("fabbro-design/product.json"));
  assert.equal(product.version, "0.3.0");
  assert.equal(product.product, "Kleos");
  assert.equal(product.symbol, "Radiance");
  assert.equal(product.coreIdea, "Recognition");
  assert.equal(product.accent.toUpperCase(), "#CB30E0");

  const core = JSON.parse(read("fabbro-design/core.json"));
  assert.equal(core.version, "0.3.0");
  assert.equal(core.color.background.toUpperCase(), "#000000");
  assert.match(core.typography.familyPrimary, /Inter/);

  const endorsement = core.branding.applicationFamilyEndorsement;
  assert.equal(endorsement.asset, "Fabbro Systems Logo.svg");
  assert.equal(endorsement.treatment, "mark-only");
  assert.equal(endorsement.desktopSize, "24px");
  assert.equal(endorsement.visibleTextLabel, false);
  assert.equal(endorsement.orderBeforeSessionAction, true);

  const shell = core.applicationShell;
  assert.equal(shell.desktop.primaryNavigationPlacement, "left");
  assert.equal(shell.desktop.primaryNavigationBehavior, "persistent");
  assert.equal(shell.desktop.primaryNavigationCollapsible, true);
  assert.equal(shell.desktop.primaryNavigationComponent, "Fabbro Application Sidebar");
  assert.equal(shell.desktop.primaryNavigationComponentVersion, "1.0.0");
  assert.equal(shell.desktop.primaryNavigationDefaultState, "expanded");
  assert.equal(shell.desktop.primaryNavigationExpandedWidth, "15.5rem");
  assert.equal(shell.desktop.primaryNavigationCollapsedWidth, "4.5rem");
  assert.equal(shell.mobile.breakpoint, "900px");
  assert.equal(shell.mobile.navigationBehavior, "offcanvas-drawer");
  assert.equal(shell.desktop.topUtilityRegionMayReplacePrimaryNavigation, false);
  assert.equal(shell.desktop.duplicateGlobalPrimaryNavigationInPageContent, false);

  assert.equal(
    read("fabbro-design/components/application-sidebar/VERSION").trim(),
    "1.0.0"
  );
  const sidebarContract = JSON.parse(
    read("fabbro-design/components/application-sidebar/contract.json")
  );
  assert.equal(sidebarContract.version, "1.0.0");
  assert.equal(sidebarContract.designSystemVersion, "0.2.0");
});

test("Kleos application is wired to the canonical Fabbro snapshot", () => {
  const globals = read("app/globals.css");
  const layout = read("app/layout.js");
  const manifest = JSON.parse(read("public/manifest.webmanifest"));

  assert.match(globals, /@import "\.\.\/fabbro-design\/fabbro-tokens\.css";/);
  assert.match(layout, /data-fabbro-product="kleos"/);
  assert.match(layout, /<KleosAppShell>/);
  assert.doesNotMatch(layout, /KleosNav/);
  assert.equal(manifest.background_color.toUpperCase(), "#000000");
  assert.equal(manifest.theme_color.toUpperCase(), "#000000");
});

test("deployed Kleos brand assets match the approved snapshot", () => {
  assert.equal(
    read("public/brand/kleos-mark.svg"),
    read("fabbro-design/assets/Kleos Logo.svg")
  );
  assert.equal(
    read("public/brand/kleos-lockup.svg"),
    read("fabbro-design/assets/Kleos Logo Colored With Text Beside.svg")
  );
  assert.equal(
    read("public/brand/fabbro-mark.svg"),
    read("fabbro-design/assets/Fabbro Systems Logo.svg")
  );
  assert.equal(read("public/icon.svg"), read("fabbro-design/assets/Kleos Logo.svg"));
});

test("legacy Kleos brand violet and boxed-K identity do not return", () => {
  const forbidden = [
    "#a78bfa",
    "#7c3aed",
    "#8b5cf6",
    "rgba(124, 58, 237",
    "rgba(167, 139, 250"
  ];

  const files = [
    ...collectTextFiles("app", [".css", ".js", ".jsx"]),
    ...collectTextFiles("components", [".css", ".js", ".jsx"]),
    ...collectTextFiles("public", [".svg", ".json", ".webmanifest"])
  ];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8").toLowerCase();
    for (const legacy of forbidden) {
      assert.equal(
        content.includes(legacy.toLowerCase()),
        false,
        `${path.relative(root, file)} still contains legacy brand value ${legacy}`
      );
    }
  }

  const workspace = read("components/KleosWorkspace.jsx");
  assert.doesNotMatch(workspace, /className="access-mark">K</);
});

test("Kleos uses the shadcn Sidebar composition for desktop primary navigation", () => {
  const primitive = read("fabbro-design/components/application-sidebar/react/sidebar.jsx");
  const sidebar = read("components/KleosSidebar.jsx");
  const shell = read("components/KleosAppShell.jsx");
  const packageJson = JSON.parse(read("package.json"));

  for (const exportName of [
    "SidebarProvider",
    "Sidebar",
    "SidebarContent",
    "SidebarGroup",
    "SidebarMenu",
    "SidebarMenuButton",
    "SidebarRail",
    "SidebarTrigger",
    "SidebarInset"
  ]) {
    assert.match(primitive, new RegExp(exportName));
  }

  assert.match(sidebar, /fabbro-design\/components\/application-sidebar\/react\/sidebar/);
  assert.match(sidebar, /<Sidebar collapsible="icon"/);
  assert.match(sidebar, /<SidebarRail \/>/);
  assert.match(sidebar, /KLEOS_PAGES\.map/);
  assert.match(shell, /fabbro-design\/components\/application-sidebar\/react\/sidebar/);
  assert.match(shell, /<SidebarProvider defaultOpen>/);
  assert.match(shell, /<KleosSidebar \/>/);
  assert.match(shell, /<SidebarInset/);
  assert.equal(packageJson.dependencies["lucide-react"], "^1.47.0");
});

test("primary navigation is left-side only and page content does not duplicate it", () => {
  const shell = read("components/KleosAppShell.jsx");
  const physical = read("components/PhysicalWorkspace.jsx");
  const workspace = read("components/KleosWorkspace.jsx");
  const sidebarCss = read("fabbro-design/components/application-sidebar/react/sidebar.module.css");

  assert.match(sidebarCss, /border-right:/);
  assert.match(sidebarCss, /position:\s*sticky/);
  assert.doesNotMatch(physical, /KleosNav|KleosSidebar|<Sidebar/);
  assert.doesNotMatch(workspace, /KleosNav|KleosSidebar|<Sidebar/);
  assert.doesNotMatch(shell, /KLEOS_PAGES\.map/);
});

test("shared application shell owns sign-out and mark-only Fabbro endorsement", () => {
  const shell = read("components/KleosAppShell.jsx");
  const shellCss = read("components/KleosAppShell.module.css");
  const physical = read("components/PhysicalWorkspace.jsx");
  const workspace = read("components/KleosWorkspace.jsx");
  const tokens = read("fabbro-design/fabbro-tokens.css");

  assert.match(shell, /supabase\.auth\.signOut\(\)/);
  assert.match(shell, /"Sign Out"/);
  assert.match(shell, /\/brand\/fabbro-mark\.svg/);
  assert.match(shell, /alt="Fabbro Systems"/);
  assert.doesNotMatch(shell, />Fabbro Systems</);
  assert.match(shellCss, /var\(--fs-family-mark-size\)/);
  assert.match(tokens, /--fs-family-mark-size:\s*24px/);

  assert.doesNotMatch(physical, /onClick=\{signOut\}/);
  assert.doesNotMatch(workspace, /onClick=\{signOut\}/);
});


test("Kleos does not maintain a fork of the canonical sidebar primitive", () => {
  assert.equal(fs.existsSync(path.join(root, "components", "ui", "sidebar.jsx")), false);
  assert.equal(fs.existsSync(path.join(root, "components", "ui", "sidebar.module.css")), false);

  const primitive = read("fabbro-design/components/application-sidebar/react/sidebar.jsx");
  assert.match(primitive, /fabbro:application-sidebar-expanded/);
});


test("signed-out Kleos uses the canonical public surface before private workspace mounts", () => {
  const shell = read("components/KleosAppShell.jsx");
  const publicSite = read("components/KleosPublicSite.jsx");
  const publicCss = read("components/KleosPublicSite.module.css");
  const layout = read("app/layout.js");
  const page = read("app/page.js");

  assert.match(shell, /authState === "loading"/);
  assert.match(shell, /if \(!hasSession\)/);
  assert.match(shell, /<KleosPublicSite/);
  assert.match(shell, /<MeasurementCorrections \/>/);
  assert.doesNotMatch(layout, /MeasurementCorrections/);

  assert.match(publicSite, /See your current state clearly\./);
  assert.match(publicSite, /id="how-it-works"/);
  assert.match(publicSite, /id="vectors"/);
  assert.match(publicSite, /id="methodology"/);
  assert.match(publicSite, /Evidence → state → action\./);
  assert.match(publicSite, /Synthetic example only/);

  assert.match(publicCss, /max-width:\s*var\(--fs-page-max\)/);
  assert.match(publicCss, /padding:\s*0 var\(--fs-page-gutter\)/);
  assert.match(publicCss, /var\(--fs-accent\)/);
  assert.match(page, /index:\s*true/);
  assert.match(page, /follow:\s*true/);
});


test("Kleos public shell conforms to Fabbro Public Shell 1.0.0", () => {
  const contract = JSON.parse(
    read("fabbro-design/components/public-shell/contract.json")
  );
  const publicSite = read("components/KleosPublicSite.jsx");
  const publicCss = read("components/KleosPublicSite.module.css");

  assert.equal(contract.version, "1.0.0");
  assert.equal(contract.designSystemVersion, "0.3.0");
  assert.equal(
    contract.header.desktop.gridTemplateColumns,
    "minmax(220px, 1fr) auto minmax(120px, 1fr)"
  );
  assert.equal(contract.header.navigation.labels, "product-owned");
  assert.equal(contract.header.navigation.familyLinkInPrimaryNavigation, false);
  assert.equal(contract.footer.productLockupWidth, "150px");
  assert.equal(contract.footer.familyMarkSize, "22px");

  assert.match(publicCss, /grid-template-columns:\s*var\(--fs-public-header-grid\)/);
  assert.match(publicCss, /var\(--fs-public-header-lockup-max\)/);
  assert.match(publicCss, /var\(--fs-public-header-lockup-compact\)/);
  assert.match(publicCss, /var\(--fs-public-header-lockup-mobile\)/);
  assert.match(publicCss, /font-size:\s*var\(--fs-type-hero-sub-size\)/);
  assert.match(publicCss, /font-weight:\s*var\(--fs-type-kicker-weight\)/);
  assert.match(publicCss, /var\(--fs-focus-outline-width\)/);
  assert.match(publicCss, /var\(--fs-focus-outline-offset\)/);
  assert.match(publicCss, /var\(--fs-public-footer-product-lockup\)/);
  assert.match(publicCss, /var\(--fs-public-footer-family-mark\)/);

  const publicNav = publicSite.match(
    /<nav className=\{styles\.nav\}[\s\S]*?<\/nav>/
  )?.[0] || "";
  assert.doesNotMatch(publicNav, /Fabbro Systems/);
  assert.match(publicNav, /How It Works/);
  assert.match(publicNav, /Vectors/);
  assert.match(publicNav, /Methodology/);
});
