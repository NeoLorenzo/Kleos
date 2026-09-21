import KleosWorkspace from "@/components/KleosWorkspace";

export const metadata = {
  title: "Kleos · Evidence-based current-state modelling",
  description:
    "Kleos turns fragmented personal evidence into an inspectable, longitudinal model of current state across eight life vectors.",
  robots: {
    index: true,
    follow: true
  },
  openGraph: {
    title: "Kleos · See your current state clearly",
    description:
      "Evidence-based current-state modelling with explicit assessments, visible coverage and confidence, and immutable longitudinal snapshots.",
    url: "/"
  },
  twitter: {
    card: "summary",
    title: "Kleos · See your current state clearly",
    description:
      "Evidence-based current-state modelling with explicit assessments, visible coverage and confidence."
  }
};

export default function Page() {
  return <KleosWorkspace activePage="character-sheet" />;
}
