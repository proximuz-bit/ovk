// Drag-och-släpp: läs släppta filer/mappar och bygg relativa sökvägar
// (Kund/Objekt/fil.xls) så att samma kund/objekt-logik som mappimporten gäller.
import { $ } from "./ui.js";

const EXCEL_RE = /\.(xlsm|xlsx|xls)$/i;

export function wireDragDrop(onFiles) {
  const overlay = $("#drop-overlay");
  let niva = 0;
  const harFiler = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
  const visa = () => { niva++; overlay.hidden = false; };
  const dolj = () => { niva = 0; overlay.hidden = true; };
  window.addEventListener("dragenter", (e) => { if (!harFiler(e)) return; e.preventDefault(); visa(); });
  window.addEventListener("dragover", (e) => { if (harFiler(e)) e.preventDefault(); });
  window.addEventListener("dragleave", (e) => { if (!harFiler(e)) return; niva--; if (niva <= 0) dolj(); });
  window.addEventListener("drop", async (e) => {
    if (!harFiler(e)) return;
    e.preventDefault(); dolj();
    const poster = await lasDrop(e.dataTransfer);
    await onFiles(poster);
  });
}

export async function lasDrop(dt) {
  const poster = [];
  const entries = [];
  for (const it of (dt.items ? [...dt.items] : [])) {
    const en = it.webkitGetAsEntry && it.webkitGetAsEntry();
    if (en) entries.push(en);
  }
  if (entries.length) {
    for (const en of entries) await trava(en, "", poster);
  } else {
    for (const f of (dt.files || [])) { if (EXCEL_RE.test(f.name)) { f._rel = f.name; poster.push(f); } }
  }
  return poster;
}

async function trava(entry, prefix, poster) {
  if (entry.isFile) {
    const f = await new Promise((res, rej) => entry.file(res, rej)).catch(() => null);
    if (f && EXCEL_RE.test(f.name)) { f._rel = prefix + f.name; poster.push(f); }
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    let batch;
    do {
      batch = await new Promise((res, rej) => reader.readEntries(res, rej)).catch(() => []);
      for (const child of batch) await trava(child, prefix + entry.name + "/", poster);
    } while (batch.length);
  }
}
