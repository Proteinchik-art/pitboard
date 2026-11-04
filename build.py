"""Build static JSON for the Pitboard widgets.

Sources: Jolpica (Ergast-compatible) for results/standings, FastF1 for the
event schedule. Output goes to docs/api/ so GitHub Pages can serve it.

Usage:  .venv/bin/python build.py            # current grid + legends
        .venv/bin/python build.py hamilton   # only some drivers
"""
import json
import sys
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path

import requests

warnings.filterwarnings("ignore")

BASE = "https://api.jolpi.ca/ergast/f1"
ROOT = Path(__file__).parent
CACHE = ROOT / ".cache"
OUT = ROOT / "docs" / "api"
LEGENDS = [
    "michael_schumacher", "senna", "prost", "lauda", "vettel", "raikkonen",
    "hakkinen", "button", "rosberg", "mansell", "piquet", "clark", "fangio",
]
# Qualifying P1 that the official pole record does not count
# (excluded from qualifying after the session).
NOT_POLES = {(2012, 5, "hamilton")}
NON_STARTS = {"Withdrew", "Did not start", "Did not qualify", "Did not prequalify"}

session = requests.Session()
session.headers["User-Agent"] = "pitboard-widgets (personal project)"
_last_call = 0.0


def get(path, final=False):
    """GET one Jolpica page. final=True caches forever (past seasons);
    otherwise the cache lives 6 hours."""
    global _last_call
    CACHE.mkdir(exist_ok=True)
    key = CACHE / (path.replace("/", "_").replace("?", "_").replace("&", "_") + ".json")
    if key.exists() and (final or time.time() - key.stat().st_mtime < 6 * 3600):
        return json.loads(key.read_text())["MRData"]
    for attempt in range(5):
        wait = 0.3 - (time.time() - _last_call)  # Jolpica allows ~4 req/s
        if wait > 0:
            time.sleep(wait)
        _last_call = time.time()
        r = session.get(f"{BASE}/{path}", timeout=30)
        if r.status_code == 429:
            time.sleep(10 * (attempt + 1))
            continue
        r.raise_for_status()
        key.write_text(r.text)
        return r.json()["MRData"]
    raise RuntimeError(f"rate limited: {path}")


def get_all(path, table, items, final=False):
    """Follow Jolpica pagination (max 100 per page)."""
    out, offset = [], 0
    while True:
        sep = "&" if "?" in path else "?"
        data = get(f"{path}{sep}limit=100&offset={offset}", final)
        out += data[table][items]
        offset += 100
        if offset >= int(data["total"]):
            return out


def champions(current_season):
    titles = {}
    for year in range(1950, current_season):
        lists = get(f"{year}/driverstandings/1.json", final=True)["StandingsTable"]["StandingsLists"]
        if lists:
            champ = lists[0]["DriverStandings"][0]["Driver"]["driverId"]
            titles.setdefault(champ, []).append(year)
    return titles


def sprint_era_poles():
    """In 2021-22 the pole was credited to the sprint winner, not to P1 in
    Friday qualifying. Returns {(season, round): winner_id}."""
    out = {}
    for year in (2021, 2022):
        for race in get_all(f"{year}/sprint.json", "RaceTable", "Races", final=True):
            for res in race["SprintResults"]:
                if res["position"] == "1":
                    out[(year, int(race["round"]))] = res["Driver"]["driverId"]
    return out


def is_finish(status):
    return status == "Finished" or status.startswith("+")


def driver_stats(driver_id, season, titles, standings_by_id, sprint_poles):
    info = get(f"drivers/{driver_id}.json", final=True)["DriverTable"]["Drivers"][0]
    races = get_all(f"drivers/{driver_id}/results.json", "RaceTable", "Races")
    quali = get_all(f"drivers/{driver_id}/qualifying.json", "RaceTable", "Races")
    sprints = get_all(f"drivers/{driver_id}/sprint.json", "RaceTable", "Races")

    results = [(int(r["season"]), r, r["Results"][0]) for r in races
               if r["Results"][0]["status"] not in NON_STARTS]
    # Jolpica's /qualifying/1 filter is unreliable, so count P1 ourselves
    poles = []
    for q in quali:
        key = (int(q["season"]), int(q["round"]))
        if key in sprint_poles:
            continue
        if q["QualifyingResults"][0]["position"] == "1" and key + (driver_id,) not in NOT_POLES:
            poles.append(key[0])
    poles += [y for (y, _), winner in sprint_poles.items() if winner == driver_id]
    # Qualifying data only goes back to the mid-90s; before that the grid
    # was set by qualifying, so P1 on the grid is the pole.
    have_quali = {(int(q["season"]), int(q["round"])) for q in quali}
    poles += [y for y, r, x in results
              if (y, int(r["round"])) not in have_quali and x["grid"] == "1"]
    sprint_pts = {}
    for s in sprints:
        y = int(s["season"])
        sprint_pts[y] = sprint_pts.get(y, 0) + float(s["SprintResults"][0]["points"])

    def summary(rows, pole_years, extra_points):
        pos = [int(x["position"]) for _, _, x in rows if is_finish(x["status"]) or x["positionText"].isdigit()]
        return {
            "starts": len(rows),
            "wins": sum(1 for _, _, x in rows if x["position"] == "1"),
            "podiums": sum(1 for _, _, x in rows if x["position"] in ("1", "2", "3")),
            "poles": len(pole_years),
            "points": round(sum(float(x["points"]) for _, _, x in rows) + extra_points, 1),
            "best_finish": min(pos) if pos else None,
        }

    career = summary(results, poles, sum(sprint_pts.values()))
    seasons = sorted({y for y, _, _ in results})
    career.update({
        "titles": len(titles.get(driver_id, [])),
        "title_years": titles.get(driver_id, []),
        "seasons": len(seasons),
        "first_season": seasons[0] if seasons else None,
        "last_season": seasons[-1] if seasons else None,
    })

    out = {
        "id": driver_id,
        "code": info.get("code"),
        "number": info.get("permanentNumber"),
        "first_name": info["givenName"],
        "last_name": info["familyName"],
        "nationality": info["nationality"],
        "birth_date": info.get("dateOfBirth"),
        "active": driver_id in standings_by_id,
        "career": career,
        "season": None,
    }

    if driver_id in standings_by_id:
        st = standings_by_id[driver_id]
        cur = [row for row in results if row[0] == season]
        s = summary(cur, [y for y in poles if y == season], sprint_pts.get(season, 0))
        s.update({
            "year": season,
            "position": int(st["position"]),
            "points": float(st["points"]),  # official total incl. sprints
            "team": st["Constructors"][-1]["name"],
            "last_results": [
                {"round": int(r["round"]), "race": r["raceName"].replace(" Grand Prix", ""),
                 "pos": x["positionText"], "grid": int(x["grid"])}
                for _, r, x in cur[-5:]
            ],
        })
        out["season"] = s
        out["team"] = s["team"]
    return out


def next_event(season):
    """Next race weekend from the FastF1 schedule (all session times in UTC)."""
    import fastf1
    fastf1.set_log_level("ERROR")
    sched = fastf1.get_event_schedule(season, include_testing=False)
    now = datetime.now(timezone.utc)
    for _, ev in sched.iterrows():
        sessions = []
        for i in range(1, 6):
            name, t = ev.get(f"Session{i}"), ev.get(f"Session{i}DateUtc")
            if name and t is not None and str(t) != "NaT":
                sessions.append({"name": name, "utc": t.tz_localize("UTC").isoformat()})
        if sessions and datetime.fromisoformat(sessions[-1]["utc"]) > now:
            return {"round": int(ev["RoundNumber"]), "name": ev["EventName"],
                    "country": ev["Country"], "location": ev["Location"], "sessions": sessions}
    return None


def write(name, data):
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))


def main():
    st = get("current/driverstandings.json")["StandingsTable"]
    season = int(st["season"])
    lst = st["StandingsLists"][0]
    standings_by_id = {d["Driver"]["driverId"]: d for d in lst["DriverStandings"]}
    built_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

    leader = float(lst["DriverStandings"][0]["points"])
    write("standings.json", {
        "season": season, "round": int(lst["round"]),
        "drivers": [{
            "pos": int(d["position"]), "id": d["Driver"]["driverId"],
            "code": d["Driver"].get("code"), "name": d["Driver"]["familyName"],
            "team": d["Constructors"][-1]["name"], "points": float(d["points"]),
            "wins": int(d["wins"]), "gap": round(leader - float(d["points"]), 1),
        } for d in lst["DriverStandings"]],
    })

    write("next.json", {"event": next_event(season)})
    write("meta.json", {"built_at": built_at, "season": season, "round": int(lst["round"])})

    titles = champions(season)
    sprint_poles = sprint_era_poles()
    ids = sys.argv[1:] or list(standings_by_id) + LEGENDS
    index = []
    for i, did in enumerate(ids, 1):
        print(f"[{i}/{len(ids)}] {did}", flush=True)
        try:
            d = driver_stats(did, season, titles, standings_by_id, sprint_poles)
        except (IndexError, KeyError) as exc:
            print(f"  skipped {did}: no data ({exc!r})", flush=True)
            continue
        write(f"drivers/{did}.json", d)
        index.append({"id": did, "name": f"{d['first_name']} {d['last_name']}", "active": d["active"]})
    if not sys.argv[1:]:
        write("drivers.json", sorted(index, key=lambda x: (not x["active"], x["name"])))


if __name__ == "__main__":
    main()
