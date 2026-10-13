// Import av tidigare ifyllda OVK-protokoll (Excel .xlsm/.xlsx/.xls) till appens uppdrag.
// Ren logik: XLSX-biblioteket skickas in (window.XLSX i webbläsaren, require i node).
import { nyttUppdrag, nyttSystem } from "./model.js";

/* ---------- celläsning ---------- */
// Läser ett cellvärde direkt via adress (oberoende av arkets använda område).
export function cellAt(ws, addr) {
  const c = ws && ws[addr];
  if (!c) return null;
  if (c.v !== undefined && c.v !== null) return c.v;
  if (c.w !== undefined && c.w !== null) return c.w;
  return null;
}
function txt(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\s+/g, " ").trim();
}
// Excel-serial (1899-12-30-epok, UTC) eller sträng -> ISO-datum.
export function toISO(v) {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) return isNaN(v) ? "" : v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    if (!isFinite(v) || v <= 0) return "";
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return isNaN(d) ? "" : d.toISOString().slice(0, 10);
  }
  const s = txt(v);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  return isNaN(d) ? "" : d.toISOString().slice(0, 10);
}
function normResultat(v) {
  const s = txt(v).toUpperCase();
  if (!s) return "";
  if (s.startsWith("EJ")) return "Ej besikt.";
  if (s.includes("EG")) return "EG";
  if (s === "G" || s.startsWith("GODK")) return "G";
  return txt(v);
}
const SYSTEMTYPER = ["S", "F", "FX", "FT", "FTX", "T"];
function normSystemtyp(v) {
  const s = txt(v).toUpperCase().replace(/[^A-Z]/g, "");
  if (!s) return "";
  return SYSTEMTYPER.includes(s) ? s : "";
}
function intervallFranBeskat(v) {
  const s = txt(v);
  if (s === "1") return 3;
  if (s === "2") return 6;
  return "";
}

/* ---------- rubrikstyrd celluppslagning ---------- */
// De två protokollmallarna ("ny" .xlsm och "gammal" .xls/MSV) har identiska
// rubriktexter men värdena ligger på olika rader (ny: rubrikrad+1 på rad 10/48,
// gammal: rad 12/53). Därför letar vi upp rubriken och läser kolumnerna relativt
// rubrikens rad i stället för att hårdkoda celladresser.
function normalisera(s) {
  return String(s).replace(/\s+/g, " ").trim().replace(/[:*]+$/, "").trim().toLowerCase();
}
// normaliserad rubriktext -> [adresser] (samma rubrik kan förekomma flera gånger)
function rubrikKarta(ws) {
  const karta = new Map();
  if (!ws) return karta;
  for (const addr of Object.keys(ws)) {
    if (addr[0] === "!") continue;
    const c = ws[addr];
    const v = c && c.v;
    if (v === undefined || v === null) continue;
    const s = normalisera(v);
    if (!s) continue;
    let arr = karta.get(s);
    if (!arr) karta.set(s, (arr = []));
    arr.push(addr);
  }
  return karta;
}
function dela(addr) {
  const m = /^([A-Z]+)(\d+)$/.exec(addr);
  return m ? { col: m[1], rad: parseInt(m[2], 10) } : null;
}
// Raden direkt under första träffen på en (unik) rubrik = där värdena finns.
function rubrikVarderRad(karta, rubrik) {
  const adresser = karta.get(normalisera(rubrik));
  if (!adresser || !adresser.length) return null;
  const p = dela(adresser[0]);
  return p ? p.rad + 1 : null;
}
function rubrikVarde(ws, karta, rubrik, kolumn) {
  const rad = rubrikVarderRad(karta, rubrik);
  return rad === null ? null : cellAt(ws, kolumn + rad);
}

/* ---------- byggnad / besiktningsman ---------- */
// [ankarrubrik, { kolumn: fält }] – läses en rad under ankarrubriken.
const BYGGNAD_BLOCK = [
  ["Fastighetsbeteckning", { D: "fastighetsbeteckning", H: "adress", J: "postnr", K: "ort" }],
  ["Byggnadsägaren", { D: "byggnadsagare", H: "byggnadsagareAdress", J: "byggnadsagarePostnr", K: "byggnadsagareOrt" }],
  ["Faktureringsadress", { D: "fakturaAdress", J: "fakturaPostnr", K: "fakturaOrt" }],
  ["Fastighetsansvarig/Förvaltare", { D: "forvaltare", I: "forvaltareTelefon", J: "forvaltareEpost" }],
  ["Internt byggnadsnamn", { D: "interntNamn", F: "interntNr", H: "verksamhet", J: "braM2", K: "antLgh", M: "antLokaler" }],
];
const BM_BLOCK = [
  ["Besiktningsman", { D: "namn", H: "telefon", J: "epost" }],
  ["Certiferingsorgan", { D: "certOrgan", F: "certNr", J: "behorighet" }],
];

export function mapA_Blankett(ws) {
  const karta = rubrikKarta(ws);
  const out = { referensNr: txt(cellAt(ws, "I5")), byggnad: {}, besiktningsman: {} };
  for (const [rubrik, falt] of BYGGNAD_BLOCK) {
    for (const [kol, f] of Object.entries(falt)) {
      const v = txt(rubrikVarde(ws, karta, rubrik, kol));
      if (v) out.byggnad[f] = v;
    }
  }
  for (const [rubrik, falt] of BM_BLOCK) {
    for (const [kol, f] of Object.entries(falt)) {
      const v = txt(rubrikVarde(ws, karta, rubrik, kol));
      if (v) out.besiktningsman[f] = v;
    }
  }
  const giltig = toISO(rubrikVarde(ws, karta, "Certiferingsorgan", "H"));
  if (giltig) out.besiktningsman.certGiltigTom = giltig;
  return out;
}

/* ---------- system ---------- */
// Namn på systemflikar som refereras i A_Blankett kolumn J (Bilaga/B-sida),
// från raden under "Systemnr"-rubriken och så långt systemnumret (kolumn D) varar.
export function systemflikarFranA(ws) {
  const karta = rubrikKarta(ws);
  const start = rubrikVarderRad(karta, "Systemnr");
  const namn = [];
  const fran = start === null ? 23 : start;
  for (let r = fran; r <= fran + 20; r++) {
    if (start !== null && !txt(cellAt(ws, "D" + r))) break;
    const v = txt(cellAt(ws, "J" + r));
    if (v && !/^-+$/.test(v)) namn.push(v);
  }
  return namn;
}
function hittaArk(wb, namn) {
  const key = String(namn).toLowerCase();
  const found = wb.SheetNames.find((s) => s.toLowerCase() === key);
  return found ? wb.Sheets[found] : null;
}
// Ett system från dess egen "b"-flik. Rad 9: K=systemtyp, L=bes.kat, M=resultat.
// Rad 6: K=systemnr. Rad 56: L=besiktningsdatum, K=ombesiktningsdatum.
function systemFranB(wb, arkNamn) {
  const ws = hittaArk(wb, arkNamn);
  if (!ws) return null;
  const s = nyttSystem(txt(cellAt(ws, "K6")) || arkNamn);
  s.systemtyp = normSystemtyp(cellAt(ws, "K9")) || "";
  s.resultat = normResultat(cellAt(ws, "M9"));
  s.besiktningsdatum = toISO(cellAt(ws, "L56"));
  s.ombesiktningsdatum = toISO(cellAt(ws, "K56"));
  s.intervallArFast = intervallFranBeskat(cellAt(ws, "L9"));
  s.kalla = { ark: arkNamn };
  return s;
}
// Ett system från sammanställningstabellen i A_Blankett (fallback).
function systemFranSammanstallning(ws, rad) {
  const nr = txt(cellAt(ws, "D" + rad));
  if (!nr) return null;
  // Rubrikrader ("Ingår samtliga…", "A3 …") saknar alla systemfält – hoppa dem.
  const harFalt = ["E", "F", "G", "J"].some((k) => txt(cellAt(ws, k + rad)));
  if (!harFalt) return null;
  const s = nyttSystem(nr);
  s.resultat = normResultat(cellAt(ws, "G" + rad));
  s.besiktningsdatum = toISO(cellAt(ws, "F" + rad));
  s.ombesiktningsdatum = toISO(cellAt(ws, "H" + rad));
  s.importeratNastaDatum = toISO(cellAt(ws, "I" + rad));
  s.notering = txt(cellAt(ws, "K" + rad));
  s.intervallArFast = intervallFranBeskat(cellAt(ws, "E" + rad));
  s.kalla = { ark: txt(cellAt(ws, "J" + rad)) };
  return s;
}

/* ---------- hela arbetsboken -> uppdrag ---------- */
export function tolkaArbetsbok(wb, opts = {}) {
  const blankettNamn = wb.SheetNames.find((s) => s.toLowerCase() === "a_blankett");
  const ws = blankettNamn ? wb.Sheets[blankettNamn] : null;
  if (!ws) throw new Error("Hittar ingen A_Blankett-flik – är det ett OVK-protokoll?");

  const uppdrag = nyttUppdrag(null);
  const a = mapA_Blankett(ws);
  uppdrag.referensNr = a.referensNr;
  Object.assign(uppdrag.byggnad, a.byggnad);
  Object.assign(uppdrag.besiktningsman, a.besiktningsman);

  // System: i första hand egna b-flikar, annars sammanställningstabellen.
  let system = [];
  const refs = systemflikarFranA(ws);
  const franArk = wb.SheetNames.filter((s) => /^b\d+$/i.test(s));
  const kandidater = [...new Set([...refs, ...franArk])]
    .filter((n) => !/a_blankett/i.test(n) && !/^b_mall$/i.test(n));
  for (const n of kandidater) {
    const s = systemFranB(wb, n);
    if (s) system.push(s);
  }
  if (!system.length) {
    const karta = rubrikKarta(ws);
    let start = rubrikVarderRad(karta, "Systemnr");
    if (start === null) start = 23;
    for (let r = start; r <= start + 20; r++) {
      const s = systemFranSammanstallning(ws, r);
      if (s) system.push(s);
      else if (!txt(cellAt(ws, "D" + r))) break;
    }
  }
  uppdrag.system = system;

  // Övergripande besiktningsdatum: tidigaste systemdatum.
  const datum = system.map((s) => s.besiktningsdatum).filter(Boolean).sort();
  if (datum[0]) uppdrag.besiktningsdatum = datum[0];

  uppdrag.source = "import";
  uppdrag.importFil = opts.filnamn || "";
  uppdrag.importStatus = "granska"; // kategori m.m. kan behöva ses över
  uppdrag.notering = system.some((s) => !s.intervallArFast)
    ? "Importerad – kontrollera byggnadskategori och systemtyp."
    : "";
  return [uppdrag];
}

export function tolkaFil(XLSX, arrayBuffer, opts = {}) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  return tolkaArbetsbok(wb, opts);
}
