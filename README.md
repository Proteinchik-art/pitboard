# Pitboard

Free iPhone home-screen widgets with season and career stats for open-wheel racing fans. No subscription, no ads, no account.

> Unofficial fan project. Not affiliated with, endorsed by or connected to Formula 1, the FIA or any team. All names are used only to identify drivers and teams.

## Widgets

| Parameter | Widget |
|---|---|
| *(empty)* | Championship top 5 (small: top 4, large: top 10) + countdown to the next session |
| `hamilton`, `max_verstappen`, `senna`, … | A driver's current season and whole career: titles, wins, podiums, poles, starts |

Full list of driver ids: [`docs/api/drivers.json`](docs/api/drivers.json).

## Install (2 minutes)

1. Install the free app [Scriptable](https://apps.apple.com/app/scriptable/id1405459188).
2. In Scriptable tap **+**, paste the contents of [`widget/Pitboard.js`](widget/Pitboard.js) and name the script `Pitboard`.
3. Long-press the home screen → **+** → Scriptable → choose a size → **Add Widget**.
4. Long-press the widget → **Edit Widget** → Script: `Pitboard`, Parameter: empty for standings or a driver id.

The widget refreshes about once an hour and keeps the last data when you are offline. The interface is in Russian if your iPhone is in Russian, otherwise in English.

## How it works

`build.py` collects results from [Jolpica](https://github.com/jolpica/jolpica-f1) (the Ergast-compatible F1 database) and the event schedule from [FastF1](https://github.com/theOehrly/Fast-F1), computes the stats and writes static JSON to `docs/api/`. GitHub Actions runs it on race weekends and GitHub Pages serves the files, so the project costs nothing to run.

Pole counts follow the official record: in 2021–22 sprint weekends the pole went to the sprint winner, and before qualifying data exists (mid-90s) the pole is taken from the starting grid. For drivers from the 1950s–90s a few numbers can differ from the official record by 1–2 (shared cars, deleted qualifying times, incomplete old data).

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python build.py              # current grid + legends
.venv/bin/python build.py hamilton     # just some drivers
node test/preview.mjs out.html medium hamilton   # render a widget preview
```
