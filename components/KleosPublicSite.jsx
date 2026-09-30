"use client";

import CharacterSheetPreview from "./public/CharacterSheetPreview";
import EvidencePipeline from "./public/EvidencePipeline";
import ModelSimulator from "./public/ModelSimulator";
import RadianceField from "./public/RadianceField";
import UseCases from "./public/UseCases";
import VectorExplorer from "./public/VectorExplorer";
import { useInView } from "./public/useInView";
import styles from "./KleosPublicSite.module.css";

const SOURCE_ROWS = [
  [
    "Apple Health",
    "Heart-rate variability",
    "Heracles strength",
    "Sleep stages",
    "Open banking",
    "Big Five inventory",
    "Academic transcripts",
    "Blood panels",
    "Asset register",
    "WHO-5"
  ],
  [
    "CV & role history",
    "Cognitive tests",
    "Nutrition logs",
    "Resting heart rate",
    "PHQ-9",
    "Creative portfolio",
    "Relationship notes",
    "Experience log",
    "GAD-7",
    "SWLS"
  ]
];

const PRINCIPLES = [
  {
    title: "Evidence stays traceable",
    body: "Source material remains distinguishable from the conclusions drawn from it."
  },
  {
    title: "Interpretation stays explicit",
    body: "Subdomain judgments map to fixed anchors, with no hidden holistic scoring."
  },
  {
    title: "Confidence stays visible",
    body: "Coverage and confidence are part of the state, not decorative metadata."
  },
  {
    title: "Unknown stays unknown",
    body: "Insufficient evidence reduces coverage. It never produces a made-up middling score."
  }
];

const CONTRASTS = [
  ["One opaque score for your whole life", "Eight vectors, forty subdomains, no cross-vector total"],
  ["Missing data quietly counts as zero", "Unassessable subdomains stay explicitly unknown"],
  ["A model invents the number", "Fixed anchors, fixed weights, deterministic arithmetic"],
  ["Yesterday's dashboard is overwritten", "Every evaluation is an immutable, versioned snapshot"],
  ["Confidence is implied", "Coverage and confidence are shown next to every result"]
];

const STATS = [
  { value: "8", label: "life vectors" },
  { value: "40", label: "weighted subdomains" },
  { value: "7", label: "fixed anchors" },
  { value: "0", label: "invented scores" }
];

function Reveal({ as: Tag = "div", className = "", children, ...rest }) {
  const [ref, inView] = useInView({ threshold: 0.15 });
  return (
    <Tag ref={ref} className={`${styles.reveal} ${inView ? styles.revealed : ""} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

function SectionHeading({ kicker, title, children, id, align = "start" }) {
  return (
    <Reveal className={`${styles.sectionHeading} ${align === "center" ? styles.centered : ""}`}>
      <p className={styles.sectionKicker}>{kicker}</p>
      <h2 id={id}>{title}</h2>
      {children ? <p className={styles.sectionLede}>{children}</p> : null}
    </Reveal>
  );
}

export default function KleosPublicSite({
  onSignIn,
  isSigningIn = false,
  signInAvailable = true,
  authMessage = ""
}) {
  const signInLabel = isSigningIn
    ? "Opening sign in…"
    : signInAvailable
      ? "Sign In"
      : "Sign In Unavailable";
  const startLabel = isSigningIn ? "Opening sign in…" : "Start with Google";
  const signInDisabled = isSigningIn || !signInAvailable;

  return (
    <div className={styles.site} id="top">
      <header className={styles.header}>
        <a className={styles.productBrand} href="#top" aria-label="Kleos home">
          <img src="/brand/kleos-lockup.svg" alt="Kleos" />
        </a>

        <nav className={styles.nav} aria-label="Kleos public navigation">
          <a href="#how-it-works">How It Works</a>
          <a href="#vectors">Vectors</a>
          <a href="#methodology">Methodology</a>
          <a href="#use-cases">Use Cases</a>
        </nav>

        <button
          className={styles.signIn}
          type="button"
          onClick={onSignIn}
          disabled={signInDisabled}
        >
          {signInLabel}
        </button>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="kleos-public-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Kleos · Current-state modelling</p>
            <h1 id="kleos-public-title">See your current state clearly.</h1>
            <p className={styles.heroLede}>
              Kleos turns the evidence your life already produces into one honest model of where
              you are now, across eight dimensions.
            </p>
            <div className={styles.heroActions}>
              <button
                className={styles.primaryButton}
                type="button"
                onClick={onSignIn}
                disabled={signInDisabled}
              >
                {startLabel}
              </button>
              <a className={styles.secondaryButton} href="#how-it-works">
                See how it works
              </a>
            </div>
            {authMessage ? <p className={styles.authMessage}>{authMessage}</p> : null}

            <dl className={styles.stats}>
              {STATS.map((stat) => (
                <div key={stat.label}>
                  <dt>{stat.label}</dt>
                  <dd>{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className={styles.heroVisual}>
            <RadianceField />
          </div>
        </section>

        <section className={styles.showcase} aria-labelledby="showcase-title">
          <SectionHeading
            id="showcase-title"
            kicker="The character sheet"
            title="Your whole life on one honest page."
            align="center"
          >
            Every dimension, its confidence, its trajectory, and what can't be assessed yet. Click
            into any vector to see the evidence and reasoning behind it.
          </SectionHeading>
          <div className={styles.showcaseWindow}>
            <CharacterSheetPreview />
          </div>
          <p className={styles.syntheticNote}>
            Synthetic example only. The public surface never renders private Kleos evidence.
          </p>
        </section>

        <section className={styles.problemSection} aria-labelledby="problem-title">
          <SectionHeading
            id="problem-title"
            kicker="The problem"
            title="Your life produces evidence everywhere. Almost none of it becomes a coherent model."
            align="center"
          >
            Health data, training, assessments, transcripts, finances, and career history each answer
            different questions. Kleos keeps those differences intact while making the overall
            state legible.
          </SectionHeading>

          <div className={styles.marquee} aria-label="Examples of evidence Kleos can model">
            {SOURCE_ROWS.map((row, rowIndex) => (
              <div className={styles.marqueeRow} key={rowIndex} data-direction={rowIndex % 2 ? "reverse" : "forward"}>
                <div className={styles.marqueeTrack}>
                  {[...row, ...row].map((source, index) => (
                    <span key={`${source}-${index}`} aria-hidden={index >= row.length ? "true" : undefined}>
                      <i aria-hidden="true" />
                      {source}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section} id="how-it-works" aria-labelledby="how-title">
          <SectionHeading id="how-title" kicker="How it works" title="Evidence → assessment → state → history.">
            Kleos separates what was observed from what was inferred. Follow one vector from raw
            records to a frozen snapshot.
          </SectionHeading>
          <EvidencePipeline />
        </section>

        <section className={styles.section} id="vectors" aria-labelledby="vectors-title">
          <SectionHeading id="vectors-title" kicker="Eight-vector model" title="One person. Eight distinct dimensions.">
            Eight rays, like the Radiance mark. Each vector has five weighted subdomains with its own
            evidence, coverage, and confidence. There is no single gamified total.
          </SectionHeading>
          <VectorExplorer />
        </section>

        <section className={styles.section} id="methodology" aria-labelledby="methodology-title">
          <SectionHeading
            id="methodology-title"
            kicker="Methodology · try it yourself"
            title="Interpretation should remain inspectable."
          >
            Kleos doesn't ask a model for eight unexplained numbers. It judges fixed subdomains
            against fixed anchors, then calculates the vector deterministically. Change the judgments
            below and watch the rules respond.
          </SectionHeading>

          <Reveal className={styles.simulatorWrap}>
            <ModelSimulator />
          </Reveal>

          <div className={styles.principles}>
            {PRINCIPLES.map((principle, index) => (
              <Reveal as="article" key={principle.title} style={{ "--delay": `${index * 90}ms` }}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{principle.title}</h3>
                <p>{principle.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section className={styles.section} id="use-cases" aria-labelledby="use-cases-title">
          <SectionHeading id="use-cases-title" kicker="Use cases" title="Built for the questions you actually ask.">
            Kleos is useful the moment you want a straight answer about yourself, and more useful
            every month you keep it.
          </SectionHeading>
          <UseCases />
        </section>

        <section className={styles.section} aria-labelledby="contrast-title">
          <SectionHeading id="contrast-title" kicker="Why Kleos" title="Self-knowledge without the flattery.">
            Most self-tracking tools optimise for a satisfying number. Kleos is built to be trusted.
          </SectionHeading>

          <Reveal className={styles.contrast}>
            <div className={styles.contrastHead}>
              <span>Typical self-tracking</span>
              <span>Kleos</span>
            </div>
            {CONTRASTS.map(([before, after], index) => (
              <div className={styles.contrastRow} key={after} style={{ "--i": index }}>
                <span className={styles.contrastBefore}>{before}</span>
                <span className={styles.contrastAfter}>{after}</span>
              </div>
            ))}
          </Reveal>
        </section>

        <section className={styles.section} id="fabbro-context" aria-labelledby="family-title">
          <SectionHeading id="family-title" kicker="Fabbro Systems" title="Evidence → state → action.">
            Kleos is the current-state layer of the Fabbro Systems family. Specialist systems produce
            richer evidence, Kleos makes it legible, and Ariadne turns it into direction.
          </SectionHeading>

          <Reveal className={styles.familyFlow} aria-label="Fabbro Systems product relationship">
            <a href="https://heracles.fabbrosystems.com/">
              <span>01 · Evidence</span>
              <strong>Heracles</strong>
              <p>Domain evidence and interpretation for resistance training.</p>
            </a>
            <span className={styles.familyBeam} aria-hidden="true" />
            <a className={styles.currentFamilyStage} href="#top">
              <span>02 · State</span>
              <strong>Kleos</strong>
              <p>Evidence-based modelling of the person&apos;s current state.</p>
            </a>
            <span className={styles.familyBeam} aria-hidden="true" />
            <a href="https://ariadne.fabbrosystems.com/">
              <span>03 · Action</span>
              <strong>Ariadne</strong>
              <p>Strategy, priorities, opportunities, projects, tasks, and execution.</p>
            </a>
          </Reveal>
        </section>

        <section className={styles.closingSection} aria-labelledby="closing-title">
          <div className={styles.closingMark} aria-hidden="true">
            <img src="/brand/kleos-mark.svg" alt="" />
          </div>
          <p className={styles.sectionKicker}>Recognition begins with evidence</p>
          <h2 id="closing-title">Make your current state legible.</h2>
          <p className={styles.closingLede}>
            Sign in with Google to open your private workspace. Your evidence stays yours, protected
            by row-level security and never shown on a public page.
          </p>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={onSignIn}
            disabled={signInDisabled}
          >
            {startLabel}
          </button>
          {authMessage ? <p className={styles.authMessage}>{authMessage}</p> : null}
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerIdentities}>
          <a href="#top" aria-label="Kleos home">
            <img className={styles.footerProduct} src="/brand/kleos-lockup.svg" alt="Kleos" />
          </a>
          <a
            className={styles.fabbroEndorsement}
            href="https://fabbrosystems.com/"
            aria-label="Fabbro Systems"
          >
            <img src="/brand/fabbro-mark.svg" alt="" aria-hidden="true" />
            <span>Fabbro Systems</span>
          </a>
        </div>

        <nav className={styles.footerNav} aria-label="Footer navigation">
          <a href="/privacy/">Privacy</a>
          <a href="/terms/">Terms</a>
          <a href="https://fabbrosystems.com/">Fabbro Systems</a>
        </nav>
      </footer>
    </div>
  );
}
