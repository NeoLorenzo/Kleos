import "./globals.css";
import CharacterSheetHomeShell from "@/components/CharacterSheetHomeShell";
import MeasurementCorrections from "@/components/MeasurementCorrections";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata = {
  title: "Kleos",
  description: "Private character-state, personal measurement, benchmarking, and self-knowledge workspace",
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: `${basePath}/icon.svg`
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <CharacterSheetHomeShell />
        {children}
        <MeasurementCorrections />
      </body>
    </html>
  );
}
