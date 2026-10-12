import * as db from "../db.js";
import { state } from "../app.js";
import { esc, $, $$, toast, field, option } from "../ui.js";
import { setMeta } from "../db.js";

export async function render(main) {
  const s = state.settings;
  const bm = s.besiktningsman, f = s.foretag, tol = s.tolerans;
  main.innerHTML = `
    <div class="page-head"><div><h1>Inställningar</h1><div class="sub">Företags- och besiktningsmansuppgifter, mätinstrument och toleranser</div></div></div>

    <div class="card">
      <h3>Besiktningsman (förval)</h3>
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
        ${field("Certifikat giltigt t.o.m.", "bm.certGiltigTom", bm.certGiltigTom, { type: "date" })}
      </div>
    </div>

    <div class="card">
      <h3>Företag</h3>
      <div class="row">
        ${field("Företagsnamn", "f.namn", f.namn)}
        ${field("Postadress", "f.postadress", f.postadress)}
        ${field("Postnr", "f.postnr", f.postnr)}
        ${field("Ort", "f.ort", f.ort)}
      </div>
    </div>

    <div class="card">
      <h3>Toleranser luftflöde (avvikelse mot proj.)</h3>
      <div class="row">
        ${field("Grön t.o.m. (%)", "tol.gron", tol.gron, { type: "number" })}
        ${field("Gul t.o.m. (%)", "tol.gul", tol.gul, { type: "number" })}
      </div>
    </div>

    <div class="card">
      <h3>Mätinstrument</h3>
      ${(s.matinstrument || []).map((m) => `<div class="row" style="margin-bottom:8px">
        <div class="field" style="flex:1"><label>Instrument</label><input data-instr-namn="${m.nr}" value="${esc(m.namn)}"></div>
        <div class="field" style="max-width:180px"><label>Nr</label><input value="${esc(m.nr)}" readonly></div>
      </div>`).join("")}
    </div>

    <div class="btn-row"><button class="btn" id="save">Spara inställningar</button></div>
  `;

  const gather = (root) => {
    const map = { bm: "besiktningsman", b: "besiktningsman", f: "foretag", tol: "tolerans" };
    $$("[name]", root).forEach((el) => {
      const [p, k] = el.name.split(".");
      const target = s[map[p] || p];
      if (target) target[k] = el.value;
    });
    $$("[data-instr-namn]", root).forEach((el) => {
      const inst = s.matinstrument.find((m) => m.nr === el.dataset.instrNamn);
      if (inst) inst.namn = el.value;
    });
    s.tolerans = { gron: Number(s.tolerans.gron) || 10, gul: Number(s.tolerans.gul) || 20 };
  };

  $("#save", main).addEventListener("click", async () => {
    gather(main);
    await setMeta("settings", s);
    window.__ovkSettings = s;
    $("#brand-sub").textContent = s.foretag?.namn || "Ventilation & mätteknik";
    toast("Inställningar sparade");
  });
}
