import "./globals.css";
import KleosAppShell from "@/components/KleosAppShell";

export const metadata = {
  metadataBase: new URL("https://kleos.fabbrosystems.com"),
  title: "Kleos",
  description:
    "Kleos is an evidence-based personal state modelling and self-knowledge system with explicit methodology, coverage and confidence.",
  robots: {
    index: false,
    follow: false
  },
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
      </body>
    </html>
  );
}
