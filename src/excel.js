// Import av tidigare ifyllda OVK-protokoll (Excel .xlsm/.xlsx/.xls) till appens uppdrag.
// Ren logik: XLSX-biblioteket skickas in (window.XLSX i webbläsaren, require i node).
import { nyttUppdrag, nyttSystem, nyFläkt, nyMatpunkt, nyAggregat, nyAnmarkning } from "./model.js";
import { FLÄKTTYPER, MÄTMETODER } from "./constants.js";

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
// Raden där rubriken själv står (för tabeller som börjar på raden under).
function rubrikRad(karta, rubrik) {
  const adresser = karta.get(normalisera(rubrik));
  if (!adresser || !adresser.length) return null;
  const p = dela(adresser[0]);
  return p ? p.rad : null;
}
// Första icke-tomma värdet i en kolumn inom N rader under rubriken (vissa mallar
// har en tom rad mellan rubrik och värde).
function vardeNedan(ws, karta, rubrik, kolumn, maxNed = 2) {
  const rad = rubrikRad(karta, rubrik);
  if (rad === null) return null;
  for (let i = 1; i <= maxNed; i++) {
    const v = cellAt(ws, kolumn + (rad + i));
    if (v !== null && txt(v) !== "") return v;
  }
  return null;
}
function normFläkttyp(v) {
  const s = txt(v).toUpperCase();
  return FLÄKTTYPER.includes(s) ? s : txt(v);
}
function normMatMetod(v) {
  const s = txt(v).toUpperCase();
  return MÄTMETODER.includes(s) ? s : "";
}
function hittaArkMönster(wb, re) {
  const namn = wb.SheetNames.find((s) => re.test(s));
  return namn ? wb.Sheets[namn] : null;
}
// Kopplar en detaljflik (L1/Luftflödesprotokoll/E1) till rätt system i filen.
function valjSystem(system, nyckel) {
  const n = txt(nyckel).toLowerCase();
  if (n) {
    const exakt = system.find((s) => txt(s.systemnr).toLowerCase() === n);
    if (exakt) return exakt;
    const del = system.find((s) => {
      const nr = txt(s.systemnr).toLowerCase();
      return nr && (n.includes(nr) || nr.includes(n));
    });
    if (del) return del;
  }
  return system[0] || null;
}
// Systemets primära nyckel i L1/Luftflödesprotokoll: systemnummer, annars aggregatbenämning.
function l1Nyckel(ws) {
  const karta = rubrikKarta(ws);
  return txt(vardeNedan(ws, karta, "Systemnummer", "R", 2))
    || txt(vardeNedan(ws, karta, "Aggregatbenämning", "E", 2))
    || txt(cellAt(ws, "G6")) || "";
}

/* ---------- fläktar (B-flik) ---------- */
// Tabell under rubriken "Systemdel": C=pos, D=Systemdel, G=Fläkttyp, H=Inst.år,
// I=Placering, J=Proj.flöde l/s, K=Uppm flöde l/s, L=Betjänar.
function lasFlaktar(ws) {
  const karta = rubrikKarta(ws);
  const hr = rubrikRad(karta, "Systemdel");
  if (hr === null) return [];
  const ut = [];
  for (let r = hr + 1; r <= hr + 12; r++) {
    const f = {
      systemdel: txt(cellAt(ws, "D" + r)),
      fläkttyp: normFläkttyp(cellAt(ws, "G" + r)),
      instAr: txt(cellAt(ws, "H" + r)),
      placering: txt(cellAt(ws, "I" + r)),
      projFlode: txt(cellAt(ws, "J" + r)),
      uppmFlode: txt(cellAt(ws, "K" + r)),
      betjanar: txt(cellAt(ws, "L" + r)),
    };
    const tom = !f.systemdel && !f.fläkttyp && !f.projFlode && !f.uppmFlode && !f.betjanar && !f.placering && !f.instAr;
    if (tom) { if (ut.length) break; continue; }
    const ny = nyFläkt();
    Object.assign(ny, f);
    ut.push(ny);
  }
  return ut;
}

/* ---------- checklista / anmärkningar (B-flik) ---------- */
// Raderna under rubriken "Anmärkningar": D=itemnr (1.1..4.6), H=Pos (kan avvika,
// används som checklistkod), I=anmärkningstext, M=utfall (0/1/2).
function lasChecklista(ws) {
  const karta = rubrikKarta(ws);
  const hr = rubrikRad(karta, "Anmärkningar");
  const ut = { anmarkningar: [], utfall: {} };
  if (hr === null) return ut;
  for (let r = hr + 1; r <= hr + 40; r++) {
    const d = txt(cellAt(ws, "D" + r));
    if (!/^\d+(\.\d+)?$/.test(d)) continue;
    const h = txt(cellAt(ws, "H" + r));
    const i = txt(cellAt(ws, "I" + r));
    const m = txt(cellAt(ws, "M" + r));
    const kod = h || d;
    if (h || m || i) ut.utfall[kod] = { v: ["0", "1", "2"].includes(m) ? m : "", text: i };
    if (i) {
      const a = nyAnmarkning();
      a.pos = kod;
      a.text = i;
      a.utfall = ["0", "1", "2"].includes(m) ? m : "1";
      ut.anmarkningar.push(a);
    }
  }
  return ut;
}

/* ---------- luftflöden ---------- */
// L1-tabellen (både ny och gammal mall): D=pos, E=Rum.nr, G=Benämning,
// I/K/M=Tilluft proj/uppm/%, O=tilluft metod, P/R/T=Frånluft proj/uppm/%,
// V=frånluft metod.
function matpunkterL1(ws) {
  const karta = rubrikKarta(ws);
  const hr = rubrikRad(karta, "Rum. nr.");
  if (hr === null) return [];
  const ut = [];
  for (let r = hr + 1; r <= hr + 24; r++) {
    const rum = txt(cellAt(ws, "E" + r));
    const bes = txt(cellAt(ws, "G" + r));
    const tlP = txt(cellAt(ws, "I" + r)), tlU = txt(cellAt(ws, "K" + r));
    const flP = txt(cellAt(ws, "P" + r)), flU = txt(cellAt(ws, "R" + r));
    if (!rum && !bes && !tlP && !tlU && !flP && !flU) continue;
    const m = nyMatpunkt();
    m.rumNr = rum; m.beskrivning = bes;
    m.tl = { dontyp: "", proj: tlP, uppm: tlU, kFaktor: "", matMetod: normMatMetod(cellAt(ws, "O" + r)) };
    m.fl = { dontyp: "", proj: flP, uppm: flU, kFaktor: "", matMetod: normMatMetod(cellAt(ws, "V" + r)) };
    ut.push(m);
  }
  return ut;
}
// "Luftflödesprotokoll" (ny mall, detaljerat): B=Rumsnr, D=Beskrivning,
// F/G/H/I/J/K/L=Tilluft don/proj/uppm/kvot/Pa/k-faktor/metod,
// M..T=Frånluft motsvarande, U=Anteckning.
function matpunkterLFP(ws) {
  const karta = rubrikKarta(ws);
  const hr = rubrikRad(karta, "K-Faktor");
  if (hr === null) return [];
  const ut = [];
  for (let r = hr + 1; r <= hr + 80; r++) {
    const rum = txt(cellAt(ws, "B" + r));
    const bes = txt(cellAt(ws, "D" + r));
    const tlD = txt(cellAt(ws, "F" + r)), tlP = txt(cellAt(ws, "G" + r)), tlU = txt(cellAt(ws, "H" + r));
    const flD = txt(cellAt(ws, "M" + r)), flP = txt(cellAt(ws, "N" + r)), flU = txt(cellAt(ws, "O" + r));
    if (!rum && !bes && !tlD && !tlP && !tlU && !flD && !flP && !flU) continue;
    const m = nyMatpunkt();
    m.rumNr = rum; m.beskrivning = bes;
    m.tl = { dontyp: tlD, proj: tlP, uppm: tlU, kFaktor: txt(cellAt(ws, "K" + r)), matMetod: normMatMetod(cellAt(ws, "L" + r)) };
    m.fl = { dontyp: flD, proj: flP, uppm: flU, kFaktor: txt(cellAt(ws, "R" + r)), matMetod: normMatMetod(cellAt(ws, "T" + r)) };
    m.anteckning = txt(cellAt(ws, "U" + r));
    ut.push(m);
  }
  return ut;
}
// Driftstider och märkeffekter (fritext) ur L1-rubrikhuvudet.
function lasDriftEffekt(ws) {
  const karta = rubrikKarta(ws);
  return {
    driftstider: txt(vardeNedan(ws, karta, "Driftstider timmar vecka", "E", 2)),
    eleffekter: txt(vardeNedan(ws, karta, "Märkeffekter", "O", 2)),
  };
}

/* ---------- aggregat (E1) ---------- */
// E1 har ett block per aggregat. Rubriken "Agg.benämning" ankrar blocket.
// Kolumn D = etikett (fabrikat, typ, drifttimmar, flöden, tryckfall, temp) med
// värdet i F (projekterat/delfart) och I (uppmätt/helfart). Kolumn O = motordata
// med värde i Q (helfart) / R (delfart).
function aggregatE1(ws) {
  const karta = rubrikKarta(ws);
  const starts = [];
  for (const addr of Object.keys(ws)) {
    if (addr[0] === "!") continue;
    const c = ws[addr];
    if (!c || c.v === null || c.v === undefined) continue;
    if (normalisera(c.v) === "agg.benämning") {
      const p = dela(addr);
      if (p) starts.push(p.rad);
    }
  }
  starts.sort((a, b) => a - b);
  const ut = [];
  starts.forEach((br, i) => {
    const slut = i + 1 < starts.length ? starts[i + 1] - 1 : br + 19;
    const a = nyAggregat();
    const sida = i === 0 ? "tilluft" : "franluft";
    a.benamning = txt(cellAt(ws, "F" + br));
    for (let r = br; r <= slut; r++) {
      const d = normalisera(txt(cellAt(ws, "D" + r)));
      const o = normalisera(txt(cellAt(ws, "O" + r)));
      if (d) {
        if (d === "fabrikat") a.fabrikat = txt(cellAt(ws, "F" + r));
        else if (d === "typ") a.typ = txt(cellAt(ws, "F" + r));
        else if (d === "placering") a.placering = txt(cellAt(ws, "F" + r));
        else if (d === "betjänar") a.betjanar = txt(cellAt(ws, "F" + r));
        else if (d.startsWith("drifttimmar")) a.driftimmarVecka = txt(cellAt(ws, "I" + r)) || txt(cellAt(ws, "F" + r));
        else if (d.startsWith("q tot")) { a[sida].projFlodeLs = txt(cellAt(ws, "F" + r)); a[sida].uppmFlodeLs = txt(cellAt(ws, "I" + r)); }
        else if (d.startsWith("pt ")) a[sida].pt = txt(cellAt(ws, "I" + r));
        else if (d.startsWith("pk ")) a[sida].pkPa = txt(cellAt(ws, "I" + r));
        else if (d.startsWith("dp värmebatteri")) a[sida].dpVarme = txt(cellAt(ws, "I" + r));
        else if (d.startsWith("dp kylbatteri")) a[sida].dpKyla = txt(cellAt(ws, "I" + r));
        else if (d.startsWith("dp efter filter")) a[sida].dpFilter = txt(cellAt(ws, "I" + r));
        else if (d.startsWith("dp vvx")) a[sida].dpVvx = txt(cellAt(ws, "I" + r));
        else if (d.includes("temp behandl") || d.includes("frånlufttemp")) a[sida].temp = txt(cellAt(ws, "I" + r));
      }
      if (o) {
        if (o === "fabrikat, typ") a.motor.fabrikatTyp = txt(cellAt(ws, "Q" + r)) || txt(cellAt(ws, "R" + r));
        else if (o.startsWith("varvtal")) a.motor.varvtal = txt(cellAt(ws, "Q" + r));
        else if (o.startsWith("p märkeffekt")) a.motor.markEffektKw = txt(cellAt(ws, "Q" + r)) || txt(cellAt(ws, "R" + r));
        else if (o.startsWith("pmätt effekt")) a.motor.pmattEffektKw = txt(cellAt(ws, "Q" + r));
        else if (o.startsWith("märkström")) a.motor.markStromA = txt(cellAt(ws, "Q" + r));
        else if (o === "k=") a.motor.k = txt(cellAt(ws, "Q" + r));
        else if (o.startsWith("cos")) a.motor.cosFi = txt(cellAt(ws, "Q" + r));
        else if (o.startsWith("frekvens")) a.motor.frekvens = txt(cellAt(ws, "Q" + r));
        else if (o.includes("fläktvarvtal")) a.motor.flaktVarvtal = txt(cellAt(ws, "Q" + r));
        else if (o.startsWith("fläktskiva")) a.motor.flaktskiva = txt(cellAt(ws, "Q" + r));
        else if (o.startsWith("motorskiva")) a.motor.motorskiva = txt(cellAt(ws, "Q" + r));
        else if (o.startsWith("fläkthjul")) a.motor.flakthjul = txt(cellAt(ws, "Q" + r));
        else if (o.startsWith("renblåsning")) a.motor.renblasning = txt(cellAt(ws, "Q" + r));
        else if (o.startsWith("vvx typ")) a.motor.vvxTyp = txt(cellAt(ws, "Q" + r)) || txt(cellAt(ws, "R" + r));
        else if (o.startsWith("anmärkning")) a.motor.anmarkning = txt(cellAt(ws, "Q" + r)) || txt(cellAt(ws, "R" + r));
      }
    }
    ut.push(a);
  });
  return ut;
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
  s.fläktar = lasFlaktar(ws);
  const cl = lasChecklista(ws);
  s.anmarkningar = cl.anmarkningar;
  s.utfall = cl.utfall;
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

/* ---------- detaljdata -> system ---------- */
function aggregatHarData(a) {
  return !!(a.benamning || a.fabrikat || a.typ || a.placering || a.betjanar || a.driftimmarVecka
    || a.motor.markEffektKw || a.motor.pmattEffektKw || a.tilluft.projFlodeLs || a.tilluft.uppmFlodeLs
    || a.franluft.projFlodeLs || a.franluft.uppmFlodeLs);
}
function lasDetaljdata(wb, system) {
  const l1 = hittaArkMönster(wb, /^l1$/i);
  const lfp = hittaArkMönster(wb, /luftflödesprotokoll/i);
  const e1 = hittaArkMönster(wb, /^e1$/i);

  // Luftflöden: föredra detaljerade "Luftflödesprotokoll", annars L1-tabellen.
  const mat = (lfp && matpunkterLFP(lfp)) || [];
  const matMalkalla = mat.length ? "lfp" : (l1 && matpunkterL1(l1).length ? "l1" : "");
  const matPunkter = matMalkalla === "lfp" ? mat : matMalkalla === "l1" ? matpunkterL1(l1) : [];
  const matWs = matMalkalla === "lfp" ? lfp : matMalkalla === "l1" ? l1 : null;

  const de = l1 ? lasDriftEffekt(l1) : { driftstider: "", eleffekter: "" };
  const agg = e1 ? aggregatE1(e1).filter(aggregatHarData) : [];
  const harData = matPunkter.length || de.driftstider || de.eleffekter || agg.length;

  // Vissa filer (t.ex. rena luftflödesprotokoll) saknar B-flikar men har mätdata.
  if (!system.length && harData) {
    const kalla = matWs || l1 || e1;
    system.push(nyttSystem(txt(cellAt(kalla, "G6")) || l1Nyckel(kalla)));
  }
  if (!system.length) return;

  if (matPunkter.length) {
    const s = valjSystem(system, l1Nyckel(matWs));
    if (s) s.matpunkter = matPunkter;
  }
  if (de.driftstider || de.eleffekter) {
    const s = valjSystem(system, l1Nyckel(l1));
    if (s) {
      if (de.driftstider) s.driftstider = de.driftstider;
      if (de.eleffekter) s.eleffekter = de.eleffekter;
    }
  }
  for (const a of agg) {
    const s = valjSystem(system, a.benamning);
    if (s) s.aggregat.push(a);
  }
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

  // Detaljdata från L1 (luftflöden + driftstider/märkeffekt), "Luftflödesprotokoll"
  // (detaljerade mätpunkter) och E1 (aggregatprotokoll). Kopplas till ett system.
  lasDetaljdata(wb, system);

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
