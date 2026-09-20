import { KLEOS_PAGES } from "@/lib/kleos/routes";
import styles from "./KleosNav.module.css";

export default function KleosNav({ basePath = "" }) {
  return (
    <nav className={styles.nav} aria-label="Kleos navigation">
      <a className={styles.brand} href={`${basePath}/`} aria-label="Kleos home">
        <img src={`${basePath}/brand/kleos-lockup.svg`} alt="Kleos" />
      </a>

      <div className={styles.links}>
        {KLEOS_PAGES.map((page) => (
          <a key={page.id} href={`${basePath}${page.path}`}>
            {page.label}
          </a>
        ))}
      </div>

      <span className={styles.family}>Fabbro Systems</span>
    </nav>
  );
}
