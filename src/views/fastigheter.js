import * as db from "../db.js";
import { uppdragSummary, systemNastaDatum } from "../model.js";
import { esc, $, $$, toast, confirmAction } from "../ui.js";

// Koppla ett uppdrag till en fastighet (skapa vid behov).
export async function syncFastighet(uppdrag) {
  const b = uppdrag.byggnad || {};
  if (!b.fastighetsbeteckning) return null;
  const alla = await db.getAll("fastigheter");
  let f = uppdrag.fastighetId ? alla.find((x) => x.id === uppdrag.fastighetId) : null;
  if (!f) f = alla.find((x) => x.beteckning === b.fastighetsbeteckning);
  if (!f) {
    f = { id: crypto.randomUUID(), beteckning: b.fastighetsbeteckning, adress: b.adress, postnr: b.postnr, ort: b.ort, kategori: b.kategori, agare: b.byggnadsagare };
  } else {
    Object.assign(f, { beteckning: b.fastighetsbeteckning, adress: b.adress || f.adress, postnr: b.postnr || f.postnr, ort: b.ort || f.ort, kategori: b.kategori || f.kategori });
  }
  await db.put("fastigheter", f);
  if (uppdrag.fastighetId !== f.id) { uppdrag.fastighetId = f.id; await db.put("uppdrag", uppdrag); }
  return f;
}

export async function renderLista(main) {
  const [fast, uppdrag] = await Promise.all([db.getAll("fastigheter"), db.getAll("uppdrag")]);
  main.innerHTML = `
    <div class="page-head"><div><h1>Fastigheter</h1><div class="sub">Objekt med historik över besiktningar</div></div></div>
    ${fast.length ? fast.map((f) => {
      const us = uppdrag.filter((u) => u.fastighetId === f.id || u.byggnad?.fastighetsbeteckning === f.beteckning);
      const sum = us.map((u) => uppdragSummary(u)).sort((a, b) => (a.nastaDatum || "9999").localeCompare(b.nastaDatum || "9999"))[0];
      return `<div class="item">
        <div><strong>${esc(f.beteckning)}</strong>
          <div class="meta">${esc(f.adress || "")}${f.ort ? ", " + esc(f.ort) : ""} · ${us.length} besiktning(ar)</div>
          ${sum ? `<div class="meta">Nästa: ${esc(sum.nastaDatum || "—")} <span class="badge ${sum.deadline.cls}">${esc(sum.deadline.label)}</span></div>` : ""}</div>
        <div class="item-actions"><button class="btn small" data-open="${esc(f.id)}">Öppna</button>
          <button class="btn danger small" data-del="${esc(f.id)}">×</button></div>
      </div>`;
    }).join("") : `<div class="card ul-empty">Inga fastigheter ännu. De skapas automatiskt när du sparar ett uppdrag med fastighetsbeteckning.</div>`}`;

  $$("[data-open]", main).forEach((b) => b.addEventListener("click", () => { location.hash = `#/fastighet/${b.dataset.open}`; }));
  $$("[data-del]", main).forEach((b) => b.addEventListener("click", async () => {
    if (!confirmAction("Ta bort fastigheten? Uppdragen finns kvar.")) return;
    await db.del("fastigheter", b.dataset.del); renderLista(main);
  }));
}

export async function renderDetalj(main, id) {
  const f = await db.get("fastigheter", id);
  if (!f) { main.innerHTML = `<div class="card">Fastigheten hittades inte.</div>`; return; }
  const alla = await db.getAll("uppdrag");
  const us = alla.filter((u) => u.fastighetId === f.id || u.byggnad?.fastighetsbeteckning === f.beteckning)
    .sort((a, b) => (b.besiktningsdatum || "").localeCompare(a.besiktningsdatum || ""));

  main.innerHTML = `
    <div class="page-head">
      <div><h1>${esc(f.beteckning)}</h1><div class="sub">${esc(f.adress || "")}${f.ort ? ", " + esc(f.ort) : ""}</div></div>
      <a class="btn" href="#/nytt">+ Nytt uppdrag</a>
    </div>
    <h2>Besiktningshistorik</h2>
    ${us.length ? us.map((u) => {
      const s = uppdragSummary(u);
      const sysRows = (u.system || []).map((sy) => {
        const nd = systemNastaDatum(u, sy);
        return `<tr><td>${esc(sy.systemnr)}</td><td>${esc(sy.systemtyp)}</td><td>${esc(sy.resultat || "—")}</td><td>${esc(sy.besiktningsdatum || u.besiktningsdatum || "")}</td><td>${esc(nd || "—")}</td></tr>`;
      }).join("");
      return `<div class="card">
        <div class="btn-row" style="justify-content:space-between">
          <div><strong>${esc(u.besiktningsdatum || "—")}</strong> · ${esc(u.uppdragstyp || "")} <span class="badge ${s.deadline.cls}">${esc(s.deadline.label)}</span></div>
          <button class="btn small" data-open="${esc(u.id)}">Öppna</button>
        </div>
        <div class="tbl-wrap" style="max-height:none;margin-top:10px"><table>
          <thead><tr><th>System</th><th>Typ</th><th>Resultat</th><th>Besiktigad</th><th>Nästa</th></tr></thead>
          <tbody>${sysRows || `<tr><td colspan="5" class="sub">Inga system.</td></tr>`}</tbody>
        </table></div>
      </div>`;
    }).join("") : `<div class="card ul-empty">Ingen historik ännu.</div>`}`;

  $$("[data-open]", main).forEach((b) => b.addEventListener("click", () => { location.hash = `#/uppdrag/${b.dataset.open}`; }));
}
