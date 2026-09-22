import KleosWorkspace from "@/components/KleosWorkspace";

const description =
  "Kleos turns fragmented personal evidence into an inspectable, longitudinal model of current state across eight life vectors, with explicit methodology, coverage and confidence.";

export const metadata = {
  title: "Kleos | Personal state modelling and self-knowledge",
  description,
  alternates: {
    canonical: "/"
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  },
  openGraph: {
    type: "website",
    siteName: "Kleos",
    title: "Kleos | See your current state clearly",
    description,
    url: "/",
    images: [
      {
        url: "https://fabbrosystems.com/og/kleos.png",
        width: 1200,
        height: 627,
        alt: "Kleos — See your current state clearly"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Kleos | See your current state clearly",
    description:
      "Evidence-based current-state modelling with explicit assessments, visible coverage and confidence, and longitudinal snapshots.",
    images: ["https://fabbrosystems.com/og/kleos.png"]
  }
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://kleos.fabbrosystems.com/#website",
      url: "https://kleos.fabbrosystems.com/",
      name: "Kleos",
      description
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://kleos.fabbrosystems.com/#application",
      name: "Kleos",
      url: "https://kleos.fabbrosystems.com/",
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web",
      description
    }
  ]
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <KleosWorkspace activePage="character-sheet" />
    </>
  );
}
