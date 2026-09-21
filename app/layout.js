import "./globals.css";
import KleosAppShell from "@/components/KleosAppShell";

export const metadata = {
  metadataBase: new URL("https://kleos.fabbrosystems.com"),
  title: "Kleos",
  description: "Evidence-based current-state modeling and self-knowledge workspace",
  alternates: {
    canonical: "/"
  },
  robots: {
    index: false,
    follow: false
  },
  openGraph: {
    type: "website",
    siteName: "Kleos",
    title: "Kleos",
    description: "Evidence-based current-state modeling and self-knowledge workspace",
    url: "/"
  },
  twitter: {
    card: "summary",
    title: "Kleos",
    description: "Evidence-based current-state modeling and self-knowledge workspace"
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
