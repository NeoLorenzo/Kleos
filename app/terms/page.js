import Link from "next/link";
import styles from "../legal.module.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata = {
  title: "Terms of Use · Kleos",
  description: "Terms of use for the private Kleos personal application."
};

export default function TermsPage() {
  return (
    <main className={styles.legalShell}>
      <article className={styles.legalCard}>
        <header>
          <p className="kleos-kicker">Kleos</p>
          <h1>Terms of Use</h1>
          <p className={styles.meta}>Effective 12 September 2026</p>
        </header>

        <p>
          Kleos is a private personal application maintained for the application owner&apos;s own use. These
          terms describe the operation of the Kleos interface used in connection with Open Banking account
          information.
        </p>

        <h2>Private-use scope</h2>
        <p>
          Kleos is not offered to the public and is not intended for use by third parties. It is not a bank,
          payment institution, investment service, accounting service, or financial-advice service.
        </p>

        <h2>Read-only bank connectivity</h2>
        <p>
          Bank-account information is accessed only after the account owner explicitly authorizes access
          through Enable Banking and the relevant bank. The Kleos integration is designed for account
          information such as accounts, balances, and transactions. It does not use this connection to
          initiate payments or transfers.
        </p>

        <h2>Authorization and access</h2>
        <p>
          The owner is responsible for authorizing only accounts they are entitled to access and for keeping
          the Kleos account, Enable Banking application credentials, and related devices secure. Bank and
          Open Banking authorizations remain subject to the terms imposed by the relevant bank and Enable
          Banking.
        </p>

        <h2>Data accuracy and availability</h2>
        <p>
          Kleos displays data supplied by banks and connectivity providers and may normalize that data for
          consistency. Data can be delayed, incomplete, unavailable, or changed by upstream providers. Kleos
          should not be treated as the authoritative source for a bank balance, transaction settlement status,
          tax position, or other legally significant financial record.
        </p>

        <h2>No financial advice</h2>
        <p>
          Financial information shown in Kleos is maintained as personal evidence and context. Nothing in the
          application constitutes a recommendation to buy, sell, borrow, transfer funds, or take any other
          financial action.
        </p>

        <h2>Availability and changes</h2>
        <p>
          The owner may modify, suspend, or discontinue Kleos or any integration at any time. Access may also
          stop when bank consent expires, is revoked, or when an external provider changes or discontinues its
          service.
        </p>

        <h2>Third-party services</h2>
        <p>
          Use of Enable Banking, the connected bank, Supabase, GitHub, and other infrastructure remains
          subject to the terms that apply to those services. These Kleos terms do not replace those third-party
          agreements.
        </p>

        <Link className={styles.homeLink} href={`${basePath}/`}>
          Return to Kleos
        </Link>
      </article>
    </main>
  );
}
