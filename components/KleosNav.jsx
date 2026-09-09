import styles from "./KleosNav.module.css";

export default function KleosNav({ basePath = "" }) {
  return (
    <nav className={styles.nav} aria-label="Kleos navigation">
      <a href={`${basePath}/`}>Character sheet</a>
      <a href={`${basePath}/psychological-assessment/`}>Psychological battery</a>
    </nav>
  );
}
