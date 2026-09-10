import { KLEOS_PAGES } from "@/lib/kleos/routes";
import styles from "./KleosNav.module.css";

export default function KleosNav({ basePath = "" }) {
  return (
    <nav className={styles.nav} aria-label="Kleos navigation">
      {KLEOS_PAGES.map((page) => (
        <a key={page.id} href={`${basePath}${page.path}`}>
          {page.label}
        </a>
      ))}
    </nav>
  );
}
