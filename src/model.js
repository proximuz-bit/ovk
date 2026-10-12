// Datamodell: fabriker och härledda hjälpfunktioner.
import { intervallAr, nastaDatum, deadlineStatus, behorighetRacker, sfpv, todayISO, num } from "./domain.js";

export const DEFAULT_SETTINGS = {
  id: "settings",
  besiktningsman: {
    namn: "",
    telefon: "",
    epost: "",
    behorighet: "",
    certOrgan: "",
    certNr: "",
    certGiltigTom: "",
  },
  foretag: {
    namn: "Ventilation och Mätteknik i Sala AB",
    postadress: "Jakobsbergsgatan 3",
    postnr: "733 34",
    ort: "Sala",
  },
  matinstrument: [
    { namn: "Swema 3000md", nr: "683249" },
    { namn: "SwemaFlow 233", nr: "352969" },
    { namn: "SwemaFlow 4001", nr: "671659" },
  ],
  tolerans: { gron: 10, gul: 20 },
};

export function nyttUppdrag(settings) {
  const bm = settings?.besiktningsman || DEFAULT_SETTINGS.besiktningsman;
  return {
    id: crypto.randomUUID(),
    fastighetId: "",
    referensNr: "",
    uppdragstyp: "Återkommande besiktning",
    besiktningsdatum: todayISO(),
    byggnad: {
      fastighetsbeteckning: "",
      adress: "",
      postnr: "",
      ort: "",
      kategori: "flerbostadshus",
      interntNamn: "",
      interntNr: "",
      verksamhet: "",
      braM2: "",
      antLgh: "",
      antLokaler: "",
      byggnadsagare: "",
      byggnadsagareAdress: "",
      byggnadsagarePostnr: "",
      byggnadsagareOrt: "",
      fakturaAdress: "",
      fakturaPostnr: "",
      fakturaOrt: "",
      forvaltare: "",
      forvaltareTelefon: "",
      forvaltareEpost: "",
    },
    besiktningsman: JSON.parse(JSON.stringify(bm)),
    allmantOmdome: "",
    notering: "",
    bilagor: "",
    samtligaSystemIngar: true,
    system: [],
    intyg: [],
    skapad: new Date().toISOString(),
  };
}

export function nyttSystem(nr) {
  return {
    id: crypto.randomUUID(),
    systemnr: nr || "",
    systemtyp: "FTX",
    resultat: "",
    besiktningsdatum: "",
    ombesiktningsdatum: "",
    forfallitDatum: "",
    beskrivning: "",
    betjanar: "",
    utfall: {},
    fläktar: [],
    energiforslag: [],
    driftstider: "",
    eleffekter: "",
    notering: "",
    matpunkter: [],
    aggregat: [],
    klimat: [],
    anmarkningar: [],
    atgarder: [],
  };
}

export function nyFläkt() {
  return { id: crypto.randomUUID(), systemdel: "", fläkttyp: "F", instAr: "", placering: "", projFlode: "", uppmFlode: "", betjanar: "" };
}
export function nyMatpunkt() {
  return {
    id: crypto.randomUUID(), rumNr: "", beskrivning: "",
    tl: { dontyp: "", proj: "", uppm: "", kFaktor: "", matMetod: "ID2" },
    fl: { dontyp: "", proj: "", uppm: "", kFaktor: "", matMetod: "ET1" },
    pa: "", anteckning: "",
  };
}
export function nyAggregat() {
  return {
    id: crypto.randomUUID(), benamning: "", fabrikat: "", typ: "", placering: "", betjanar: "",
    driftimmarVecka: "", pk: "", ritning: "",
    tilluft: { projFlodeLs: "", uppmFlodeLs: "", pt: "", pkPa: "", dpVarme: "", dpKyla: "", dpFilter: "", dpVvx: "", temp: "" },
    franluft: { projFlodeLs: "", uppmFlodeLs: "", pt: "", pkPa: "", dpVarme: "", dpKyla: "", dpFilter: "", dpVvx: "", temp: "" },
    motor: { fabrikatTyp: "", varvtal: "", markEffektKw: "", pmattEffektKw: "", markStromA: "", k: "", cosFi: "", frekvens: "", flaktVarvtal: "", flaktskiva: "", motorskiva: "", flakthjul: "", renblasning: "", vvxTyp: "", anmarkning: "" },
    filter: { tilluft: [], franluft: [] },
  };
}
export function nyKlimat() {
  return { id: crypto.randomUUID(), rumNr: "", benamning: "", vistelsezon: "", co2Rum: "", co2Franluft: "", rh: "", fukt: "", radon: "", taBort: "", anm: "" };
}
export function nyAnmarkning() { return { id: crypto.randomUUID(), pos: "", text: "", utfall: "1" }; }
export function nyAtgard() { return { id: crypto.randomUUID(), pos: "", text: "", kostnad: "" }; }
export function nyttFastighet(uppdrag) {
  const b = uppdrag.byggnad;
  return {
    id: crypto.randomUUID(),
    beteckning: b.fastighetsbeteckning,
    adress: b.adress, postnr: b.postnr, ort: b.ort,
    kategori: b.kategori,
    agare: b.byggnadsagare,
  };
}

/* ---------- härlett ---------- */
// Intervall för ett system utifrån byggnadskategori + systemtyp.
export function systemIntervall(uppdrag, system) {
  return intervallAr(uppdrag.byggnad.kategori, system.systemtyp);
}
// Nästa besiktningsdatum för ett system.
export function systemNastaDatum(uppdrag, system) {
  const år = systemIntervall(uppdrag, system);
  const bes = system.besiktningsdatum || uppdrag.besiktningsdatum;
  return nastaDatum(bes, år, system.forfallitDatum);
}
// Sammanfattning av ett helt uppdrag.
export function uppdragSummary(uppdrag) {
  const system = uppdrag.system || [];
  const datum = [];
  let resultat = "G";
  let antalEG = 0, antalG = 0;
  for (const s of system) {
    const nd = systemNastaDatum(uppdrag, s);
    if (nd) datum.push(nd);
    if (s.resultat === "EG") { antalEG++; resultat = "EG"; }
    else if (s.resultat === "G") antalG++;
  }
  datum.sort();
  const nasta = datum[0] || "";
  return {
    nastaDatum: nasta,
    deadline: deadlineStatus(nasta),
    resultat,
    antalSystem: system.length,
    antalG, antalEG,
  };
}
// Summering av luftflöde för ett system.
export function systemFlode(uppdrag, system) {
  let tlProj = 0, tlUppm = 0, flProj = 0, flUppm = 0;
  for (const m of system.matpunkter || []) {
    tlProj += num(m.tl.proj) || 0; tlUppm += num(m.tl.uppm) || 0;
    flProj += num(m.fl.proj) || 0; flUppm += num(m.fl.uppm) || 0;
  }
  return { tlProj, tlUppm, flProj, flUppm };
}
export function aggregatSfpv(agg) { return sfpv(agg); }
export { behorighetRacker };
