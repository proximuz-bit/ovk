// Ren domänlogik för OVK. Inga beroenden – testbar med node.

/* ---------- datum ---------- */
export function parseISO(s) {
  if (!s) return null;
  const d = new Date(s + "T00:00:00Z");
  return isNaN(d) ? null : d;
}
export function toISO(d) {
  if (!d) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function todayISO() { return toISO(new Date()); }
export function addMonthsISO(iso, months) {
  const d = parseISO(iso);
  if (!d) return "";
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const daysInMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, daysInMonth));
  return toISO(target);
}
export function addYearsISO(iso, years) { return addMonthsISO(iso, years * 12); }
export function formatDate(iso) {
  const d = parseISO(iso);
  if (!d) return "";
  return `${toISO(d)}`;
}
export function daysBetween(aISO, bISO) {
  const a = parseISO(aISO), b = parseISO(bISO);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}
export function arNu() { return new Date().getUTCFullYear(); }

/* ---------- intervall ---------- */
// Returnerar antal år för återkommande besiktning, eller 0 = inget krav.
// Grund: BFS 2011:16 med ändringar t.o.m. BFS 2025:6 (OVK 5), 3 §.
export function intervallAr(kategori, systemtyp) {
  const sys = (systemtyp || "").toUpperCase();
  if (kategori === "skola_vard") return 3;
  if (["flerbostadshus", "kontor", "industri_kontor", "ovrig"].includes(kategori)) {
    if (sys === "FT" || sys === "FTX") return 3;
    if (sys === "S" || sys === "F" || sys === "FX") return 6;
  }
  if (kategori === "smahus") {
    // Endast första besiktning vid FX/FT/FTX; inget krav vid S/F.
    return 0;
  }
  return 0;
}

// Nästa besiktningsdatum. Regel (BFS 2011:16 3 §):
//  - kontroll i tid/tidigare  -> nästa räknas från faktiskt kontrolldatum
//  - kontroll försenad        -> nästa räknas från när den senaste SKULLE ha utförts
export function nastaDatum(besiktningsdatumISO, intervallÅr, förfallitDatumISO) {
  if (!besiktningsdatumISO || !intervallÅr) return "";
  const bes = besiktningsdatumISO;
  const förfall = förfallitDatumISO || bes;
  const försenad = bes > förfall;
  const bas = försenad ? förfall : bes;
  return addYearsISO(bas, intervallÅr);
}

// Klassificera nästa-datum mot idag.
export function deadlineStatus(nastaISO) {
  if (!nastaISO) return { key: "none", label: "Inget krav", cls: "muted", dagar: null };
  const dagar = daysBetween(todayISO(), nastaISO);
  if (dagar === null) return { key: "none", label: "—", cls: "muted", dagar: null };
  if (dagar < 0) return { key: "over", label: `Försenad ${Math.abs(dagar)} d`, cls: "bad", dagar };
  if (dagar <= 90) return { key: "snart", label: `Inom ${dagar} d`, cls: "warn", dagar };
  return { key: "ok", label: `Om ${dagar} d`, cls: "ok", dagar };
}

/* ---------- behörighet ---------- */
// Nivå N: S/F/FX i alla byggnader samt FT/FTX endast i en-/tvåbostadshus.
// Nivå K: alla byggnader oavsett system. (BFS 2011:16 6 §, BFS 2025:6)
export function behorighetRacker(niva, systemtyp, kategori) {
  if (niva === "K") return true;
  if (niva !== "N") return false;
  const sys = (systemtyp || "").toUpperCase();
  if (["S", "F", "FX"].includes(sys)) return true;
  if (["FT", "FTX"].includes(sys)) return kategori === "smahus";
  return true;
}

/* ---------- luftflöde ---------- */
export function kvot(proj, uppm) {
  const p = num(proj), u = num(uppm);
  if (!p || u === null) return null;
  return u / p;
}
export function avvikelsePct(proj, uppm) {
  const p = num(proj), u = num(uppm);
  if (!p || u === null) return null;
  return ((u - p) / p) * 100;
}
// Toleransklass för färgning. Standard: ±10 % grönt, ±20 % gult, däröver rött.
export function avvikelseKlass(pct, tol1 = 10, tol2 = 20) {
  if (pct === null || pct === undefined || isNaN(pct)) return "";
  const a = Math.abs(pct);
  if (a <= tol1) return "ok";
  if (a <= tol2) return "mid";
  return "high";
}

/* ---------- SFPv ---------- */
// SFPv [kW/(m³/s)] = total uppmätt eleffekt / största luftflöde.
export function sfpv(agg) {
  if (!agg) return null;
  const t = agg.tilluft || {}, f = agg.franluft || {};
  const pt = num(t.pmattEffektKw), pf = num(f.pmattEffektKw);
  const qt = num(t.uppmFlodeLs), qf = num(f.uppmFlodeLs);
  if (pt === null && pf === null) return null;
  const effekt = (pt || 0) + (pf || 0);
  const flode = Math.max(qt || 0, qf || 0) / 1000; // l/s -> m³/s
  if (!flode) return null;
  return effekt / flode;
}

/* ---------- validering ---------- */
export function valideraUppdrag(uppdrag) {
  const fel = [];
  if (!uppdrag) return ["Inget uppdrag."];
  const b = uppdrag.byggnad || {};
  if (!b.fastighetsbeteckning && !uppdrag.fastighetBeteckning) fel.push("Fastighetsbeteckning saknas.");
  if (!b.adress) fel.push("Byggnadens adress saknas.");
  if (!b.kategori) fel.push("Byggnadskategori (styr intervall) saknas.");
  if (!uppdrag.besiktningsdatum) fel.push("Besiktningsdatum saknas.");
  const bm = uppdrag.besiktningsman || {};
  if (!bm.namn) fel.push("Besiktningsman saknas.");
  if (!bm.behorighet) fel.push("Behörighetsnivå (N/K) saknas.");
  if (!bm.certNr) fel.push("Certifikatnummer saknas.");
  const system = uppdrag.system || [];
  if (!system.length) fel.push("Minst ett ventilationssystem måste läggas till.");
  for (const s of system) {
    if (!s.systemnr) fel.push("System utan systemnummer.");
    if (!s.systemtyp) fel.push(`System ${s.systemnr || "?"}: systemtyp saknas.`);
    else if (!behorighetRacker(bm.behorighet, s.systemtyp, b.kategori)) {
      fel.push(`System ${s.systemnr}: behörighet ${bm.behorighet} täcker inte ${s.systemtyp} i denna byggnadskategori.`);
    }
    if (!s.resultat) fel.push(`System ${s.systemnr || "?"}: resultat saknas.`);
    if (s.resultat === "EG" && !s.ombesiktningsdatum) fel.push(`System ${s.systemnr}: EG kräver ombesiktningsdatum.`);
  }
  return fel;
}

/* ---------- hjälp ---------- */
export function num(x) {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(String(x).replace(",", "."));
  return isNaN(n) ? null : n;
}
export function fmt(x, dec = 2) {
  const n = num(x);
  if (n === null) return "";
  return n.toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: dec });
}
export function sum(arr) {
  return arr.reduce((a, b) => a + (num(b) || 0), 0);
}
