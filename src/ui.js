// Små UI-hjälpare. Rendering sker som HTML-strängar + delegerade händelser.
export function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
export function el(htmlStr) {
  const t = document.createElement("template");
  t.innerHTML = htmlStr.trim();
  return t.content.firstElementChild;
}
export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

let toastTimer = null;
export function toast(msg, ms = 2200) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
export function confirmAction(msg) { return window.confirm(msg); }

export function option(value, label, selected) {
  return `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`;
}
export function options(list, selected, { valueKey = null, labelKey = null } = {}) {
  return list.map((o) => {
    if (typeof o === "string") return option(o, o, o === selected);
    const v = valueKey ? o[valueKey] : o.v;
    const l = labelKey ? o[labelKey] : o.label;
    return option(v, l, v === selected);
  }).join("");
}
export function field(label, name, value, opts = {}) {
  const { type = "text", placeholder = "", extra = "", hint = "", step = "" } = opts;
  return `<div class="field"><label>${esc(label)}</label>
    <input type="${type}" name="${esc(name)}" value="${esc(value ?? "")}" placeholder="${esc(placeholder)}" ${step ? `step="${step}"` : ""} ${extra} autocomplete="off">
    ${hint ? `<div class="hint">${esc(hint)}</div>` : ""}</div>`;
}
export function textarea(label, name, value, placeholder = "") {
  return `<div class="field"><label>${esc(label)}</label>
    <textarea name="${esc(name)}" placeholder="${esc(placeholder)}">${esc(value ?? "")}</textarea></div>`;
}
export function select(label, name, value, list, opts = {}) {
  return `<div class="field"><label>${esc(label)}</label>
    <select name="${esc(name)}">${options(list, value, opts)}</select></div>`;
}
// Läs formulärvärden till ett platt objekt utifrån name-attribut.
export function readForm(root) {
  const out = {};
  $$("[name]", root).forEach((f) => {
    out[f.name] = f.type === "checkbox" ? f.checked : f.value;
  });
  return out;
}
export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
