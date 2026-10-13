import * as db from "../db.js";
import {
  nyttUppdrag, nyttSystem, nyFläkt, nyMatpunkt, matpunktKvot, nyAggregat, nyKlimat, nyAnmarkning, nyAtgard,
  uppdragSummary, systemIntervall, systemNastaDatum, systemFlode, aggregatSfpv, behorighetRacker,
} from "../model.js";
import {
  POSITIONER, SYSTEMTYPER, FLÄKTTYPER, RESULTAT, UTFALL, UPPDRAGSTYPER,
  BYGGNADSKATEGORIER, MÄTMETODER, MÄTMETOD_FÖRKLARING, ENERGIÅTGÄRDER,
} from "../constants.js";
import { intervallAr, nastaDatum, todayISO, num, fmt, avvikelseKlass } from "../domain.js";
import { esc, $, $$, toast, debounce, options, field, textarea, option } from "../ui.js";
import { syncFastighet } from "./fastigheter.js";
import { syncKund, skapaKund, forvaldKund, settForvaldKund } from "../kunder.js";

const st = { data: null, tab: "byggnad", sysId: null, sub: "grund", kunder: [] };
let save = () => {};

function scheduleSave() { save(); }

async function load(id) {
  st.data = await db.get("uppdrag", id);
  if (!st.data) throw new Error("Uppdraget hittades inte.");
  if (!st.data.system) st.data.system = [];
  if (!st.data.intyg) st.data.intyg = [];
  if (!st.sysId && st.data.system[0]) st.sysId = st.data.system[0].id;
  st.kunder = (await db.getAll("kunder")).sort((a, b) => a.namn.localeCompare(b.namn, "sv"));
  save = debounce(async () => { await db.put("uppdrag", st.data); await syncFastighet(st.data); await syncKund(st.data); }, 350);
}

export async function renderNytt(main) {
  const s = await db.getMeta("settings");
  const u = nyttUppdrag(s);
  const kund = forvaldKund();
  if (kund) u.kundId = kund;
  settForvaldKund("");
  await db.put("uppdrag", u);
  location.hash = `#/uppdrag/${u.id}`;
}

export async function renderUppdrag(main, id) {
  if (!st.data || st.data.id !== id) { st.tab = "byggnad"; st.sysId = null; st.sub = "grund"; }
  await load(id);
  main.innerHTML = frame();
  bind(main);
  renderTabContent();
}

function frame() {
  const u = st.data;
  const sum = uppdragSummary(u);
  const behörighetsfel = [];
  for (const s of u.system) if (s.systemtyp && !behorighetRacker(u.besiktningsman.behorighet, s.systemtyp, u.byggnad.kategori))
    behörighetsfel.push(s.systemnr || "(utan nr)");
  return `
  <div class="page-head">
    <div>
      <h1>${esc(u.byggnad.fastighetsbeteckning || "Nytt uppdrag")}</h1>
      <div class="sub">${esc(u.byggnad.adress || "")}${u.byggnad.ort ? ", " + esc(u.byggnad.ort) : ""} · Besiktigad ${esc(u.besiktningsdatum || "—")} · Nästa ${esc(sum.nastaDatum || "—")}
        <span class="badge ${sum.deadline.cls}" style="margin-left:6px">${esc(sum.deadline.label)}</span>
      </div>
    </div>
    <div class="btn-row">
      <button class="btn secondary small" id="back-btn">← Översikt</button>
      <button class="btn secondary small" id="pdf-btn">PDF-protokoll</button>
    </div>
  </div>
  ${behörighetsfel.length ? `<div class="callout bad" style="margin-bottom:14px">⚠ Behörighet <strong>${esc(u.besiktningsman.behorighet)}</strong> täcker inte system ${esc(behörighetsfel.join(", "))} i kategori ${esc(kategoriLabel(u.byggnad.kategori))}. Kontrollera enligt BFS 2011:16 6 §.</div>` : ""}
  <div class="tabs">
    ${tabBtn("byggnad", "Byggnad")}
    ${tabBtn("system", "System (" + u.system.length + ")")}
    ${tabBtn("intyg", "Intyg (" + u.intyg.length + ")")}
    ${tabBtn("sammanstallning", "Sammanställning")}
  </div>
  <div id="tab-content"></div>`;
}
function tabBtn(key, label) { return `<button data-tab="${key}" class="${st.tab === key ? "active" : ""}">${label}</button>`; }
function kategoriLabel(v) { return (BYGGNADSKATEGORIER.find((k) => k.v === v) || {}).label || v || "—"; }

function bind(main) {
  $("#back-btn", main).addEventListener("click", () => { location.hash = "#/"; });
  $("#pdf-btn", main).addEventListener("click", async () => {
    const { genereraPDF } = await import("../pdf.js");
    await db.put("uppdrag", st.data);
    await genereraPDF(st.data, { settings: await db.getMeta("settings") });
  });
  $$("[data-tab]", main).forEach((b) => b.addEventListener("click", () => {
    st.tab = b.dataset.tab;
    if (st.tab === "system" && !st.sysId && st.data.system[0]) st.sysId = st.data.system[0].id;
    main.innerHTML = frame(); bind(main); renderTabContent();
  }));
}

function renderTabContent() {
  const c = $("#tab-content");
  if (st.tab === "byggnad") return renderByggnad(c);
  if (st.tab === "system") return renderSystem(c);
  if (st.tab === "intyg") return renderIntyg(c);
  if (st.tab === "sammanstallning") return renderSammanstallning(c);
}

/* ============ A. Byggnad ============ */
function renderByggnad(c) {
  const u = st.data, b = u.byggnad, bm = u.besiktningsman;
  const int = intervallAr(b.kategori, "FTX");
  const intFT = intervallAr(b.kategori, "FTX"), intS = intervallAr(b.kategori, "S");
  c.innerHTML = `
  <div class="card">
    <h3>Fastighet &amp; byggnad</h3>
    <div class="row">
      <div class="field"><label>Kund</label>
        <select id="kund-val">
          ${option("", "— Utan kund —", !u.kundId)}
          ${st.kunder.map((k) => option(k.id, k.namn, u.kundId === k.id)).join("")}
          ${option("__ny__", "＋ Ny kund…", false)}
        </select>
        <div class="hint">Styr vilken kundflik uppdraget hamnar under på översikten.</div>
      </div>
    </div>
    <div class="row">
      ${field("Fastighetsbeteckning", "b.fastighetsbeteckning", b.fastighetsbeteckning)}
      ${field("Adress", "b.adress", b.adress)}
      ${field("Postnr", "b.postnr", b.postnr)}
      ${field("Ort", "b.ort", b.ort)}
    </div>
    <div class="row">
      <div class="field"><label>Byggnadskategori (styr kontrollintervall)</label>
        <select name="b.kategori">${options(BYGGNADSKATEGORIER, b.kategori)}</select></div>
      ${field("Byggnadens namn", "b.interntNamn", b.interntNamn)}
      ${field("Byggnadsnummer", "b.interntNr", b.interntNr)}
      ${field("Verksamhet", "b.verksamhet", b.verksamhet)}
    </div>
    <div class="row">
      ${field("BTA (m²)", "b.braM2", b.braM2, { type: "number" })}
      ${field("Antal lägenheter", "b.antLgh", b.antLgh, { type: "number" })}
      ${field("Antal lokaler", "b.antLokaler", b.antLokaler, { type: "number" })}
    </div>
    <div class="callout">Intervall i denna kategori: <strong>${intFT || "–"} år</strong> för FT/FTX (och alla system i skola/vård), <strong>${intS || "–"} år</strong> för S/F/FX. ${intFT === 0 && intS === 0 ? "En-/tvåbostadshus: endast första besiktning." : ""}</div>
  </div>

  <div class="card">
    <h3>Byggnadens ägare</h3>
    <div class="row">
      ${field("Ägare", "b.byggnadsagare", b.byggnadsagare)}
      ${field("Adress", "b.byggnadsagareAdress", b.byggnadsagareAdress)}
      ${field("Postnr", "b.byggnadsagarePostnr", b.byggnadsagarePostnr)}
      ${field("Ort", "b.byggnadsagareOrt", b.byggnadsagareOrt)}
    </div>
    <h3 style="margin-top:14px">Faktureringsadress</h3>
    <div class="row">
      ${field("Mottagare", "b.fakturaAdress", b.fakturaAdress)}
      ${field("Postnr", "b.fakturaPostnr", b.fakturaPostnr)}
      ${field("Ort", "b.fakturaOrt", b.fakturaOrt)}
    </div>
    <h3 style="margin-top:14px">Förvaltare / kontakt</h3>
    <div class="row">
      ${field("Namn", "b.forvaltare", b.forvaltare)}
      ${field("Telefon", "b.forvaltareTelefon", b.forvaltareTelefon)}
      ${field("E-post", "b.forvaltareEpost", b.forvaltareEpost)}
    </div>
  </div>

  <div class="card">
    <h3>Besiktningstillfälle</h3>
    <div class="row">
      <div class="field"><label>Uppdragstyp</label><select name="u.uppdragstyp">${options(UPPDRAGSTYPER, u.uppdragstyp)}</select></div>
      ${field("Referensnummer", "u.referensNr", u.referensNr)}
      ${field("Besiktningsdatum", "u.besiktningsdatum", u.besiktningsdatum, { type: "date" })}
    </div>
  </div>

  <div class="card">
    <h3>Besiktningsman</h3>
    <div class="row">
      ${field("Namn", "bm.namn", bm.namn)}
      ${field("Telefon", "bm.telefon", bm.telefon)}
      ${field("E-post", "bm.epost", bm.epost)}
      <div class="field"><label>Behörighetsnivå</label><select name="bm.behorighet">
        ${option("K", "K – alla byggnader", bm.behorighet)}${option("N", "N – begränsad", bm.behorighet)}</select></div>
    </div>
    <div class="row">
      ${field("Certifieringsorgan", "bm.certOrgan", bm.certOrgan)}
      ${field("Certifikatnummer", "bm.certNr", bm.certNr)}
      ${field("Giltigt t.o.m.", "bm.certGiltigTom", bm.certGiltigTom, { type: "date" })}
    </div>
    <div class="hint">Nivå N: S/F/FX överallt samt FT/FTX endast i en-/tvåbostadshus. Nivå K: samtliga system och byggnader.</div>
  </div>

  <div class="card">
    ${textarea("Allmänt omdöme (A3)", "u.allmantOmdome", u.allmantOmdome, "Ex: Systemen bedöms i huvudsak fungera tillfredsställande…")}
    ${textarea("Notering", "u.notering", u.notering)}
    ${field("Bilagor", "u.bilagor", u.bilagor, { placeholder: "Ritningar, flödesprotokoll, intrångsprotokoll…" })}
  </div>`;
  bindSection(c, () => st.data, { b: () => st.data.byggnad, bm: () => st.data.besiktningsman, u: () => st.data });
  $("#kund-val", c)?.addEventListener("change", async (e) => {
    let v = e.target.value;
    if (v === "__ny__") {
      const namn = window.prompt("Namn på ny kund:");
      if (!namn || !namn.trim()) { e.target.value = u.kundId || ""; return; }
      const k = await skapaKund(namn.trim());
      v = k ? k.id : "";
      st.kunder = (await db.getAll("kunder")).sort((a, b) => a.namn.localeCompare(b.namn, "sv"));
    }
    u.kundId = v || "";
    await db.put("uppdrag", u);
    toast("Kund uppdaterad");
    renderByggnad(c);
  });
}

/* ============ B. System ============ */
function renderSystem(c) {
  const u = st.data;
  if (!st.sysId && u.system[0]) st.sysId = u.system[0].id;
  const sys = u.system.find((s) => s.id === st.sysId);
  const list = u.system.map((s) => {
    const nd = systemNastaDatum(u, s);
    const akt = s.id === st.sysId;
    return `<div class="item" style="grid-template-columns:1fr auto;cursor:pointer;border-color:${akt ? "var(--brand)" : "var(--line)"}" data-sys="${s.id}">
      <div><strong>System ${esc(s.systemnr || "?")}</strong> <span class="pill">${esc(s.systemtyp || "—")}</span>
        <div class="meta">${s.resultat ? badgeResultat(s.resultat) + " · " : ""}Intervall ${systemIntervall(u, s) || "–"} år · Nästa ${esc(nd || "—")}</div></div>
      <div class="item-actions"><button class="btn danger small" data-delsys="${s.id}">×</button></div>
    </div>`;
  }).join("");

  c.innerHTML = `
  <div class="grid two" style="grid-template-columns:320px 1fr;align-items:start">
    <div>
      <button class="btn" id="add-sys" style="width:100%;margin-bottom:10px">+ Lägg till system</button>
      ${u.system.length ? list : `<div class="card ul-empty">Inga system ännu.</div>`}
    </div>
    <div id="sys-editor">${sys ? systemEditor(u, sys) : `<div class="card ul-empty">Välj eller lägg till ett system.</div>`}</div>
  </div>`;

  $("#add-sys", c).addEventListener("click", async () => {
    const nr = String(u.system.length + 1);
    const s = nyttSystem(nr);
    s.besiktningsdatum = u.besiktningsdatum || todayISO();
    u.system.push(s);
    st.sysId = s.id; st.sub = "grund";
    await db.put("uppdrag", u);
    renderTabContent();
  });
  $$("[data-sys]", c).forEach((d) => d.addEventListener("click", (e) => {
    if (e.target.closest("[data-delsys]")) return;
    st.sysId = d.dataset.sys; renderTabContent();
  }));
  $$("[data-delsys]", c).forEach((b) => b.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!window.confirm("Ta bort systemet?")) return;
    u.system = u.system.filter((s) => s.id !== b.dataset.delsys);
    if (st.sysId === b.dataset.delsys) st.sysId = u.system[0]?.id || null;
    await db.put("uppdrag", u); renderTabContent();
  }));
  if (sys) bindSystemEditor(c, sys);
}

function badgeResultat(r) {
  if (r === "G") return `<span class="badge ok">G</span>`;
  if (r === "EG") return `<span class="badge bad">EG</span>`;
  return `<span class="badge muted">${esc(r)}</span>`;
}

function systemEditor(u, s) {
  const subs = [["grund", "Grunddata"], ["checklista", "Checklista"], ["flaktar", "Fläktar"], ["luftflode", "Luftflöden"], ["aggregat", "Aggregat (SFPv)"], ["klimat", "Klimat"], ["anmarkning", "Anmärkning"], ["atgard", "Åtgärd"], ["energi", "Energi"]];
  return `
  <div class="card">
    <div class="tabs" style="margin-bottom:14px">${subs.map(([k, l]) => `<button data-sub="${k}" class="${st.sub === k ? "active" : ""}">${l}</button>`).join("")}</div>
    <div id="sub-content">${subContent(u, s)}</div>
  </div>`;
}

function subContent(u, s) {
  if (st.sub === "grund") return subGrund(u, s);
  if (st.sub === "checklista") return subChecklista(s);
  if (st.sub === "flaktar") return subFlaktar(s);
  if (st.sub === "luftflode") return subLuftflode(u, s);
  if (st.sub === "aggregat") return subAggregat(u, s);
  if (st.sub === "klimat") return subKlimat(s);
  if (st.sub === "anmarkning") return subAnmarkning(s);
  if (st.sub === "atgard") return subAtgard(s);
  if (st.sub === "energi") return subEnergi(s);
  return "";
}

function bindSystemEditor(c, s) {
  $$("[data-sub]", c).forEach((b) => b.addEventListener("click", () => { st.sub = b.dataset.sub; renderTabContent(); }));
  const sub = $("#sub-content", c);
  if (st.sub === "grund") {
    bindSection(sub, () => st.data, { s: () => s, u: () => st.data });
    bindResultatAuto(s, sub);
  } else if (st.sub === "luftflode") bindLuftflode(sub, s);
  else if (st.sub === "aggregat") bindAggregat(sub, s);
  else if (st.sub === "klimat") bindColl(sub, s, "klimat", "data-add-kilmat");
  else if (st.sub === "anmarkning") bindColl(sub, s, "anmarkningar", "data-add-anm");
  else if (st.sub === "atgard") bindColl(sub, s, "atgarder", "data-add-atg");
  else if (st.sub === "flaktar") bindColl(sub, s, "fläktar", "data-add-flakt");
  else if (st.sub === "checklista") bindChecklista(sub, s);
  else if (st.sub === "energi") bindEnergi(sub, s);
}

function subGrund(u, s) {
  const nd = systemNastaDatum(u, s);
  const byggUtanKrav = systemIntervall(u, s) === 0;
  return `
  <div class="row">
    ${field("Systemnummer", "s.systemnr", s.systemnr)}
    <div class="field"><label>Systemtyp</label><select name="s.systemtyp">${options(SYSTEMTYPER, s.systemtyp)}</select></div>
    <div class="field"><label>Resultat</label><select name="s.resultat">${options(RESULTAT, s.resultat)}</select></div>
  </div>
  <div class="row">
    ${field("Besiktningsdatum (system)", "s.besiktningsdatum", s.besiktningsdatum, { type: "date" })}
    ${field("Ombesiktningsdatum", "s.ombesiktningsdatum", s.ombesiktningsdatum, { type: "date" })}
    ${field("Föregående förfallodatum", "s.forfallitDatum", s.forfallitDatum, { type: "date", hint: "Datumet då denna besiktning senast skulle varit gjord. Lämna tom vid första kontroll." })}
  </div>
  ${textarea("Systembeskrivning / betjänar", "s.beskrivning", s.beskrivning, "Ex: FTX-aggregat för kontorsdel plan 1–2…")}
  <div class="row">${field("Verkningsgrad / aggregatbeteckning", "s.betjanar", s.betjanar)}</div>
  <div class="callout${byggUtanKrav ? " ok" : ""}">Intervall: <strong>${systemIntervall(u, s) || "inget återkommande krav"}</strong>. Nästa besiktning beräknas till <strong>${esc(nd || "—")}</strong>${s.forfallitDatum ? " (försenad besiktning räknas från förfallodatumet enligt BFS 2011:16 3 §)" : ""}.</div>
  ${textarea("Notering", "s.notering", s.notering)}`;
}

function bindResultatAuto(s, root) {
  const sel = root.querySelector('[name="s.resultat"]');
  if (sel) sel.addEventListener("change", async () => {
    if (s.resultat === "EG" && !s.ombesiktningsdatum) toast("EG valt – ange ombesiktningsdatum.");
    await db.put("uppdrag", st.data);
  });
}

/* --- Checklista --- */
function subChecklista(s) {
  s.utfall = s.utfall || {};
  return POSITIONER.map((g) => `
    <div class="pos-group">
      <h3>${esc(g.grupp)}</h3>
      ${g.pos.map(([code, label, guide]) => {
        const u = s.utfall[code] || {};
        return `<div class="pos-row">
          <div class="poscode">${esc(code)}</div>
          <div><strong>${esc(label)}</strong><div class="guide">${esc(guide)}</div>
            <input data-pos-text="${esc(code)}" value="${esc(u.text || "")}" placeholder="Notering…" style="margin-top:6px"></div>
          <div class="utfall"><select data-pos-utfall="${esc(code)}" class="utfall">${option("", "—", u.v)}${options(UTFALL, u.v)}</select></div>
        </div>`;
      }).join("")}
    </div>`).join("");
}
function bindChecklista(root, s) {
  root.addEventListener("input", (e) => {
    const sel = e.target.closest("[data-pos-utfall]"); const txt = e.target.closest("[data-pos-text]");
    if (sel) { const c = sel.dataset.posUtfall; s.utfall[c] = { ...(s.utfall[c] || {}), v: sel.value }; scheduleSave(); }
    else if (txt) { const c = txt.dataset.posText; s.utfall[c] = { ...(s.utfall[c] || {}), text: txt.value }; scheduleSave(); }
  });
  root.addEventListener("change", (e) => {
    const sel = e.target.closest("[data-pos-utfall]");
    if (sel) { const c = sel.dataset.posUtfall; s.utfall[c] = { ...(s.utfall[c] || {}), v: sel.value }; scheduleSave(); }
  });
}

/* --- Fläktar (B2) --- */
function subFlaktar(s) {
  return `<div class="btn-row" style="margin-bottom:8px"><button class="btn small" data-add-flakt>+ Fläkt/systemdel</button></div>
  <div class="tbl-wrap"><table>
    <thead><tr><th>Systemdel</th><th>Fläkttyp</th><th>Inst.år</th><th>Placering</th><th>Proj. (l/s)</th><th>Uppmätt (l/s)</th><th>Betjänar</th><th></th></tr></thead>
    <tbody>${(s.fläktar || []).map((f) => `<tr>
      <td><input data-id="${f.id}" data-field="systemdel" value="${esc(f.systemdel)}"></td>
      <td><select data-id="${f.id}" data-field="fläkttyp">${options(FLÄKTTYPER, f.fläkttyp)}</select></td>
      <td><input data-id="${f.id}" data-field="instAr" value="${esc(f.instAr)}" style="min-width:60px"></td>
      <td><input data-id="${f.id}" data-field="placering" value="${esc(f.placering)}"></td>
      <td class="num"><input data-id="${f.id}" data-field="projFlode" value="${esc(f.projFlode)}" class="num" style="text-align:right"></td>
      <td class="num"><input data-id="${f.id}" data-field="uppmFlode" value="${esc(f.uppmFlode)}" class="num" style="text-align:right"></td>
      <td><input data-id="${f.id}" data-field="betjanar" value="${esc(f.betjanar)}"></td>
      <td><button class="btn danger small" data-rid="${f.id}" data-coll="fläktar">×</button></td>
    </tr>`).join("") || `<tr><td colspan="8" class="sub">Inga fläktar.</td></tr>`}</tbody>
  </table></div>`;
}

/* --- Luftflöde (L1) – replika av mallens luftflödesprotokoll --- */
const L1_MIN_RADER = 36;
function await_settings_tol() {
  return (window.__ovkSettings || {}).tolerans || { gron: 10, gul: 20 };
}
function kvotText(sida) {
  const k = matpunktKvot(sida);
  return k === null ? "" : k.toFixed(2);
}
function l1Input(id, field, val, extra = "") {
  return `<input data-id="${id}" data-field="${field}" value="${esc(val)}" ${extra}>`;
}
function luftflodeRad(m, tol) {
  const tlK = avvikelseKlass((matpunktKvot(m.tl) !== null ? matpunktKvot(m.tl) - 1 : 0) * 100, tol.gron, tol.gul);
  const flK = avvikelseKlass((matpunktKvot(m.fl) !== null ? matpunktKvot(m.fl) - 1 : 0) * 100, tol.gron, tol.gul);
  const cls = (tlK === "high" || flK === "high") ? "out-high" : (tlK === "mid" || flK === "mid") ? "out-mid" : "";
  return `<tr class="${cls}">
    <td>${l1Input(m.id, "rumNr", m.rumNr, 'style="min-width:60px"')}</td>
    <td>${l1Input(m.id, "beskrivning", m.beskrivning)}</td>
    <td>${l1Input(m.id, "tl.dontyp", m.tl.dontyp, 'style="min-width:70px"')}</td>
    <td class="num">${l1Input(m.id, "tl.proj", m.tl.proj, 'class="num" style="text-align:right"')}</td>
    <td class="num">${l1Input(m.id, "tl.uppm", m.tl.uppm, 'class="num" style="text-align:right"')}</td>
    <td class="num"><span data-kvot="tl">${kvotText(m.tl)}</span></td>
    <td class="num">${l1Input(m.id, "tl.pa", m.tl.pa, 'class="num" style="text-align:right"')}</td>
    <td>${l1Input(m.id, "tl.kFaktor", m.tl.kFaktor)}</td>
    <td><select data-id="${m.id}" data-field="tl.matMetod"><option value=""${m.tl.matMetod ? "" : " selected"}>—</option>${options(MÄTMETODER, m.tl.matMetod)}</select></td>
    <td>${l1Input(m.id, "fl.dontyp", m.fl.dontyp, 'style="min-width:70px"')}</td>
    <td class="num">${l1Input(m.id, "fl.proj", m.fl.proj, 'class="num" style="text-align:right"')}</td>
    <td class="num">${l1Input(m.id, "fl.uppm", m.fl.uppm, 'class="num" style="text-align:right"')}</td>
    <td class="num"><span data-kvot="fl">${kvotText(m.fl)}</span></td>
    <td class="num">${l1Input(m.id, "fl.pa", m.fl.pa, 'class="num" style="text-align:right"')}</td>
    <td>${l1Input(m.id, "fl.kFaktor", m.fl.kFaktor)}</td>
    <td class="num">${l1Input(m.id, "fl.kageldjup", m.fl.kageldjup, 'class="num" style="text-align:right"')}</td>
    <td><select data-id="${m.id}" data-field="fl.matMetod"><option value=""${m.fl.matMetod ? "" : " selected"}>—</option>${options(MÄTMETODER, m.fl.matMetod)}</select></td>
    <td>${l1Input(m.id, "anteckning", m.anteckning)}</td>
    <td><button class="btn danger small" data-rid="${m.id}" data-coll="matpunkter">×</button></td>
  </tr>`;
}
function subLuftflode(u, s) {
  s.matpunkter = s.matpunkter || [];
  s.l1 = s.l1 || { anlaggning: "", aggregatforteckning: "", ordernr: "", ritningsnummer: "", plan: "", anteckning: "" };
  if (s.matpunkter.length < L1_MIN_RADER) {
    while (s.matpunkter.length < L1_MIN_RADER) s.matpunkter.push(nyMatpunkt());
    scheduleSave();
  }
  const setting = window.__ovkSettings || {};
  const bm = u.besiktningsman || {};
  const foretag = (setting.foretag && setting.foretag.namn) || "";
  const tol = await_settings_tol();
  const sysIdx = (u.system || []).indexOf(s) + 1;
  const sysTot = (u.system || []).length || 1;
  const rows = s.matpunkter.map((m) => luftflodeRad(m, tol)).join("");
  const instr = (setting.matinstrument || []).map((i) => `<li>${esc(i.namn || "")}${i.nr ? " – " + esc(i.nr) : ""}</li>`).join("") || "<li>—</li>";
  const metod = MÄTMETODER.filter((k) => MÄTMETOD_FÖRKLARING[k]).map((k) => `<li><strong>${esc(k)}</strong> ${esc(MÄTMETOD_FÖRKLARING[k])}</li>`).join("");
  return `
  <div class="l1-head">
    <div class="l1-f"><label>Mättekniker</label><div class="l1-ro">${esc(bm.namn || "—")}</div></div>
    <div class="l1-f"><label>Företag</label><div class="l1-ro">${esc(foretag || "—")}</div></div>
    <div class="l1-f"><label>Plan</label><input name="s.l1.plan" value="${esc(s.l1.plan)}"></div>
    <div class="l1-f"><label>Sidnr.</label><div class="l1-ro">${sysIdx} (${sysTot})</div></div>
  </div>
  <div class="l1-head">
    <div class="l1-f"><label>Anläggning</label><input name="s.l1.anlaggning" value="${esc(s.l1.anlaggning)}"></div>
    <div class="l1-f"><label>Ordernummer</label><input name="s.l1.ordernr" value="${esc(s.l1.ordernr)}"></div>
    <div class="l1-f"><label>Ritningsnummer</label><input name="s.l1.ritningsnummer" value="${esc(s.l1.ritningsnummer)}"></div>
    <div class="l1-f"><label>Aggregatförteckning</label><input name="s.l1.aggregatforteckning" value="${esc(s.l1.aggregatforteckning)}"></div>
    <div class="l1-f"><label>Flödesenhet</label><div class="l1-ro">l/s</div></div>
    <div class="l1-f"><label>Datum</label><div class="l1-ro">${esc(s.besiktningsdatum || u.besiktningsdatum || "—")}</div></div>
  </div>
  <div class="btn-row" style="margin:10px 0">
    <button class="btn small" data-add-matpunkt>+ Mätpunkt</button>
    <span class="sub">Flödesenhet: l/s · ${L1_MIN_RADER} rader visas alltid</span>
  </div>
  <div class="tbl-wrap"><table class="l1">
    <thead>
      <tr>
        <th rowspan="2">Rumsnr</th><th rowspan="2">Beskrivning</th>
        <th colspan="7" class="grp">Tilluft</th>
        <th colspan="8" class="grp">Frånluft</th>
        <th rowspan="2">Anteckning</th><th rowspan="2"></th>
      </tr>
      <tr>
        <th>Don Typ</th><th class="num">Proj</th><th class="num">Uppm</th><th class="num">Kvot</th><th class="num">Pa</th><th>K-faktor</th><th>Mät-metod</th>
        <th>Don Typ</th><th class="num">Proj</th><th class="num">Uppm</th><th class="num">Kvot</th><th class="num">Pa</th><th>K-faktor</th><th class="num">Kägel-djup</th><th>Mät-metod</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr class="l1-tot">
        <td colspan="2" style="text-align:right"><strong>TOTALT FLÖDE:</strong></td>
        <td></td>
        <td class="num" data-tot="tlProj"></td>
        <td class="num" data-tot="tlUppm"></td>
        <td class="num" data-tot="tlKvot"></td>
        <td colspan="3"></td>
        <td></td>
        <td class="num" data-tot="flProj"></td>
        <td class="num" data-tot="flUppm"></td>
        <td class="num" data-tot="flKvot"></td>
        <td colspan="4"></td>
        <td colspan="2" class="sub" style="font-size:11px;text-align:right">l/s (bq / eq)</td>
      </tr>
    </tfoot>
  </table></div>
  <div class="l1-fot">
    <div><h4>Anteckningar</h4><textarea name="s.l1.anteckning" rows="3">${esc(s.l1.anteckning || "")}</textarea></div>
    <div><h4>Mätinstrument</h4><ul>${instr}</ul></div>
    <div><h4>Mätmetoder</h4><ul>${metod}</ul></div>
    <div><h4>Underskrift</h4><div class="l1-sign">${esc(bm.namn || "")}</div>
      <div class="sub">${esc(bm.epost || "")}${bm.telefon ? " · " + esc(bm.telefon) : ""}</div>
      <div class="sub">${esc(foretag || "")}</div></div>
  </div>
  <div class="hint" style="margin-top:8px">Kvot = uppmätt / projekterat. Färg: ≤ ±${tol.gron} % grön, ≤ ±${tol.gul} % gul, däröver röd. K-faktor används för don med k-faktor (l/s vid 1 Pa).</div>`;
}

/* --- Aggregat (E1) --- */
function subAggregat(u, s) {
  return (s.aggregat && s.aggregat.length ? s.aggregat.map((a) => aggregatBlock(a)).join("") : `<div class="sub">Inga aggregat.</div>`)
    + `<div class="btn-row" style="margin-top:10px"><button class="btn small" data-add-agg>+ Aggregat</button></div>`;
}
function aggregatBlock(a) {
  const sfp = aggregatSfpv(a);
  const q = [
    ["tilluft", "Tilluft"], ["franluft", "Frånluft"],
  ];
  return `<div class="card" style="box-shadow:none;background:var(--panel-2)">
    <div class="btn-row" style="justify-content:space-between">
      <h3 style="margin:0">Aggregat</h3>
      <button class="btn danger small" data-rid="${a.id}" data-coll="aggregat">Ta bort</button>
    </div>
    <div class="row">
      ${field("Beteckning", `agg.${a.id}.benamning`, a.benamning)}
      ${field("Fabrikat", `agg.${a.id}.fabrikat`, a.fabrikat)}
      ${field("Typ", `agg.${a.id}.typ`, a.typ)}
      ${field("Placering", `agg.${a.id}.placering`, a.placering)}
      ${field("Betjänar", `agg.${a.id}.betjanar`, a.betjanar)}
      ${field("Driftimmar/vecka", `agg.${a.id}.driftimmarVecka`, a.driftimmarVecka)}
    </div>
    <div class="grid two">
      ${["tilluft", "franluft"].map((side) => `<div>
        <h3>${side === "tilluft" ? "Tilluft" : "Frånluft"}</h3>
        <div class="row">
          ${field("Proj. flöde (l/s)", `agg.${a.id}.${side}.projFlodeLs`, a[side].projFlodeLs, { type: "number" })}
          ${field("Uppm. flöde (l/s)", `agg.${a.id}.${side}.uppmFlodeLs`, a[side].uppmFlodeLs, { type: "number" })}
          ${field("P_mätt (kW)", `agg.${a.id}.${side}.pmattEffektKw`, a[side].pmattEffektKw, { type: "number" })}
          ${field("P_kPa (Pa)", `agg.${a.id}.${side}.pkPa`, a[side].pkPa, { type: "number" })}
          ${field("Δp värme (Pa)", `agg.${a.id}.${side}.dpVarme`, a[side].dpVarme, { type: "number" })}
          ${field("Δp kyla (Pa)", `agg.${a.id}.${side}.dpKyla`, a[side].dpKyla, { type: "number" })}
          ${field("Δp filter (Pa)", `agg.${a.id}.${side}.dpFilter`, a[side].dpFilter, { type: "number" })}
          ${field("Δp VVX (Pa)", `agg.${a.id}.${side}.dpVvx`, a[side].dpVvx, { type: "number" })}
          ${field("Temp (°C)", `agg.${a.id}.${side}.temp`, a[side].temp, { type: "number" })}
        </div></div>`).join("")}
    </div>
    <div class="callout${sfp !== null ? (sfp <= 2 ? " ok" : "") : ""}" style="margin-top:10px">SFPv = <strong>${sfp === null ? "—" : sfp.toFixed(2)}</strong> kW/(m³/s) ${sfp !== null ? (sfp <= 2 ? "– uppfyller kravet (≤ 2,0 för FTX, BFS 2011:16 25 §)" : "– kontrollera mot kravvärdet i BFS 2011:16 25 §") : ""}</div>
    <div class="row">
      ${field("Motor fabrikat/typ", `agg.${a.id}.motor.fabrikatTyp`, a.motor.fabrikatTyp)}
      ${field("Varvtal (rpm)", `agg.${a.id}.motor.varvtal`, a.motor.varvtal)}
      ${field("Märkeffekt (kW)", `agg.${a.id}.motor.markEffektKw`, a.motor.markEffektKw)}
      ${field("K-faktor", `agg.${a.id}.motor.k`, a.motor.k)}
      ${field("VVX-typ", `agg.${a.id}.motor.vvxTyp`, a.motor.vvxTyp)}
      ${field("Anmärkning", `agg.${a.id}.motor.anmarkning`, a.motor.anmarkning)}
    </div>
  </div>`;
}

/* --- Klimat (K1) --- */
function subKlimat(s) {
  return `<div class="btn-row" style="margin-bottom:8px"><button class="btn small" data-add-kilmat>+ Rad</button></div>
  <div class="tbl-wrap"><table>
    <thead><tr><th>Rum</th><th>Benämning</th><th>Vistelsezon</th><th>CO₂ rum</th><th>CO₂ FL</th><th>RF %</th><th>Fukt</th><th>Radon</th><th>Anm.</th><th></th></tr></thead>
    <tbody>${(s.klimat || []).map((k) => `<tr>
      <td><input data-id="${k.id}" data-field="rumNr" value="${esc(k.rumNr)}" style="min-width:60px"></td>
      <td><input data-id="${k.id}" data-field="benamning" value="${esc(k.benamning)}"></td>
      <td><input data-id="${k.id}" data-field="vistelsezon" value="${esc(k.vistelsezon)}"></td>
      <td><input data-id="${k.id}" data-field="co2Rum" value="${esc(k.co2Rum)}"></td>
      <td><input data-id="${k.id}" data-field="co2Franluft" value="${esc(k.co2Franluft)}"></td>
      <td><input data-id="${k.id}" data-field="rh" value="${esc(k.rh)}"></td>
      <td><input data-id="${k.id}" data-field="fukt" value="${esc(k.fukt)}"></td>
      <td><input data-id="${k.id}" data-field="radon" value="${esc(k.radon)}"></td>
      <td><input data-id="${k.id}" data-field="anm" value="${esc(k.anm)}"></td>
      <td><button class="btn danger small" data-rid="${k.id}" data-coll="klimat">×</button></td>
    </tr>`).join("") || `<tr><td colspan="10" class="sub">Inga rader.</td></tr>`}</tbody>
  </table></div>`;
}

/* --- Anmärkning (C1) / Åtgärd (D1) --- */
function subAnmarkning(s) {
  return `<div class="btn-row" style="margin-bottom:8px"><button class="btn small" data-add-anm>+ Anmärkning</button></div>
  ${(s.anmarkningar || []).map((a) => `<div class="row" style="align-items:end;margin-bottom:8px">
    <div class="field" style="max-width:110px"><label>Pos</label><input data-id="${a.id}" data-field="pos" value="${esc(a.pos)}"></div>
    <div class="field" style="flex:1"><label>Anmärkning</label><input data-id="${a.id}" data-field="text" value="${esc(a.text)}"></div>
    <div class="field" style="max-width:190px"><label>Utfall</label><select data-id="${a.id}" data-field="utfall">${options(UTFALL, a.utfall)}</select></div>
    <button class="btn danger small" data-rid="${a.id}" data-coll="anmarkningar" style="margin-bottom:12px">×</button>
  </div>`).join("") || `<div class="sub">Inga anmärkningar.</div>`}`;
}
function subAtgard(s) {
  return `<div class="btn-row" style="margin-bottom:8px"><button class="btn small" data-add-atg>+ Åtgärd</button></div>
  ${(s.atgarder || []).map((a) => `<div class="row" style="align-items:end;margin-bottom:8px">
    <div class="field" style="max-width:110px"><label>Pos</label><input data-id="${a.id}" data-field="pos" value="${esc(a.pos)}"></div>
    <div class="field" style="flex:1"><label>Åtgärd</label><input data-id="${a.id}" data-field="text" value="${esc(a.text)}"></div>
    <div class="field" style="max-width:160px"><label>Kostnad (kr)</label><input data-id="${a.id}" data-field="kostnad" value="${esc(a.kostnad)}"></div>
    <button class="btn danger small" data-rid="${a.id}" data-coll="atgarder" style="margin-bottom:12px">×</button>
  </div>`).join("") || `<div class="sub">Inga åtgärder.</div>`}`;
}

/* --- Energi --- */
function subEnergi(s) {
  s.energiforslag = s.energiforslag || [];
  const chosen = new Set(s.energiforslag.map((e) => e.nr));
  return ENERGIÅTGÄRDER.map((txt, i) => `<label class="chk-inline" style="padding:5px 0;align-items:flex-start">
    <input type="checkbox" data-energi="${i}" ${chosen.has(i) ? "checked" : ""} style="margin-top:3px">
    <span>${esc(txt)}</span></label>`).join("");
}
function bindEnergi(root, s) {
  root.addEventListener("change", (e) => {
    const cb = e.target.closest("[data-energi]"); if (!cb) return;
    const nr = Number(cb.dataset.energi);
    s.energiforslag = (s.energiforslag || []).filter((x) => x.nr !== nr);
    if (cb.checked) s.energiforslag.push({ nr, text: ENERGIÅTGÄRDER[nr] });
    s.energiforslag.sort((a, b) => a.nr - b.nr);
    scheduleSave();
  });
}

/* --- Generisk bindning av simpel sektion (path-prefix b./bm./u./s.) --- */
function bindSection(root, getData, resolvers) {
  const handler = (e) => {
    const f = e.target.closest("[name]"); if (!f) return;
    const [prefix, ...rest] = f.name.split(".");
    const obj = resolvers[prefix] ? resolvers[prefix]() : null;
    if (!obj) return;
    setNested(obj, rest.join("."), f.type === "checkbox" ? f.checked : f.value);
    scheduleSave();
  };
  root.addEventListener("input", handler);
  root.addEventListener("change", handler);
}
function setNested(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) { if (!cur[parts[i]]) cur[parts[i]] = {}; cur = cur[parts[i]]; }
  cur[parts[parts.length - 1]] = value;
}

/* --- Tabell-stöd för luftflöde/klimat/aggregat (data-id + data-field) --- */
function bindTable(root, coll, key) { /* platshållare, se specialfall nedan */ }

function findIn(s, coll, id) { return (s[coll] || []).find((x) => x.id === id); }
function bindColl(root, s, coll, addSel) {
  const add = root.querySelector(`[${addSel}]`);
  if (add) add.addEventListener("click", async () => {
    const factory = { fläktar: nyFläkt, matpunkter: nyMatpunkt, klimat: nyKlimat, anmarkningar: nyAnmarkning, atgarder: nyAtgard, aggregat: nyAggregat }[coll];
    s[coll] = s[coll] || []; s[coll].push(factory());
    await db.put("uppdrag", st.data); renderTabContent();
  });
  root.addEventListener("input", (e) => {
    const f = e.target.closest("[data-id][data-field]"); if (!f) return;
    const row = findIn(s, coll, f.dataset.id); if (!row) return;
    setNested(row, f.dataset.field, f.value); scheduleSave();
  });
  root.addEventListener("change", (e) => {
    const f = e.target.closest("[data-id][data-field]"); if (!f) return;
    const row = findIn(s, coll, f.dataset.id); if (!row) return;
    setNested(row, f.dataset.field, f.value); scheduleSave();
    if (f.tagName === "SELECT") renderTabContent();
  });
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-rid]"); if (!b) return;
    s[b.dataset.coll] = s[b.dataset.coll].filter((x) => x.id !== b.dataset.rid);
    await db.put("uppdrag", st.data); renderTabContent();
  });
}
function bindLuftflode(root, s) {
  bindColl(root, s, "matpunkter", "data-add-matpunkt");
  bindSection(root, () => st.data, { s: () => s, u: () => st.data });
  const tbody = root.querySelector("tbody");
  if (tbody) {
    const upd = () => refreshFlode(root, tbody);
    tbody.addEventListener("input", upd);
    tbody.addEventListener("change", upd);
  }
  refreshFlode(root, tbody);
}
function refreshFlode(root, tbody) {
  if (!tbody) return;
  const tol = (window.__ovkSettings || {}).tolerans || { gron: 10, gul: 20 };
  let sTL = 0, uTL = 0, sFL = 0, uFL = 0;
  $$("tr", tbody).forEach((tr) => {
    const get = (f) => { const el = tr.querySelector(`[data-field="${f}"]`); return el ? num(el.value) : null; };
    const tlP = get("tl.proj"), tlU = get("tl.uppm"), flP = get("fl.proj"), flU = get("fl.uppm");
    if (tlP) sTL += tlP; if (tlU) uTL += tlU; if (flP) sFL += flP; if (flU) uFL += flU;
    const setKvot = (tag, p, uu) => {
      const box = tr.querySelector(`[data-kvot="${tag}"]`);
      if (box) box.textContent = p && uu !== null ? (uu / p).toFixed(2) : "";
    };
    setKvot("tl", tlP, tlU); setKvot("fl", flP, flU);
    const kTL = tlP && tlU !== null ? avvikelseKlass(((tlU - tlP) / tlP) * 100, tol.gron, tol.gul) : "";
    const kFL = flP && flU !== null ? avvikelseKlass(((flU - flP) / flP) * 100, tol.gron, tol.gul) : "";
    tr.classList.toggle("out-high", kTL === "high" || kFL === "high");
    tr.classList.toggle("out-mid", (kTL === "mid" || kFL === "mid") && !(kTL === "high" || kFL === "high"));
  });
  const setTot = (name, val) => { const el = root.querySelector(`[data-tot="${name}"]`); if (el) el.textContent = val; };
  setTot("tlProj", fmt(sTL, 0));
  setTot("tlUppm", fmt(uTL, 0));
  setTot("tlKvot", sTL ? (uTL / sTL).toFixed(2) : "");
  setTot("flProj", fmt(sFL, 0));
  setTot("flUppm", fmt(uFL, 0));
  setTot("flKvot", sFL ? (uFL / sFL).toFixed(2) : "");
  const sumBox = root.querySelector("[data-flode-sum]");
  if (sumBox) sumBox.textContent = `Summa TL: proj ${fmt(sTL, 0)} / uppm ${fmt(uTL, 0)} l/s · FL: proj ${fmt(sFL, 0)} / uppm ${fmt(uFL, 0)} l/s`;
}
function bindAggregat(root, s) {
  const add = root.querySelector("[data-add-agg]");
  if (add) add.addEventListener("click", async () => { s.aggregat.push(nyAggregat()); await db.put("uppdrag", st.data); renderTabContent(); });
  root.addEventListener("input", (e) => {
    const f = e.target.closest("[name]"); if (!f) return;
    const m = f.name.match(/^agg\.([^.]+)\.(.+)$/); if (!m) return;
    const agg = s.aggregat.find((a) => a.id === m[1]); if (!agg) return;
    setNested(agg, m[2], f.value); scheduleSave();
    if (/uppmFlodeLs|pmattEffektKw/.test(m[2])) updateSfpv(root, agg);
  });
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-rid]"); if (!b) return;
    s.aggregat = s.aggregat.filter((x) => x.id !== b.dataset.rid);
    await db.put("uppdrag", st.data); renderTabContent();
  });
}
function updateSfpv(root, agg) {
  const box = root.querySelector(`[data-sfpv="${agg.id}"]`);
  if (!box) return;
  const v = aggregatSfpv(agg);
  box.textContent = v === null ? "—" : v.toFixed(2);
}

/* ============ Intyg ============ */
function renderIntyg(c) {
  const u = st.data;
  c.innerHTML = `
  <div class="card">
    <div class="btn-row" style="justify-content:space-between">
      <h3 style="margin:0">Intyg</h3>
      <button class="btn small" id="gen-intyg">+ Generera intyg för alla system</button>
    </div>
    <p class="sub">Intyg genereras från uppdragets system och fastighetsuppgifter och kan skrivas ut som PDF.</p>
    ${(u.intyg || []).map((i) => `<div class="item"><div><strong>${esc(i.rubrik)}</strong><div class="meta">${esc(i.systemnr ? "System " + i.systemnr : "")} ${esc(i.datum || "")}</div></div>
      <div class="item-actions"><button class="btn danger small" data-del-intyg="${i.id}">×</button></div></div>`).join("") || `<div class="ul-empty">Inga intyg genererade.</div>`}
  </div>`;
  $("#gen-intyg", c).addEventListener("click", async () => {
    u.intyg = u.system.map((s) => ({
      id: crypto.randomUUID(), systemnr: s.systemnr, datum: s.besiktningsdatum || u.besiktningsdatum,
      rubrik: `OVK-intyg system ${s.systemnr || "?"} (${s.systemtyp})`,
      resultat: s.resultat || "",
    }));
    await db.put("uppdrag", u); renderTabContent(); toast("Intyg genererade");
  });
  $$("[data-del-intyg]", c).forEach((b) => b.addEventListener("click", async () => {
    u.intyg = u.intyg.filter((x) => x.id !== b.dataset.delIntyg); await db.put("uppdrag", u); renderTabContent();
  }));
}

/* ============ A2 Sammanställning ============ */
function renderSammanstallning(c) {
  const u = st.data;
  const rows = u.system.map((s) => {
    const nd = systemNastaDatum(u, s);
    const beh = behorighetRacker(u.besiktningsman.behorighet, s.systemtyp, u.byggnad.kategori);
    return `<tr>
      <td><strong>${esc(s.systemnr)}</strong></td><td>${esc(s.systemtyp)}</td>
      <td>${badgeResultat(s.resultat)}</td>
      <td>${esc(s.besiktningsdatum || u.besiktningsdatum || "")}</td>
      <td>${systemIntervall(u, s) || "–"}</td>
      <td>${esc(nd || "—")}</td>
      <td>${beh ? `<span class="badge ok">OK</span>` : `<span class="badge bad">Nej</span>`}</td>
    </tr>`;
  }).join("");
  const fel = (await_validera(u));
  c.innerHTML = `
  <div class="card">
    <div class="btn-row" style="justify-content:space-between">
      <h3 style="margin:0">Sammanställning över system</h3>
      <button class="btn secondary small" id="validera">Visa status</button>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>System</th><th>Typ</th><th>Resultat</th><th>Besiktigad</th><th>Intervall (år)</th><th>Nästa</th><th>Behörighet</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="sub">Inga system.</td></tr>`}</tbody>
    </table></div>
  </div>
  <div class="card"><h3>Kontrollpunkter att se över</h3><ul class="sub" style="margin:0;padding-left:18px">${fel.map((f) => `<li>${esc(f)}</li>`).join("") || "<li>Inga anmärkningar – allt ser komplett ut.</li>"}</ul></div>`;
  $("#validera", c).addEventListener("click", () => toast(fel.length ? `${fel.length} punkt(er) att se över` : "Allt ser komplett ut"));
}
function await_validera(u) {
  // Liten lokal valideringsvariant (undviker importcykel med domain.valideraUppdrag).
  const fel = [];
  if (!u.byggnad.fastighetsbeteckning) fel.push("Fastighetsbeteckning saknas.");
  if (!u.byggnad.adress) fel.push("Adress saknas.");
  if (!u.besiktningsman.namn) fel.push("Besiktningsman saknas.");
  if (!u.system.length) fel.push("Inga system tillagda.");
  for (const s of u.system) {
    if (!s.systemtyp) fel.push(`System ${s.systemnr || "?"}: systemtyp saknas.`);
    if (!s.resultat) fel.push(`System ${s.systemnr || "?"}: resultat saknas.`);
    if (s.resultat === "EG" && !s.ombesiktningsdatum) fel.push(`System ${s.systemnr}: EG kräver ombesiktningsdatum.`);
  }
  return fel;
}
