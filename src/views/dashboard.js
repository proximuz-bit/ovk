import * as db from "../db.js";
import { uppdragSummary } from "../model.js";
import { esc, $, $$, toast, confirmAction } from "../ui.js";

export async function renderDashboard(main) {
  const uppdrag = (await db.getAll("uppdrag")).sort((a, b) => (b.besiktningsdatum || "").localeCompare(a.besiktningsdatum || ""));

  const rows = uppdrag.map((u) => ({ u, s: uppdragSummary(u) }))
    .sort((a, b) => (a.s.nastaDatum || "9999").localeCompare(b.s.nastaDatum || "9999"));

  const forsenade = rows.filter((r) => r.s.deadline.key === "over").length;
  const snart = rows.filter((r) => r.s.deadline.key === "snart").length;
  const totaltSystem = uppdrag.reduce((n, u) => n + (u.system?.length || 0), 0);
  const fastigheter = new Set(uppdrag.map((u) => u.byggnad?.fastighetsbeteckning).filter(Boolean)).size;

  main.innerHTML = `
    <div class="page-head">
      <div><h1>Översikt</h1><div class="sub">Besiktningsuppdrag och kommande kontroller</div></div>
      <a class="btn" href="#/nytt">+ Nytt uppdrag</a>
    </div>
    <div class="stat-grid" style="margin-bottom:18px">
      <div class="stat"><div class="n">${uppdrag.length}</div><div class="l">Uppdrag</div></div>
      <div class="stat"><div class="n">${fastigheter}</div><div class="l">Fastigheter</div></div>
      <div class="stat"><div class="n">${totaltSystem}</div><div class="l">System</div></div>
      <div class="stat"><div class="n" style="color:var(--warn)">${snart}</div><div class="l">Inom 90 dagar</div></div>
      <div class="stat"><div class="n" style="color:var(--bad)">${forsenade}</div><div class="l">Försenade</div></div>
    </div>
    <h2>Kommande &amp; aktuella kontroller</h2>
    <div id="list">${rows.length ? rows.map(listItem).join("") : `<div class="card ul-empty">Inga uppdrag ännu. <a href="#/nytt">Skapa ditt första uppdrag</a>.</div>`}</div>
  `;

  $$("[data-open]", main).forEach((b) => b.addEventListener("click", () => { location.hash = `#/uppdrag/${b.dataset.open}`; }));
  $$("[data-fastighet]", main).forEach((b) => b.addEventListener("click", () => { location.hash = `#/fastighet/${b.dataset.fastighet}`; }));
  $$("[data-del]", main).forEach((b) => b.addEventListener("click", async () => {
    if (!confirmAction("Ta bort uppdraget? Detta går inte att ångra.")) return;
    await db.del("uppdrag", b.dataset.del);
    toast("Uppdraget borttaget");
    renderDashboard(main);
  }));
  $$("[data-pdf]", main).forEach((b) => b.addEventListener("click", async () => {
    const { genereraPDF } = await import("../pdf.js");
    const u = uppdrag.find((x) => x.id === b.dataset.pdf);
    await genereraPDF(u, { settings: (await db.getMeta("settings")), db });
  }));
}

function listItem({ u, s }) {
  const d = s.deadline;
  const bet = u.byggnad?.fastighetsbeteckning || "(namnlös fastighet)";
  const adr = [u.byggnad?.adress, u.byggnad?.ort].filter(Boolean).join(", ");
  return `<div class="item">
    <div>
      <strong>${esc(bet)}</strong> <span class="pill">${u.system?.length || 0} system</span>
      <div class="meta">${esc(u.byggnad?.interntNamn || "")}${u.byggnad?.interntNamn ? " · " : ""}${esc(adr)}</div>
      <div class="meta">Besiktigad ${esc(u.besiktningsdatum || "—")} · Nästa ${esc(s.nastaDatum || "—")} · ${esc(u.uppdragstyp || "")}</div>
    </div>
    <div class="item-actions">
      ${s.resultat === "EG" ? `<span class="badge bad">EG</span>` : s.antalSystem ? `<span class="badge ok">${esc(s.resultat)}</span>` : ""}
      <span class="badge ${d.cls}">${esc(d.label)}</span>
      <button class="btn secondary small" data-fastighet="${esc(u.fastighetId || u.id)}">Fastighet</button>
      <button class="btn secondary small" data-pdf="${esc(u.id)}">PDF</button>
      <button class="btn small" data-open="${esc(u.id)}">Öppna</button>
      <button class="btn danger small" data-del="${esc(u.id)}">×</button>
    </div>
  </div>`;
}
