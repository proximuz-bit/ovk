// Kundhantering: en kund är den part man besiktigar åt (normalt byggnadsägaren).
// Uppdrag kopplas till en kund via kundId. Vid import/nytt uppdrag skapas kunden
// automatiskt utifrån byggnadsägarens namn om ingen redan matchar.
import * as db from "./db.js";
import { nyKund } from "./model.js";

// Normalisera ett kundnamn för jämförelse (skiftläge, skiljetecken, bolagsform).
export function normaliseraKund(namn) {
  return String(namn || "")
    .toLowerCase()
    .replace(/[.,:;/\\()]/g, " ")
    .replace(/\b(ab|hb|kb|ef|ek\.?\s*för|ekonomisk[af]?\s*förening|aktiebolag)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Delar upp en relativ sökväg ("Kund/Objekt/fil.xls") i kund och objekt.
// Toppnivån är kunden, närmaste undermapp är objektet (årsmappar hoppas över).
export function kundOchObjekt(rel, medMapp) {
  if (!medMapp || !rel) return { kund: "", objekt: "" };
  const delar = String(rel).split("/").filter(Boolean);
  const kund = delar.length > 1 ? delar[0].trim() : "";
  let objekt = delar.length > 2 ? delar[1].trim() : "";
  if (/^\d{4}$/.test(objekt)) objekt = "";
  return { kund, objekt };
}

// Förvald kund för ett nytt uppdrag (sätts när man klickar "+ Nytt uppdrag"
// i en kundflik, så man slipper välja kund igen).
let _forvaldKund = "";
export function settForvaldKund(id) { _forvaldKund = id || ""; }
export function forvaldKund() { return _forvaldKund; }

export function kundNamn(kunder, id) {
  if (!id) return "Utan kund";
  const k = (kunder || []).find((x) => x.id === id);
  return k ? k.namn : "Utan kund";
}

// Slå upp eller skapa en kund med givet namn (matchar normaliserat).
export async function skapaKund(namn) {
  namn = String(namn || "").trim();
  if (!namn) return null;
  const alla = await db.getAll("kunder");
  const key = normaliseraKund(namn);
  const funnen = alla.find((x) => normaliseraKund(x.namn) === key);
  if (funnen) return funnen;
  const k = nyKund(namn);
  await db.put("kunder", k);
  return k;
}

// Se till att ett uppdrag har en kund. Skapar kunden utifrån namnOverride (t.ex.
// mappnamn vid mappimport) i första hand, annars byggnadsägaren. Rör aldrig en
// redan satt kund (manuellt val vinner).
export async function syncKund(uppdrag, namnOverride) {
  if (!uppdrag) return null;
  if (uppdrag.kundId) {
    const k = await db.get("kunder", uppdrag.kundId);
    if (k) return k;
  }
  const namn = (namnOverride || (uppdrag.byggnad && uppdrag.byggnad.byggnadsagare) || "").trim();
  if (!namn) return null;
  const k = await skapaKund(namn);
  if (k && uppdrag.kundId !== k.id) {
    uppdrag.kundId = k.id;
    await db.put("uppdrag", uppdrag);
  }
  return k;
}

// Engångsmigrering: ge befintliga uppdrag en kund utifrån byggnadsägaren.
// Läser kundlistan en gång och skriver bara för uppdrag som saknar kund.
export async function migreraKunder() {
  const uppdrag = await db.getAll("uppdrag");
  if (!uppdrag.some((u) => !u.kundId && (u.byggnad && u.byggnad.byggnadsagare || "").trim())) return 0;
  const byKey = new Map();
  for (const k of await db.getAll("kunder")) {
    const key = normaliseraKund(k.namn);
    if (key && !byKey.has(key)) byKey.set(key, k);
  }
  let antal = 0;
  for (const u of uppdrag) {
    if (u.kundId) continue;
    const namn = (u.byggnad && u.byggnad.byggnadsagare || "").trim();
    if (!namn) continue;
    const key = normaliseraKund(namn);
    let k = byKey.get(key);
    if (!k) { k = nyKund(namn); byKey.set(key, k); await db.put("kunder", k); }
    u.kundId = k.id;
    await db.put("uppdrag", u);
    antal++;
  }
  return antal;
}
