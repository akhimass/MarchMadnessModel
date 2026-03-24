# Scoreboard: how teams & rounds are matched

This doc explains the **men’s** live scoreboard path (`/scoreboard` → `GET /api/scoreboard/live` → UI). Women’s uses the same feed but **no** Kaggle/`teams2026` model mapping.

---

## 1) Live feed → `LiveGame`

1. Frontend calls `fetchScoreboard(gender, date)` → FastAPI `GET /api/scoreboard/live?gender=M&dates=YYYYMMDD`.
2. Primary source: **NCAA** `data.ncaa.com` JSON; fallback: **henrygd/ncaa-api**; last resort: **cache** from `data/cache/results_*.json`.
3. Each team row includes:
   - `name` (short / display from NCAA),
   - `abbreviation` (NCAA **`char6`** — not the same as our bracket abbr),
   - `seed` (when present),
   - `kaggleId` when the backend resolves a men’s bracket **TeamID** (see §2).

---

## 2) Backend: ESPN/NCAA → bracket TeamID (`kaggleId`)

File: `api/lib/espn_kaggle_resolve.py`

1. **`kaggle_id_from_espn_team(char6, display_name)`**
   - Normalizes NCAA `char6` (e.g. `MEMP`, `TEXA`) via **`NCAA_CHAR6_ALIASES`** → canonical abbr (e.g. `MEM`, `TEX`).
   - Looks up **`KAGGLE_ID_BY_ABBR`** from **`MEN_TEAMS_2026`** (must match `march-madness-insight/src/data/teams2026.ts`).
   - If no direct hit, **name matching** on `display_name` (prefers **full** school name from NCAA when `short` is a placeholder).

2. **`bracket_display_for_kaggle(kaggle_id, char6, ncaa_seed)`** (in `api/routes/scoreboard.py`)
   - When `kaggleId` is known, **`abbreviation` + `seed`** in the JSON response are **overridden** from the published bracket (`BRACKET_*_BY_KAGGLE_ID`) so the UI doesn’t show raw `char6`.

**Important:** Model probabilities use **`teams2026` TeamIDs**. If a **real** tournament team is **not** in `teams2026.ts`, resolution fails or maps incorrectly → wrong “Our model %” line.

---

## 3) Frontend: `resolveMenKaggleId` → display

1. **`resolveMenKaggleId(team)`** (`src/lib/espnTeamToKaggle.ts`):
   - If `team.kaggleId` from API → use it.
   - Else **`kaggleIdFromEspnTeam(abbreviation, name)`** with the same **`NCAA_CHAR6_ALIASES`** + **`menTeams2026`** lookup as the backend.

2. **Display** (`src/lib/bracketFieldDisplay.ts` → `liveGameTeamDisplay`):
   - For men’s, if Kaggle ID exists in **`teamsById`**, show **seed + school name** from **`teams2026.ts`** (not raw feed).

3. **Scoreboard card model line** (`ScoreboardPage` → `ScoreboardCard`):
   - **`fetchMatchupStandardProb(lo, hi)`** uses **min/max TeamID** pair from **`teams2026`**.
   - **`favAbbr`** uses bracket **abbreviation** from `teamsById` when possible.

---

## 4) Which tab (FF / R64 / …) a game appears in

File: `src/data/ncaa2026MenMatchupRounds.ts`

1. **`inferMenRoundFromMatchup(awayName, homeName)`**  
   - Canonicalizes names → **`PAIR_TO_ROUND`** map built from **`addPair("School A", "School B", "R64")`** etc.  
   - Covers **operator bracket** matchups (First Four through S16 in the file).

2. If **no pair match**:
   - **`inferMenScoreboardRound(game)`** uses the game’s **`date`** (ET) and **`TOURNAMENT_DATES`** in `src/lib/espnApi.ts` to assign **FF / R64 / R32 / S16 / E8 / F4 / CHAMP** — so unknown pairs still land in the **correct calendar round**, not only Elite Eight.

3. **`filterMarchMadnessGames`** (`src/lib/marchMadnessFilter.ts`) can drop non–March Madness games before round filtering.

---

## 5) `/api/results` checkmark

- Completed games from **`GET /api/results/2026`** are keyed by **`${minTeamId}-${maxTeamId}`**.
- If that pair exists in results cache, the UI shows **“✓ In /api/results”**.

---

## 6) When things look “wrong”

| Symptom | Likely cause |
|--------|----------------|
| Wrong seed / name on card | Team not in `teams2026` or `kaggleId` not resolved → falls back to NCAA strings. |
| Model % for wrong matchup | Pair `(lo, hi)` doesn’t match your bracket’s teams (different field vs real NCAA). |
| Game in wrong round tab | Rare: pair not in `PAIR_TO_ROUND` **and** game `date` wrong in feed; we now use full calendar fallback. |
| Duplicate or odd opponents | Usually **different** games (same school can play twice); verify **game id** / date. |

To extend the **matchup table** for new pairs, add **`addPair("A", "B", "R64")`** (etc.) in `ncaa2026MenMatchupRounds.ts` and keep **`canonTeamSlug`** aliases in sync with NCAA display names.
