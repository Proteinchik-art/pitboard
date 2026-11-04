// Pitboard — free season stats widget for Scriptable (iOS).
// Unofficial fan project, not affiliated with Formula 1 or the FIA.
//
// Widget parameter:
//   (empty)          → championship top 5 (+ next session)
//   hamilton         → that driver's season + career stats
// Driver ids: see BASE + "drivers.json".

const BASE = "https://proteinchik-art.github.io/pitboard/api/";

const TEAM_COLORS = {
  "Mercedes": "#27F4D2", "Red Bull": "#3671C6", "Ferrari": "#E8002D",
  "McLaren": "#FF8000", "Aston Martin": "#229971", "Alpine F1 Team": "#FF87BC",
  "Williams": "#64C4FF", "RB F1 Team": "#6692FF", "Sauber": "#52E252",
  "Haas F1 Team": "#B6BABD", "Audi": "#F50537", "Cadillac F1 Team": "#C9A15A",
};

const RU = Device.language().startsWith("ru");
const T = RU ? {
  standings: "Чемпионат", after: "после этапа", season: "Сезон", career: "Карьера",
  pts: "очк.", wins: "Победы", podiums: "Подиумы", poles: "Поулы", starts: "Старты",
  titles: "Титулы", next: "Дальше", in: "через", d: "д", h: "ч", m: "мин", now: "идёт",
  offline: "нет сети — старые данные", retired: "завершил карьеру", unknown: "Нет такого пилота",
} : {
  standings: "Championship", after: "after round", season: "Season", career: "Career",
  pts: "pts", wins: "Wins", podiums: "Podiums", poles: "Poles", starts: "Starts",
  titles: "Titles", next: "Next", in: "in", d: "d", h: "h", m: "m", now: "live",
  offline: "offline — cached data", retired: "retired", unknown: "Unknown driver",
};

const SESSION_RU = {
  "Practice 1": "Практика 1", "Practice 2": "Практика 2", "Practice 3": "Практика 3",
  "Qualifying": "Квалификация", "Sprint Qualifying": "Спринт-квал.", "Sprint Shootout": "Спринт-квал.",
  "Sprint": "Спринт", "Race": "Гонка",
};
const sessionName = n => (RU && SESSION_RU[n]) || n;

const BG = new Color("#15151E");
const DIM = new Color("#9A9AA5");
const WHITE = Color.white();
const ACCENT = new Color("#E10600");

const fm = FileManager.local();
const cacheDir = fm.joinPath(fm.cacheDirectory(), "pitboard");
if (!fm.fileExists(cacheDir)) fm.createDirectory(cacheDir);
let offline = false;

async function load(path) {
  const file = fm.joinPath(cacheDir, path.replace(/\//g, "_"));
  try {
    const req = new Request(BASE + path);
    req.timeoutInterval = 10;
    const data = await req.loadJSON();
    if (req.response.statusCode !== 200) throw new Error("HTTP " + req.response.statusCode);
    fm.writeString(file, JSON.stringify(data));
    return data;
  } catch (e) {
    if (fm.fileExists(file)) { offline = true; return JSON.parse(fm.readString(file)); }
    return null;
  }
}

function teamColor(team) { return new Color(TEAM_COLORS[team] || "#888888"); }

function text(stack, value, size, color = WHITE, weight = "regular") {
  const t = stack.addText(String(value));
  t.font = weight === "bold" ? Font.boldSystemFont(size)
    : weight === "mono" ? Font.boldMonospacedSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  return t;
}

function countdown(iso) {
  const ms = new Date(iso) - new Date();
  if (ms <= 0) return T.now;
  const min = Math.floor(ms / 60000);
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  if (d > 0) return `${T.in} ${d}${T.d} ${h}${T.h}`;
  if (h > 0) return `${T.in} ${h}${T.h} ${m}${T.m}`;
  return `${T.in} ${m}${T.m}`;
}

function nextSession(next) {
  if (!next || !next.event) return null;
  const now = new Date();
  const s = next.event.sessions.find(x => new Date(x.utc) > new Date(now - 2 * 3600e3));
  return s ? { event: next.event, session: s } : null;
}

function footer(w, next) {
  const ns = nextSession(next);
  w.addSpacer();
  const row = w.addStack();
  row.centerAlignContent();
  if (ns) {
    text(row, `${T.next}: ${ns.event.country} · ${sessionName(ns.session.name)}`, 10, DIM);
    row.addSpacer();
    text(row, countdown(ns.session.utc), 10, ACCENT, "bold");
  }
  if (offline) { row.addSpacer(); text(row, "⚠︎", 10, DIM); }
}

async function standingsWidget(family) {
  const [st, next] = await Promise.all([load("standings.json"), load("next.json")]);
  const w = new ListWidget();
  w.backgroundColor = BG;
  w.setPadding(12, 14, 10, 14);
  if (!st) { text(w, T.offline, 12, DIM); return w; }

  const head = w.addStack();
  head.centerAlignContent();
  text(head, `${T.standings} ${st.season}`, family === "small" ? 12 : 13, WHITE, "bold");
  head.addSpacer();
  if (family !== "small") text(head, `${T.after} ${st.round}`, 10, DIM);
  w.addSpacer(6);

  const n = family === "small" ? 4 : family === "large" ? 10 : 5;
  for (const d of st.drivers.slice(0, n)) {
    const row = w.addStack();
    row.centerAlignContent();
    text(row, String(d.pos).padStart(2, " "), 12, DIM, "mono");
    row.addSpacer(6);
    const bar = row.addStack();
    bar.size = new Size(3, 12);
    bar.backgroundColor = teamColor(d.team);
    bar.cornerRadius = 1.5;
    row.addSpacer(6);
    text(row, family === "small" ? d.code : d.name, 12, WHITE, "bold");
    row.addSpacer();
    text(row, d.points, 12, WHITE, "mono");
    if (family !== "small") {
      row.addSpacer(8);
      const gap = text(row, d.gap ? `−${d.gap}` : "", 10, DIM);
      gap.rightAlignText();
    }
    w.addSpacer(3);
  }
  if (family !== "small") footer(w, next);
  w.refreshAfterDate = new Date(Date.now() + 3600e3);
  return w;
}

function statBlock(stack, label, value, color = WHITE) {
  const s = stack.addStack();
  s.layoutVertically();
  text(s, value, 15, color, "bold");
  text(s, label, 9, DIM);
}

async function driverWidget(id, family) {
  const [d, next] = await Promise.all([load(`drivers/${id}.json`), load("next.json")]);
  const w = new ListWidget();
  w.backgroundColor = BG;
  w.setPadding(12, 14, 10, 14);
  if (!d) { text(w, `${T.unknown}: ${id}`, 12, DIM); return w; }

  const color = d.team ? teamColor(d.team) : DIM;
  const head = w.addStack();
  head.centerAlignContent();
  const bar = head.addStack();
  bar.size = new Size(4, 26);
  bar.backgroundColor = color;
  bar.cornerRadius = 2;
  head.addSpacer(8);
  const names = head.addStack();
  names.layoutVertically();
  text(names, d.last_name, 15, WHITE, "bold");
  text(names, d.active ? d.team : `${d.career.first_season}–${d.career.last_season} · ${T.retired}`, 10, DIM);
  head.addSpacer();
  if (d.number) text(head, d.number, 20, color, "bold");
  w.addSpacer(8);

  const c = d.career, s = d.season;
  if (family === "small") {
    if (s) text(w, `P${s.position} · ${s.points} ${T.pts}`, 13, WHITE, "bold");
    text(w, `${T.titles} ${c.titles} · ${T.wins} ${c.wins}`, 11, DIM);
    text(w, `${T.podiums} ${c.podiums} · ${T.poles} ${c.poles}`, 11, DIM);
  } else {
    if (s) {
      text(w, `${T.season} ${s.year}`, 10, DIM);
      const r1 = w.addStack();
      statBlock(r1, T.pts, `P${s.position} · ${s.points}`, color); r1.addSpacer();
      statBlock(r1, T.wins, s.wins); r1.addSpacer();
      statBlock(r1, T.podiums, s.podiums); r1.addSpacer();
      statBlock(r1, T.poles, s.poles);
      w.addSpacer(6);
    }
    text(w, T.career, 10, DIM);
    const r2 = w.addStack();
    statBlock(r2, T.titles, c.titles, c.titles ? ACCENT : WHITE); r2.addSpacer();
    statBlock(r2, T.wins, c.wins); r2.addSpacer();
    statBlock(r2, T.podiums, c.podiums); r2.addSpacer();
    statBlock(r2, T.poles, c.poles); r2.addSpacer();
    statBlock(r2, T.starts, c.starts);
    if (family === "large" && s && s.last_results.length) {
      w.addSpacer(10);
      for (const r of s.last_results.slice().reverse()) {
        const row = w.addStack();
        text(row, r.race, 11, DIM);
        row.addSpacer();
        text(row, /^\d+$/.test(r.pos) ? `P${r.pos}` : r.pos === "R" ? "DNF" : r.pos, 11, WHITE, "mono");
      }
    }
    if (d.active) footer(w, next);
  }
  w.refreshAfterDate = new Date(Date.now() + 3600e3);
  return w;
}

const param = (args.widgetParameter || "").trim().toLowerCase();
const family = config.widgetFamily || "medium";
const widget = param ? await driverWidget(param, family) : await standingsWidget(family);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  family === "small" ? await widget.presentSmall()
    : family === "large" ? await widget.presentLarge() : await widget.presentMedium();
}
Script.complete();
