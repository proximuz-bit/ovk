import * as db from "./db.js";
import { DEFAULT_SETTINGS } from "./model.js";
import { $, $$, toast } from "./ui.js";
import * as dashboard from "./views/dashboard.js";
import * as uppdragView from "./views/uppdrag.js";
import * as fastigheter from "./views/fastigheter.js";
import * as installningar from "./views/installningar.js";

export const state = {
  settings: null,
  async loadSettings() {
    let s = await db.getMeta("settings");
    if (!s) { s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); await db.setMeta("settings", s); }
    if (!s.tolerans) s.tolerans = { gron: 10, gul: 20 };
    state.settings = s;
    window.__ovkSettings = s;
    $("#brand-sub").textContent = s.foretag?.namn || "Ventilation & mätteknik";
    return s;
  },
};

const routes = [
  { re: /^\/$/, view: dashboard.renderDashboard },
  { re: /^\/nytt$/, view: uppdragView.renderNytt },
  { re: /^\/fastigheter$/, view: fastigheter.renderLista },
  { re: /^\/fastighet\/(.+)$/, view: fastigheter.renderDetalj },
  { re: /^\/uppdrag\/(.+)$/, view: uppdragView.renderUppdrag },
  { re: /^\/installningar$/, view: installningar.render },
];

function currentPath() {
  const h = location.hash.replace(/^#/, "");
  return h || "/";
}

async function navigate() {
  const path = currentPath();
  setActiveNav(path);
  const main = $("#main");
  main.innerHTML = `<div class="ul-empty">Laddar…</div>`;
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      try {
        await r.view(main, ...m.slice(1).map(decodeURIComponent));
      } catch (err) {
        console.error(err);
        main.innerHTML = `<div class="card"><h1>Något gick fel</h1><pre>${String(err.message || err)}</pre></div>`;
      }
      window.scrollTo(0, 0);
      return;
    }
  }
  main.innerHTML = `<div class="card"><h1>Sidan finns inte</h1><p class="sub">Gå till <a href="#/">översikten</a>.</p></div>`;
}

function setActiveNav(path) {
  $$("#nav a").forEach((a) => {
    const route = a.dataset.route;
    const active = route === "/" ? path === "/" : path.startsWith(route);
    a.classList.toggle("active", active);
  });
}

function wireChrome() {
  $("#btn-export").addEventListener("click", async () => {
    const data = await db.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ovk-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Backup nedladdad");
  });
  $("#btn-import").addEventListener("click", () => $("#file-import").click());
  $("#file-import").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      await db.importAll(data, { merge: true });
      toast("Data importerad");
      navigate();
    } catch (err) {
      toast("Kunde inte läsa filen: " + err.message);
    }
    e.target.value = "";
  });
}

async function boot() {
  wireChrome();
  await state.loadSettings();
  window.addEventListener("hashchange", navigate);
  navigate();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

boot();
