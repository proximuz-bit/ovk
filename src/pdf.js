// Modern PDF-export med pdf-lib (window.PDFLib).
import {
  systemIntervall, systemNastaDatum, uppdragSummary, systemFlode, aggregatSfpv, behorighetRacker,
} from "./model.js";
import { POSITIONER, ENERGIÅTGÄRDER } from "./constants.js";
import { fmt } from "./domain.js";

const C = {
  ink: [0.06, 0.09, 0.13], muted: [0.36, 0.42, 0.48], brand: [0.06, 0.46, 0.43],
  line: [0.85, 0.88, 0.91], panel: [0.97, 0.98, 0.99], ok: [0.08, 0.5, 0.24],
  bad: [0.73, 0.11, 0.11], warn: [0.71, 0.33, 0.04], white: [1, 1, 1],
};
const A4 = [595.28, 841.89];
const M = 46;

class Doc {
  constructor(PDFLib, settings) {
    this.PDFLib = PDFLib;
    this.settings = settings || {};
    this.pdf = null;
    this.page = null;
    this.y = 0;
    this.pageNo = 0;
    this.navn = (settings?.foretag?.namn) || "OVK-protokoll";
  }
  async init() {
    const { PDFDocument, StandardFonts } = this.PDFLib;
    this.pdf = await PDFDocument.create();
    this.font = await this.pdf.embedFont(StandardFonts.Helvetica);
    this.bold = await this.pdf.embedFont(StandardFonts.HelveticaBold);
    this.addPage();
  }
  addPage() {
    this.page = this.pdf.addPage(A4);
    this.y = A4[1] - M;
    this.pageNo++;
    this.header();
    this.footer();
  }
  ensure(h) { if (this.y - h < M + 24) this.addPage(); }
  header() {
    const { page, font } = this;
    const brand = [C.brand[0], C.brand[1], C.brand[2]];
    page.drawRectangle({ x: 0, y: A4[1] - 58, width: A4[0], height: 58, color: rgb(brand) });
    page.drawText(this.navn, { x: M, y: A4[1] - 34, size: 13, font: this.bold, color: rgb(C.white) });
    const t = "OVK-protokoll";
    const w = this.bold.widthOfTextAtSize(t, 13);
    page.drawText(t, { x: A4[0] - M - w, y: A4[1] - 34, size: 13, font: this.bold, color: rgb(C.white) });
    this.y = A4[1] - 58 - 18;
  }
  footer() {
    const { page, font } = this;
    const y = M - 16;
    page.drawLine({ start: { x: M, y: y + 12 }, end: { x: A4[0] - M, y: y + 12 }, thickness: 0.5, color: rgb(C.line) });
    page.drawText(this.settings?.foretag?.namn || "", { x: M, y, size: 8, font, color: rgb(C.muted) });
    const p = `Sida ${this.pageNo}`;
    const w = font.widthOfTextAtSize(p, 8);
    page.drawText(p, { x: A4[0] - M - w, y, size: 8, font, color: rgb(C.muted) });
  }
  text(str, { size = 10, font = null, color = C.ink, x = M, dy = 4 } = {}) {
    const f = font || this.font;
    const lines = wrap(String(str ?? ""), f, size, A4[0] - M - x);
    for (const ln of lines) {
      this.ensure(size + 2);
      this.page.drawText(ln, { x, y: this.y - size, size, font: f, color: color ? rgb(color) : undefined });
      this.y -= size + 2;
    }
    this.y -= dy;
  }
  heading(str, size = 13) {
    this.ensure(size + 18);
    this.y -= 8;
    this.text(str, { size, font: this.bold, color: C.brand, dy: 2 });
    this.page.drawLine({ start: { x: M, y: this.y + 2 }, end: { x: A4[0] - M, y: this.y + 2 }, thickness: 1, color: rgb(C.brand) });
    this.y -= 6;
  }
  keyvals(pairs, cols = 2) {
    const colW = (A4[0] - M * 2) / cols;
    let i = 0;
    for (let r = 0; r < Math.ceil(pairs.length / cols); r++) {
      this.ensure(16);
      for (let c = 0; c < cols; c++) {
        const p = pairs[i++];
        if (!p) continue;
        const x = M + c * colW;
        this.page.drawText(String(p[0]) + ":", { x, y: this.y - 11, size: 9, font: this.bold, color: rgb(C.muted) });
        this.page.drawText(cut(String(p[1] ?? ""), this.font, 9, colW - 96), { x: x + 92, y: this.y - 11, size: 9, font: this.font, color: rgb(C.ink) });
      }
      this.y -= 15;
    }
    this.y -= 4;
  }
  box(title, lines) {
    this.ensure(20 + lines.length * 13);
    this.page.drawRectangle({ x: M, y: this.y - 14 - lines.length * 13, width: A4[0] - M * 2, height: 20 + lines.length * 13, color: rgb(C.panel), borderColor: rgb(C.line), borderWidth: 0.7 });
    this.page.drawText(title, { x: M + 10, y: this.y - 12, size: 10, font: this.bold, color: rgb(C.brand) });
    let yy = this.y - 28;
    for (const ln of lines) { this.page.drawText(ln, { x: M + 10, y: yy, size: 9, font: this.font, color: rgb(C.ink) }); yy -= 13; }
    this.y -= 26 + lines.length * 13;
  }
  table(headers, rows, widths, { alignRight = [] } = {}) {
    const total = widths.reduce((a, b) => a + b, 0);
    const scale = (A4[0] - M * 2) / total;
    const ws = widths.map((w) => w * scale);
    const drawHead = () => {
      this.ensure(18);
      this.page.drawRectangle({ x: M, y: this.y - 14, width: A4[0] - M * 2, height: 16, color: rgb(C.panel) });
      let x = M + 4;
      headers.forEach((h, i) => {
        this.page.drawText(cut(h, this.bold, 8, ws[i] - 6), { x, y: this.y - 10, size: 8, font: this.bold, color: rgb(C.muted) });
        x += ws[i];
      });
      this.y -= 16;
    };
    drawHead();
    for (const row of rows) {
      const cellLines = row.map((c, i) => wrapArr(String(c ?? ""), this.font, 8, ws[i] - 6));
      const h = Math.max(...cellLines.map((l) => l.length)) * 10 + 4;
      if (this.y - h < M + 24) { this.addPage(); drawHead(); }
      let x = M + 4;
      cellLines.forEach((lines, i) => {
        lines.forEach((ln, li) => {
          let xx = x;
          if (alignRight.includes(i)) xx = x + ws[i] - 6 - this.font.widthOfTextAtSize(ln, 8);
          this.page.drawText(ln, { x: xx, y: this.y - 10 - li * 10, size: 8, font: this.font, color: rgb(C.ink) });
        });
        x += ws[i];
      });
      this.y -= h;
      this.page.drawLine({ start: { x: M, y: this.y + 2 }, end: { x: A4[0] - M, y: this.y + 2 }, thickness: 0.4, color: rgb(C.line) });
    }
    this.y -= 6;
  }
  save(name) { return this.pdf.save().then((b) => { download(b, name); return b; }); }
}

/* ---------- hjälpare ---------- */
function rgb(a) { return { type: "RGB", red: a[0], green: a[1], blue: a[2] }; }
function wrapArr(str, font, size, maxW) {
  const words = str.split(/\s+/);
  const lines = []; let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(test, size) > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}
function wrap(str, font, size, maxW) { return wrapArr(str, font, size, maxW); }
function cut(str, font, size, maxW) {
  let s = str;
  while (s.length && font.widthOfTextAtSize(s, size) > maxW) s = s.slice(0, -1);
  return s === str ? str : s.slice(0, -1) + "…";
}
function download(bytes, name) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- main ---------- */
export async function genereraPDF(u, { settings } = {}) {
  const PDFLib = window.PDFLib;
  if (!PDFLib) { alert("PDF-biblioteket är inte laddat."); return; }
  const d = new Doc(PDFLib, settings);
  await d.init();
  const sum = uppdragSummary(u);

  d.text(`Fastighet: ${u.byggnad.fastighetsbeteckning || "—"}`, { size: 15, font: d.bold, dy: 2 });
  d.text(`${u.byggnad.adress || ""}${u.byggnad.ort ? ", " + u.byggnad.ort : ""}   ·   Besiktningsdatum ${u.besiktningsdatum || "—"}   ·   Nästa kontroll ${sum.nastaDatum || "—"}`, { size: 9.5, color: C.muted, dy: 2 });
  d.text(`Uppdragstyp: ${u.uppdragstyp || "—"}${u.referensNr ? "   ·   Ref: " + u.referensNr : ""}`, { size: 9.5, color: C.muted });

  d.heading("Byggnad");
  d.keyvals([
    ["Fastighetsbeteckning", u.byggnad.fastighetsbeteckning],
    ["Byggnad", u.byggnad.interntNamn],
    ["Adress", u.byggnad.adress],
    ["Postnr/Ort", [u.byggnad.postnr, u.byggnad.ort].filter(Boolean).join(" ")],
    ["Kategori", kategoriLabel(u.byggnad.kategori)],
    ["Verksamhet", u.byggnad.verksamhet],
    ["BTA m²", u.byggnad.braM2],
    ["Antal lägenheter", u.byggnad.antLgh],
    ["Ägare", u.byggnad.byggnadsagare],
    ["Förvaltare", u.byggnad.forvaltare],
    ["Förvaltare tel", u.byggnad.forvaltareTelefon],
    ["Förvaltare e-post", u.byggnad.forvaltareEpost],
  ]);

  d.heading("Besiktningsman");
  d.keyvals([
    ["Namn", u.besiktningsman.namn],
    ["Telefon", u.besiktningsman.telefon],
    ["E-post", u.besiktningsman.epost],
    ["Behörighet", u.besiktningsman.behorighet],
    ["Certifieringsorgan", u.besiktningsman.certOrgan],
    ["Certifikatnr", u.besiktningsman.certNr],
  ]);

  d.heading("Sammanställning av system");
  d.table(
    ["System", "Typ", "Resultat", "Intervall", "Nästa kontroll", "Behörighet"],
    (u.system || []).map((s) => {
      const ok = behorighetRacker(u.besiktningsman.behorighet, s.systemtyp, u.byggnad.kategori);
      return [s.systemnr, s.systemtyp, s.resultat || "—", (systemIntervall(u, s) || "–") + " år", systemNastaDatum(u, s) || "—", ok ? "OK" : "Kontrollera!"];
    }),
    [2, 2, 2.5, 2, 3, 2.5]
  );

  for (const s of (u.system || [])) {
    d.addPage();
    d.heading(`System ${s.systemnr || "?"}  (${s.systemtyp || "—"})`);
    d.keyvals([
      ["Resultat", s.resultat || "—"],
      ["Besiktningsdatum", s.besiktningsdatum || u.besiktningsdatum],
      ["Ombesiktning", s.ombesiktningsdatum || "—"],
      ["Intervall", (systemIntervall(u, s) || "–") + " år"],
      ["Nästa kontroll", systemNastaDatum(u, s) || "—"],
      ["Beskrivning", s.beskrivning || "—"],
    ]);

    const utfallRows = [];
    for (const g of POSITIONER) for (const [code, label] of g.pos) {
      const v = (s.utfall || {})[code];
      if (v && (v.v || v.text)) utfallRows.push([code, label, v.v ? utfallText(v.v) : "", v.text || ""]);
    }
    if (utfallRows.length) { d.heading("Kontrollpunkter", 11); d.table(["Pos", "Punkt", "Utfall", "Notering"], utfallRows, [1, 4, 4, 6]); }

    if ((s.fläktar || []).length) {
      d.heading("Fläktar / systemdelar", 11);
      d.table(["Systemdel", "Fläkttyp", "Inst.år", "Proj. l/s", "Uppm. l/s", "Betjänar"],
        s.fläktar.map((f) => [f.systemdel, f.fläkttyp, f.instAr, f.projFlode, f.uppmFlode, f.betjanar]),
        [3, 2, 1.5, 2, 2, 4], { alignRight: [3, 4] });
    }

    if ((s.matpunkter || []).length) {
      d.heading("Luftflödesprotokoll", 11);
      const sumf = systemFlode(u, s);
      d.table(["Rum", "Don TL", "Proj TL", "Uppm TL", "Don FL", "Proj FL", "Uppm FL", "Ant."],
        s.matpunkter.map((m) => [m.rumNr, m.tl.dontyp, m.tl.proj, m.tl.uppm, m.fl.dontyp, m.fl.proj, m.fl.uppm, m.anteckning]),
        [1.5, 2.5, 1.6, 1.6, 2.5, 1.6, 1.6, 3], { alignRight: [2, 3, 5, 6] });
      d.text(`Summa tilluft: proj ${fmt(sumf.tlProj, 0)} / uppmätt ${fmt(sumf.tlUppm, 0)} l/s   ·   frånluft: proj ${fmt(sumf.flProj, 0)} / uppmätt ${fmt(sumf.flUppm, 0)} l/s`, { size: 9, color: C.muted });
    }

    for (const a of (s.aggregat || [])) {
      const sfp = aggregatSfpv(a);
      d.heading(`Aggregat ${a.benamning || a.typ || ""}`, 11);
      d.keyvals([
        ["Fabrikat", a.fabrikat], ["Typ", a.typ], ["Placering", a.placering], ["Betjänar", a.betjanar],
        ["Tilluft proj/uppm l/s", `${a.tilluft.projFlodeLs || "—"} / ${a.tilluft.uppmFlodeLs || "—"}`],
        ["Frånluft proj/uppm l/s", `${a.franluft.projFlodeLs || "—"} / ${a.franluft.uppmFlodeLs || "—"}`],
        ["P_mätt tilluft kW", a.tilluft.pmattEffektKw], ["P_mätt frånluft kW", a.franluft.pmattEffektKw],
        ["SFPv kW/(m³/s)", sfp === null ? "—" : sfp.toFixed(2)],
      ]);
    }

    if ((s.klimat || []).length) {
      d.heading("Klimat", 11);
      d.table(["Rum", "Benämning", "CO₂ rum", "CO₂ FL", "RF %", "Radon", "Anm."],
        s.klimat.map((k) => [k.rumNr, k.benamning, k.co2Rum, k.co2Franluft, k.rh, k.radon, k.anm]),
        [1.5, 3, 2, 2, 1.5, 1.5, 4], { alignRight: [2, 3, 4, 5] });
    }

    if ((s.anmarkningar || []).length) {
      d.heading("Anmärkningar", 11);
      d.table(["Pos", "Anmärkning", "Utfall"], s.anmarkningar.map((a) => [a.pos, a.text, a.utfall ? utfallText(a.utfall) : ""]), [1.5, 8, 4]);
    }
    if ((s.atgarder || []).length) {
      d.heading("Åtgärder", 11);
      d.table(["Pos", "Åtgärd", "Kostnad"], s.atgarder.map((a) => [a.pos, a.text, a.kostnad]), [1.5, 8, 2.5]);
    }
    if ((s.energiforslag || []).length) {
      d.heading("Energibesparande åtgärder", 11);
      for (const e of s.energiforslag) d.text("• " + (e.text || ENERGIÅTGÄRDER[e.nr] || ""), { size: 9 });
    }
    if (s.notering) d.text("Notering: " + s.notering, { size: 9 });
  }

  if (u.allmantOmdome || u.notering) {
    d.heading("Allmänt omdöme");
    if (u.allmantOmdome) d.text(u.allmantOmdome, { size: 10 });
    if (u.notering) d.text(u.notering, { size: 9, color: C.muted });
  }

  d.ensure(70);
  d.y -= 10;
  d.page.drawLine({ start: { x: M, y: d.y }, end: { x: M + 220, y: d.y }, thickness: 0.7, color: rgb(C.muted) });
  d.page.drawLine({ start: { x: A4[0] - M - 200, y: d.y }, end: { x: A4[0] - M, y: d.y }, thickness: 0.7, color: rgb(C.muted) });
  d.page.drawText("Ort och datum", { x: M, y: d.y - 12, size: 8, font: d.font, color: rgb(C.muted) });
  d.page.drawText("Underskrift besiktningsman", { x: A4[0] - M - 200, y: d.y - 12, size: 8, font: d.font, color: rgb(C.muted) });

  const name = `OVK_${(u.byggnad.fastighetsbeteckning || "protokoll").replace(/[^\wåäöÅÄÖ-]+/g, "_")}_${u.besiktningsdatum || ""}.pdf`;
  return d.save(name);
}

function kategoriLabel(v) {
  const map = { smahus: "En-/tvåbostadshus", flerbostadshus: "Flerbostadshus", kontor: "Kontor", skola_vard: "Skola/förskola/vård", industri_kontor: "Kontor i industribyggnad", ovrig: "Övrig byggnad" };
  return map[v] || v || "—";
}
function utfallText(v) {
  if (v === "0") return "Kommentar";
  if (v === "1") return "Bör åtgärdas";
  if (v === "2") return "Skall åtgärdas snarast";
  return v || "";
}
