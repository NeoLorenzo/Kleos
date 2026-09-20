import "./globals.css";
import MeasurementCorrections from "@/components/MeasurementCorrections";
import KleosNav from "@/components/KleosNav";

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
        <KleosNav basePath={basePath} />
        {children}
        <MeasurementCorrections />
      </body>
    </html>
  );
}
