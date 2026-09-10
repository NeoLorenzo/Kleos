import { VECTOR_DEFINITIONS } from "@/lib/kleos/vectorSnapshots";

export const KLEOS_PAGES = Object.freeze([
  Object.freeze({ id: "character-sheet", label: "Character Sheet", path: "/" }),
  ...VECTOR_DEFINITIONS.map((vector) =>
    Object.freeze({ id: vector.id, label: vector.label, path: `/${vector.id}/` })
  )
]);

export function getKleosPage(pageId) {
  return KLEOS_PAGES.find((page) => page.id === pageId) || KLEOS_PAGES[0];
}
