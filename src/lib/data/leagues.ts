import type { Locale } from "../i18n/config";

/** League codes used by football-data.co.uk, with Arabic names for the interface. */
export const LEAGUES: Record<string, { name: string; country: string; ar: { name: string; country: string } }> = {
  E0: { name: "Premier League", country: "England", ar: { name: "الدوري الإنجليزي الممتاز", country: "إنجلترا" } },
  E1: { name: "Championship", country: "England", ar: { name: "دوري البطولة الإنجليزية", country: "إنجلترا" } },
  SP1: { name: "La Liga", country: "Spain", ar: { name: "الدوري الإسباني", country: "إسبانيا" } },
  I1: { name: "Serie A", country: "Italy", ar: { name: "الدوري الإيطالي", country: "إيطاليا" } },
  D1: { name: "Bundesliga", country: "Germany", ar: { name: "الدوري الألماني", country: "ألمانيا" } },
  F1: { name: "Ligue 1", country: "France", ar: { name: "الدوري الفرنسي", country: "فرنسا" } },
  N1: { name: "Eredivisie", country: "Netherlands", ar: { name: "الدوري الهولندي", country: "هولندا" } },
  P1: { name: "Primeira Liga", country: "Portugal", ar: { name: "الدوري البرتغالي", country: "البرتغال" } },
  B1: { name: "Jupiler Pro League", country: "Belgium", ar: { name: "الدوري البلجيكي", country: "بلجيكا" } },
  T1: { name: "Süper Lig", country: "Turkey", ar: { name: "الدوري التركي", country: "تركيا" } },
  SC0: { name: "Scottish Premiership", country: "Scotland", ar: { name: "الدوري الإسكتلندي", country: "إسكتلندا" } },
  G1: { name: "Super League", country: "Greece", ar: { name: "الدوري اليوناني", country: "اليونان" } },
};

/** English by default (used in prompts); pages pass the interface locale. */
export const leagueName = (code: string, locale: Locale = "en") => {
  const l = LEAGUES[code];
  return l ? (locale === "ar" ? l.ar.name : l.name) : code;
};

export const leagueCountry = (code: string, locale: Locale = "en") => {
  const l = LEAGUES[code];
  return l ? (locale === "ar" ? l.ar.country : l.country) : "";
};
