import Papa from "papaparse";

/**
 * Free data from https://www.football-data.co.uk
 *  - mmz4281/{season}/{league}.csv : results, corners, opening + closing odds
 *  - fixtures.csv                   : upcoming fixtures with current odds
 */
const BASE = process.env.FOOTBALL_DATA_BASE_URL ?? "https://www.football-data.co.uk";

export type Odds = Record<string, number>;

export interface HistMatch {
  league: string;
  kickoff: Date;
  home: string;
  away: string;
  hg: number;
  ag: number;
  hc: number | null;
  ac: number | null;
  odds: Odds;
  closing: Odds;
}

export interface Fixture {
  league: string;
  kickoff: Date;
  home: string;
  away: string;
  odds: Odds;
}

/** "2627" for the 2026/27 season. Seasons start in July. */
export function seasonCode(d: Date, offset = 0): string {
  const y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  const s = y + offset;
  const two = (n: number) => String(n % 100).padStart(2, "0");
  return `${two(s)}${two(s + 1)}`;
}

/** football-data times are UK local time. Convert to a UTC Date. */
function londonToUtc(y: number, m: number, d: number, hh: number, mm: number): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guess);
  const lh = Number(parts.find((p) => p.type === "hour")?.value ?? hh);
  const lm = Number(parts.find((p) => p.type === "minute")?.value ?? mm);
  let diff = (lh * 60 + lm - (hh * 60 + mm)) % 1440;
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  return new Date(guess.getTime() - diff * 60_000);
}

export function parseKickoff(date: string, time?: string): Date | null {
  const m = date?.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const [hh, mm] = (time?.trim() || "15:00").split(":").map(Number);
  return londonToUtc(y, Number(m[2]), Number(m[1]), hh || 0, mm || 0);
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Take the first bookmaker prefix that has all columns of a market. */
function pickOdds(row: Record<string, string>, prefixes: string[], cols: [string, string][]): Odds {
  for (const p of prefixes) {
    const vals = cols.map(([suffix]) => num(row[`${p}${suffix}`]));
    if (vals.every((v) => v != null && v > 1)) {
      const out: Odds = {};
      cols.forEach(([, key], i) => (out[key] = vals[i] as number));
      return out;
    }
  }
  return {};
}

const X12: [string, string][] = [["H", "1X2:HOME"], ["D", "1X2:DRAW"], ["A", "1X2:AWAY"]];
const OU25: [string, string][] = [[">2.5", "OU2.5:OVER"], ["<2.5", "OU2.5:UNDER"]];

export function extractOdds(row: Record<string, string>): Odds {
  return {
    ...pickOdds(row, ["Avg", "B365", "PS", "Max"], X12),
    ...pickOdds(row, ["Avg", "B365", "P", "Max"], OU25),
  };
}

export function extractClosing(row: Record<string, string>): Odds {
  return {
    ...pickOdds(row, ["AvgC", "B365C", "PSC", "MaxC"], X12),
    ...pickOdds(row, ["AvgC", "B365C", "PC", "MaxC"], OU25),
  };
}

async function fetchCsv(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "football-edge/1.0" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const text = (await res.text()).replace(/^﻿/, "");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.replace(/^﻿/, "").trim(),
  });
  return parsed.data;
}

export function rowToHist(league: string, row: Record<string, string>): HistMatch | null {
  const kickoff = parseKickoff(row.Date, row.Time);
  const hg = num(row.FTHG);
  const ag = num(row.FTAG);
  if (!kickoff || hg == null || ag == null || !row.HomeTeam || !row.AwayTeam) return null;
  return {
    league,
    kickoff,
    home: row.HomeTeam.trim(),
    away: row.AwayTeam.trim(),
    hg,
    ag,
    hc: num(row.HC),
    ac: num(row.AC),
    odds: extractOdds(row),
    closing: extractClosing(row),
  };
}

export async function fetchSeason(league: string, season: string): Promise<HistMatch[]> {
  try {
    const rows = await fetchCsv(`${BASE}/mmz4281/${season}/${league}.csv`);
    return rows.map((r) => rowToHist(league, r)).filter((x): x is HistMatch => x != null);
  } catch (e) {
    // A season file does not exist yet in early July, for example.
    console.warn(`[football-data] ${league} ${season}: ${(e as Error).message}`);
    return [];
  }
}

/** Current season + the previous one (used for model fitting). */
export async function fetchHistory(league: string, now = new Date()): Promise<HistMatch[]> {
  const [prev, cur] = await Promise.all([
    fetchSeason(league, seasonCode(now, -1)),
    fetchSeason(league, seasonCode(now, 0)),
  ]);
  return [...prev, ...cur].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
}

export async function fetchFixtures(leagues: string[]): Promise<Fixture[]> {
  const rows = await fetchCsv(`${BASE}/fixtures.csv`);
  const out: Fixture[] = [];
  for (const r of rows) {
    const league = r.Div?.trim();
    if (!league || !leagues.includes(league)) continue;
    const kickoff = parseKickoff(r.Date, r.Time);
    if (!kickoff || !r.HomeTeam || !r.AwayTeam) continue;
    out.push({ league, kickoff, home: r.HomeTeam.trim(), away: r.AwayTeam.trim(), odds: extractOdds(r) });
  }
  return out;
}

export const matchId = (league: string, kickoff: Date, home: string, away: string) =>
  `${league}-${kickoff.toISOString().slice(0, 10)}-${home}-${away}`.replace(/\s+/g, "_");
