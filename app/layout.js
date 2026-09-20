import "./globals.css";
import KleosAppShell from "@/components/KleosAppShell";
import MeasurementCorrections from "@/components/MeasurementCorrections";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata = {
  title: "Kleos",
  description: "Evidence-based current-state modeling and self-knowledge workspace",
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: `${basePath}/icon.svg`
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body data-fabbro-product="kleos">
        <KleosAppShell basePath={basePath}>{children}</KleosAppShell>
        <MeasurementCorrections />
      </body>
    </html>
  );
}
