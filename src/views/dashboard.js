import * as db from "../db.js";
import { uppdragSummary } from "../model.js";
import { esc, $, $$, toast, confirmAction, option } from "../ui.js";
import { skapaKund, kundNamn, settForvaldKund } from "../kunder.js";

// Vilken kundflik som visas just nu (null = välj automatiskt). "" = utan kund, "__alla__" = alla.
let aktivKund = null;

export async function renderDashboard(main) {
  const [uppdragAlla, kunder] = await Promise.all([db.getAll("uppdrag"), db.getAll("kunder")]);
  uppdragAlla.sort((a, b) => (b.besiktningsdatum || "").localeCompare(a.besiktningsdatum || ""));
  const kunderSorterade = kunder.slice().sort((a, b) => a.namn.localeCompare(b.namn, "sv"));

  const rows = uppdragAlla.map((u) => ({ u, s: uppdragSummary(u) }))
    .sort((a, b) => (a.s.nastaDatum || "9999").localeCompare(b.s.nastaDatum || "9999"));

  const forsenade = uppdragAlla.filter((u) => uppdragSummary(u).deadline.key === "over").length;
  const snart = uppdragAlla.filter((u) => uppdragSummary(u).deadline.key === "snart").length;
  const totaltSystem = uppdragAlla.reduce((n, u) => n + (u.system?.length || 0), 0);
  const fastigheter = new Set(uppdragAlla.map((u) => u.byggnad?.fastighetsbeteckning).filter(Boolean)).size;

  // Kunder som faktiskt har uppdrag, plus "Utan kund" och "Alla".
  const anvanda = kunder.filter((k) => uppdragAlla.some((u) => u.kundId === k.id))
    .sort((a, b) => a.namn.localeCompare(b.namn, "sv"));
  const harUtan = uppdragAlla.some((u) => !u.kundId);
  const flikar = [
    ...anvanda.map((k) => ({ id: k.id, namn: k.namn })),
    ...(harUtan ? [{ id: "", namn: "Utan kund" }] : []),
    { id: "__alla__", namn: "Alla" },
  ];
  if (aktivKund !== null && !flikar.some((f) => f.id === aktivKund)) aktivKund = null;
  const valdId = aktivKund !== null ? aktivKund : (anvanda[0] ? anvanda[0].id : (harUtan ? "" : "__alla__"));

  const valda = valdId === "__alla__" ? rows : rows.filter((r) => (r.u.kundId || "") === valdId);
  const valdNamn = valdId === "__alla__" ? "Alla uppdrag" : kundNamn(kunder, valdId);

  main.innerHTML = `
    <div class="page-head">
      <div><h1>Översikt</h1><div class="sub">Besiktningsuppdrag och kommande kontroller per kund</div></div>
      <div class="btn-row">
        <button class="btn secondary" id="ny-kund">+ Ny kund</button>
        <a class="btn" id="ny-uppdrag" href="#/nytt">+ Nytt uppdrag</a>
      </div>
    </div>
    <div class="stat-grid" style="margin-bottom:18px">
      <div class="stat"><div class="n">${uppdragAlla.length}</div><div class="l">Uppdrag</div></div>
      <div class="stat"><div class="n">${anvanda.length}</div><div class="l">Kunder</div></div>
      <div class="stat"><div class="n">${fastigheter}</div><div class="l">Fastigheter</div></div>
      <div class="stat"><div class="n">${totaltSystem}</div><div class="l">System</div></div>
      <div class="stat"><div class="n" style="color:var(--warn)">${snart}</div><div class="l">Inom 90 dagar</div></div>
      <div class="stat"><div class="n" style="color:var(--bad)">${forsenade}</div><div class="l">Försenade</div></div>
    </div>
    ${flikar.length > 1 ? `<div class="tabs kund-tabs" style="overflow-x:auto;flex-wrap:nowrap;margin-bottom:14px">
      ${flikar.map((f) => `<button data-kundtab="${esc(f.id)}" class="${valdId === f.id ? "active" : ""}" style="white-space:nowrap">
        ${esc(f.namn)} <span class="pill" style="margin-left:4px">${kundAntal(uppdragAlla, f.id)}</span>
      </button>`).join("")}
    </div>` : ""}
    <h2>${esc(valdNamn)} · kommande &amp; aktuella kontroller</h2>
    <div id="list">${valda.length ? valda.map((r) => listItem(r, kunderSorterade)).join("")
      : `<div class="card ul-empty">Inga uppdrag för denna kund. <a href="#/nytt">Skapa ett uppdrag</a> eller flytta ett befintligt via kundväljaren.</div>`}</div>
  `;

  $$("[data-open]", main).forEach((b) => b.addEventListener("click", () => { location.hash = `#/uppdrag/${b.dataset.open}`; }));
  $$("[data-fastighet]", main).forEach((b) => b.addEventListener("click", () => { location.hash = `#/fastighet/${b.dataset.fastighet}`; }));
  $$("[data-kundtab]", main).forEach((b) => b.addEventListener("click", () => { aktivKund = b.dataset.kundtab; renderDashboard(main); }));
  $("#ny-uppdrag", main)?.addEventListener("click", () => {
    settForvaldKund(valdId === "__alla__" ? "" : valdId);
  });
  $("#ny-kund", main)?.addEventListener("click", async () => {
    const namn = window.prompt("Namn på ny kund:");
    if (!namn || !namn.trim()) return;
    const k = await skapaKund(namn.trim());
    if (k) aktivKund = k.id;
    toast("Kund skapad");
    renderDashboard(main);
  });
  $$("[data-kundsel]", main).forEach((sel) => sel.addEventListener("change", async () => {
    const u = uppdragAlla.find((x) => x.id === sel.dataset.kundsel);
    if (!u) return;
    let v = sel.value;
    if (v === "__ny__") {
      const namn = window.prompt("Namn på ny kund:");
      if (!namn || !namn.trim()) { sel.value = u.kundId || ""; return; }
      const k = await skapaKund(namn.trim());
      v = k ? k.id : "";
    }
    u.kundId = v || "";
    await db.put("uppdrag", u);
    toast("Uppdraget flyttat till " + kundNamn(await db.getAll("kunder"), u.kundId));
    renderDashboard(main);
  }));
  $$("[data-del]", main).forEach((b) => b.addEventListener("click", async () => {
    if (!confirmAction("Ta bort uppdraget? Detta går inte att ångra.")) return;
    await db.del("uppdrag", b.dataset.del);
    toast("Uppdraget borttaget");
    renderDashboard(main);
  }));
  $$("[data-pdf]", main).forEach((b) => b.addEventListener("click", async () => {
    const { genereraPDF } = await import("../pdf.js");
    const u = uppdragAlla.find((x) => x.id === b.dataset.pdf);
    await genereraPDF(u, { settings: (await db.getMeta("settings")), db });
  }));
}

function kundAntal(uppdrag, id) {
  return id === "__alla__" ? uppdrag.length : uppdrag.filter((u) => (u.kundId || "") === id).length;
}

function listItem({ u, s }, allaKunder) {
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
      <select class="kund-sel" data-kundsel="${esc(u.id)}" title="Byt kund">
        ${option("", "— Utan kund —", !u.kundId)}
        ${allaKunder.map((k) => option(k.id, k.namn, u.kundId === k.id)).join("")}
        ${option("__ny__", "＋ Ny kund…", false)}
      </select>
      <button class="btn secondary small" data-fastighet="${esc(u.fastighetId || u.id)}">Fastighet</button>
      <button class="btn secondary small" data-pdf="${esc(u.id)}">PDF</button>
      <button class="btn small" data-open="${esc(u.id)}">Öppna</button>
      <button class="btn danger small" data-del="${esc(u.id)}">×</button>
    </div>
  </div>`;
}
