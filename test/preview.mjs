// Runs widget/Pitboard.js outside iOS with a tiny Scriptable mock and
// renders the result to HTML, using local docs/api JSON instead of the web.
// Usage: node test/preview.mjs <out.html> <family> [param] [lang]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const [out, family = "medium", param = "", lang = "ru"] = process.argv.slice(2);
const SIZES = { small: [170, 170], medium: [364, 170], large: [364, 382] };

class Color { constructor(hex) { this.css = hex; } static white() { return new Color("#fff"); } }
class Size { constructor(w, h) { this.w = w; this.h = h; } }
const Font = {
  systemFont: s => ({ s, w: 400 }), boldSystemFont: s => ({ s, w: 700 }),
  boldMonospacedSystemFont: s => ({ s, w: 700, mono: true }),
};

class Stack {
  constructor(vertical = false) { this.kids = []; this.vertical = vertical; this.align = "flex-start"; }
  layoutVertically() { this.vertical = true; }
  centerAlignContent() { this.align = "center"; }
  addStack() { const s = new Stack(); s.parent = this; this.kids.push(s); return s; }
  get parentVertical() { return this.parent && this.parent.vertical; }
  addSpacer(n) { this.kids.push({ spacer: n ?? null }); }
  addText(v) { const t = { text: v, rightAlignText() {} }; this.kids.push(t); return t; }
  setPadding(...p) { this.pad = p; }
  html() {
    const css = [`display:flex`, `flex-direction:${this.vertical ? "column" : "row"}`, `align-items:${this.align}`];
    if (this.size) css.push(`width:${this.size.w}px`, `height:${this.size.h}px`, `flex:none`);
    else if (this.parentVertical) css.push("align-self:stretch");
    else if (this.kids.some(k => k.spacer === null)) css.push("flex:1");
    if (this.backgroundColor) css.push(`background:${this.backgroundColor.css}`);
    if (this.cornerRadius) css.push(`border-radius:${this.cornerRadius}px`);
    if (this.pad) css.push(`padding:${this.pad.map(x => x + "px").join(" ")}`, "box-sizing:border-box");
    const inner = this.kids.map(k => {
      if ("spacer" in k) return k.spacer === null ? `<div style="flex:1"></div>`
        : `<div style="flex:none;width:${k.spacer}px;height:${k.spacer}px"></div>`;
      if ("text" in k) {
        const f = k.font || Font.systemFont(12);
        return `<span style="font:${f.w} ${f.s}px ${f.mono ? "ui-monospace,Menlo" : "-apple-system,Helvetica"};color:${k.textColor?.css || "#fff"};white-space:pre">${k.text}</span>`;
      }
      return k.html();
    }).join("");
    return `<div style="${css.join(";")}">${inner}</div>`;
  }
}
class ListWidget extends Stack {
  constructor() { super(true); }
  async presentSmall() {} async presentMedium() {} async presentLarge() {}
}

class Request {
  constructor(url) { this.url = url; this.response = { statusCode: 200 }; }
  async loadJSON() {
    const rel = this.url.split("/api/")[1];
    const file = path.join(root, "docs/api", rel);
    if (!fs.existsSync(file)) { this.response.statusCode = 404; return {}; }
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
}
const mem = {};
const FileManager = { local: () => ({
  cacheDirectory: () => "/c", joinPath: (a, b) => `${a}/${b}`, fileExists: p => p in mem || p === "/c/pitboard",
  createDirectory() {}, writeString: (p, s) => { mem[p] = s; }, readString: p => mem[p],
}) };

let result;
Object.assign(globalThis, {
  Color, Size, Font, ListWidget, Request, FileManager,
  Device: { language: () => lang },
  args: { widgetParameter: param },
  config: { widgetFamily: family, runsInWidget: true },
  Script: { setWidget: w => { result = w; }, complete() {} },
});

const src = fs.readFileSync(path.join(root, "widget/Pitboard.js"), "utf8");
const AsyncFunction = (async () => {}).constructor;
await new AsyncFunction(src)();

const [w, h] = SIZES[family];
result.backgroundColor ??= new Color("#000");
fs.writeFileSync(out, `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#2b2b2b;padding:0;width:${w + 40}px;height:${w + 40}px;display:flex;align-items:center;justify-content:center">
<div style="width:${w}px;height:${h}px;border-radius:22px;overflow:hidden;display:flex">
${result.html().replace('style="', 'style="width:100%;height:100%;')}</div></body>`);
console.log("ok", out);
