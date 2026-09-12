import Link from "next/link";
import styles from "../legal.module.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata = {
  title: "Privacy Policy · Kleos",
  description: "Privacy policy for the private Kleos personal finance and self-knowledge application."
};

export default function PrivacyPage() {
  return (
    <main className={styles.legalShell}>
      <article className={styles.legalCard}>
        <header>
          <p className="kleos-kicker">Kleos</p>
          <h1>Privacy Policy</h1>
          <p className={styles.meta}>Effective 12 September 2026</p>
        </header>

        <p>
          Kleos is a private personal application used by its owner to consolidate personal evidence,
          including financial account information. It is not offered as a public banking, payment, or
          financial-advice service.
        </p>

        <h2>Financial data access</h2>
        <p>
          When the owner chooses to connect a bank account, Kleos uses Enable Banking to facilitate
          read-only Open Banking access. The owner is redirected through the bank&apos;s authorization flow
          and explicitly approves access. Kleos does not receive or store the owner&apos;s bank password or
          other bank-login credentials, and it does not initiate payments through this integration.
        </p>

        <h2>Data Kleos stores</h2>
        <p>
          For connected financial accounts, Kleos may store provider connection metadata, normalized
          account metadata, masked account identifiers, account balances, transaction dates, amounts,
          currencies, descriptions, counterparties, transaction status, and provider response data needed
          for synchronization and auditability. Full IBAN or BBAN values are not intentionally persisted;
          account identifiers are reduced to a masked form for display and storage in the normalized account
          record.
        </p>

        <h2>Purpose</h2>
        <p>
          The data is used only to operate the owner&apos;s private Kleos workspace: displaying current
          financial state, maintaining historical evidence, and supporting the owner&apos;s personal analysis
          and Kleos evaluations. It is not sold, used for advertising, or made available to unrelated third
          parties.
        </p>

        <h2>Service providers</h2>
        <p>
          Kleos relies on infrastructure providers required to operate the application, including Supabase
          for authentication, database, and server-side functions; GitHub Pages for the static web interface;
          and Enable Banking for Open Banking connectivity. Those providers process data according to their
          own terms and privacy obligations.
        </p>

        <h2>Security</h2>
        <p>
          Financial synchronization credentials and the Enable Banking application private key are kept on
          the server side and are not embedded in the browser application. Kleos uses authenticated access
          controls and row-level security for private financial records.
        </p>

        <h2>Retention, revocation, and deletion</h2>
        <p>
          Open Banking authorization may be revoked or allowed to expire at any time through the relevant
          bank or provider flow. Revoking access stops future retrieval but does not automatically erase
          financial evidence already stored in Kleos. Stored Kleos data can be deleted by the application
          owner from the underlying private data store when it is no longer required.
        </p>

        <h2>Changes</h2>
        <p>
          This policy may be updated when Kleos changes how it processes personal data or changes service
          providers. The effective date above identifies the current version.
        </p>

        <Link className={styles.homeLink} href={`${basePath}/`}>
          Return to Kleos
        </Link>
      </article>
    </main>
  );
}
