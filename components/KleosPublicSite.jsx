"use client";

import styles from "./KleosPublicSite.module.css";

const VECTORS = [
  {
    id: "physical",
    label: "Physical",
    description: "Health, physiology, body state, activity, nutrition, and physical capability."
  },
  {
    id: "psychological",
    label: "Psychological",
    description: "Psychological characteristics, assessments, affective state, and mental functioning."
  },
  {
    id: "intellectual",
    label: "Intellectual",
    description: "Cognitive performance, academic evidence, learning, and intellectual development."
  },
  {
    id: "professional",
    label: "Professional",
    description: "Career evidence, capabilities, trajectory, achievements, and professional position."
  },
  {
    id: "financial",
    label: "Financial",
    description: "Assets, liabilities, cash flow, financial resilience, and current financial position."
  },
  {
    id: "relational",
    label: "Relational",
    description: "Relationships, social connection, support, and the quality of interpersonal life."
  },
  {
    id: "experiential",
    label: "Experiential",
    description: "Breadth, novelty, meaningful experiences, and engagement with the world."
  },
  {
    id: "creative",
    label: "Creative",
    description: "Creative practice, output, expression, and the development of original work."
  }
];

const MODEL_STAGES = [
  {
    number: "01",
    title: "Evidence",
    body: "Kleos starts with source material: structured records, measurements, assessments, documents, and bounded outputs from specialist systems."
  },
  {
    number: "02",
    title: "Assessment",
    body: "Evidence is interpreted against an explicit methodology. Missing evidence can remain unknown rather than becoming an invented score."
  },
  {
    number: "03",
    title: "State",
    body: "Subdomain judgments are combined deterministically into an eight-vector model with visible coverage and confidence."
  },
  {
    number: "04",
    title: "History",
    body: "Immutable snapshots preserve how the model looked at a point in time so changes remain inspectable."
  }
];

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
          <a href="https://fabbrosystems.com/">Fabbro Systems</a>
        </nav>

        <button
          className={styles.signIn}
          type="button"
          onClick={onSignIn}
          disabled={isSigningIn || !signInAvailable}
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
              Kleos organizes evidence across the major dimensions of your life into an
              interpretable model of where you are now—while keeping sources, interpretation,
              confidence, and uncertainty distinct.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="#how-it-works">
                Explore Kleos
              </a>
              <a className={styles.secondaryButton} href="#methodology">
                See the methodology
              </a>
            </div>
            {authMessage ? <p className={styles.authMessage}>{authMessage}</p> : null}
          </div>

          <StateModel />
        </section>

        <section className={styles.problemSection}>
          <div className={styles.sectionHeading}>
            <p className={styles.sectionKicker}>The problem</p>
            <h2>Your life produces evidence everywhere. Almost none of it becomes a coherent model.</h2>
            <p>
              Health data, training, assessments, academic results, finances, career history,
              relationships, and personal records answer different questions. Kleos keeps those
              differences intact while making the overall state legible.
            </p>
          </div>
        </section>

        <section className={styles.section} id="how-it-works">
          <div className={styles.sectionHeading}>
            <p className={styles.sectionKicker}>How it works</p>
            <h2>Evidence → assessment → state → history.</h2>
            <p>
              Kleos separates what was observed from what was inferred. The result is a model
              that can be inspected, challenged, and compared over time.
            </p>
          </div>

          <div className={styles.stageGrid}>
            {MODEL_STAGES.map((stage) => (
              <article className={styles.stageCard} key={stage.number}>
                <span>{stage.number}</span>
                <h3>{stage.title}</h3>
                <p>{stage.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section} id="vectors">
          <div className={styles.sectionHeading}>
            <p className={styles.sectionKicker}>Eight-vector model</p>
            <h2>One person. Eight distinct dimensions.</h2>
            <p>
              The vectors are stable parts of the model, not a single gamified score. Each vector
              is assessed through defined subdomains with its own evidence, coverage, and confidence.
            </p>
          </div>

          <div className={styles.vectorGrid}>
            {VECTORS.map((vector, index) => (
              <article className={styles.vectorCard} key={vector.id}>
                <div className={styles.vectorCardTop}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <span className={styles.vectorSignal} aria-hidden="true" />
                </div>
                <h3>{vector.label}</h3>
                <p>{vector.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section} id="methodology">
          <div className={styles.methodologyGrid}>
            <div>
              <p className={styles.sectionKicker}>Methodology</p>
              <h2>Interpretation should remain inspectable.</h2>
              <p className={styles.sectionBody}>
                Kleos does not ask a model for eight unexplained numbers. It evaluates fixed
                subdomains against fixed anchors, records the judgments, and lets the persistence
                layer calculate vector state deterministically.
              </p>

              <div className={styles.principleList}>
                <article>
                  <span>01</span>
                  <div>
                    <h3>Evidence stays traceable</h3>
                    <p>Source material remains distinguishable from the conclusions drawn from it.</p>
                  </div>
                </article>
                <article>
                  <span>02</span>
                  <div>
                    <h3>Interpretation stays explicit</h3>
                    <p>Subdomain judgments map to defined anchors rather than hidden holistic scoring.</p>
                  </div>
                </article>
                <article>
                  <span>03</span>
                  <div>
                    <h3>Confidence stays visible</h3>
                    <p>Coverage and confidence are part of the state rather than decorative metadata.</p>
                  </div>
                </article>
                <article>
                  <span>04</span>
                  <div>
                    <h3>Unknown stays unknown</h3>
                    <p>Insufficient evidence reduces coverage instead of manufacturing mediocrity.</p>
                  </div>
                </article>
              </div>
            </div>

            <aside className={styles.methodPreview} aria-label="Illustrative Kleos assessment flow">
              <div className={styles.previewHeader}>
                <span>Illustrative example</span>
                <strong>Inspectable state</strong>
              </div>

              <div className={styles.previewLayer}>
                <span>Evidence</span>
                <div>
                  <strong>Structured source records</strong>
                  <p>Repeated observations, assessments, and source documents.</p>
                </div>
              </div>

              <div className={styles.previewConnector} aria-hidden="true" />

              <div className={styles.previewLayer}>
                <span>Assessment</span>
                <div>
                  <strong>Fixed subdomain anchor</strong>
                  <p>Evidence is sufficient to characterize this subdomain; confidence is recorded.</p>
                </div>
              </div>

              <div className={styles.previewConnector} aria-hidden="true" />

              <div className={styles.previewLayer}>
                <span>Vector state</span>
                <div>
                  <strong>Calculated from assessed subdomains</strong>
                  <p>Coverage and confidence remain visible beside the derived vector result.</p>
                </div>
              </div>

              <p className={styles.previewNote}>
                Synthetic example only. The public surface never renders private Kleos evidence.
              </p>
            </aside>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.longitudinalGrid}>
            <div>
              <p className={styles.sectionKicker}>Longitudinal state</p>
              <h2>Current state matters more when its history is preserved.</h2>
              <p className={styles.sectionBody}>
                Each evaluation becomes an immutable snapshot. That makes it possible to ask not
                only “where am I now?” but also “what changed, and what evidence supported the
                earlier interpretation?”
              </p>
            </div>

            <div className={styles.timeline} aria-label="Illustrative immutable Kleos snapshots">
              <div className={styles.timelineLine} aria-hidden="true" />
              {["Earlier state", "Intermediate state", "Current state"].map((label, index) => (
                <div className={styles.timelineItem} key={label}>
                  <span className={styles.timelineDot} aria-hidden="true" />
                  <div>
                    <small>Snapshot {String(index + 1).padStart(2, "0")}</small>
                    <strong>{label}</strong>
                    <p>Evidence · assessments · coverage · confidence</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section} id="fabbro-context">
          <div className={styles.sectionHeading}>
            <p className={styles.sectionKicker}>Fabbro Systems</p>
            <h2>Evidence → state → action.</h2>
            <p>
              Kleos occupies the current-state layer of the Fabbro Systems family. Specialist
              systems can produce richer evidence; Kleos makes that evidence legible; Ariadne
              organizes desired movement.
            </p>
          </div>

          <div className={styles.familyFlow} aria-label="Fabbro Systems product relationship">
            <a href="https://heracles.fabbrosystems.com/">
              <span>01 · Evidence</span>
              <strong>Heracles</strong>
              <p>Domain evidence and interpretation for resistance training.</p>
            </a>
            <span className={styles.familyArrow} aria-hidden="true">→</span>
            <a className={styles.currentFamilyStage} href="#top">
              <span>02 · State</span>
              <strong>Kleos</strong>
              <p>Evidence-based modelling of the person's current state.</p>
            </a>
            <span className={styles.familyArrow} aria-hidden="true">→</span>
            <a href="https://ariadne.fabbrosystems.com/">
              <span>03 · Action</span>
              <strong>Ariadne</strong>
              <p>Strategy, priorities, opportunities, projects, tasks, and execution.</p>
            </a>
          </div>
        </section>

        <section className={styles.closingSection}>
          <div>
            <p className={styles.sectionKicker}>Kleos</p>
            <h2>Make your current state legible.</h2>
          </div>
          <p>
            The current deployment is an owner-focused private workspace. The public layer explains
            the model; authentication opens the existing private application.
          </p>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={onSignIn}
            disabled={isSigningIn || !signInAvailable}
          >
            {signInLabel}
          </button>
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

function StateModel() {
  return (
    <div className={styles.stateVisual} aria-label="Illustrative eight-vector current-state model">
      <div className={styles.orbit} aria-hidden="true" />
      <div className={styles.orbitInner} aria-hidden="true" />
      <div className={styles.stateCore}>
        <img src="/brand/kleos-mark.svg" alt="" aria-hidden="true" />
        <span>Current state</span>
        <strong>Legible</strong>
      </div>

      {VECTORS.map((vector, index) => (
        <span
          className={styles.vectorNode}
          data-position={String(index + 1)}
          key={vector.id}
        >
          {vector.label}
        </span>
      ))}
    </div>
  );
}
