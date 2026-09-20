import "./globals.css";
import KleosAppShell from "@/components/KleosAppShell";
import MeasurementCorrections from "@/components/MeasurementCorrections";

export const metadata = {
  title: "Kleos",
  description: "Evidence-based current-state modeling and self-knowledge workspace",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg"
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body data-fabbro-product="kleos">
        <KleosAppShell>{children}</KleosAppShell>
        <MeasurementCorrections />
      </body>
    </html>
  );
}
