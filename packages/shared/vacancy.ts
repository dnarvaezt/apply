export interface Vacancy {
  id: string;
  createdAt: string;
  sourceUrl: string | null;
  rawText: string;
  title: string;
  company: string;
  location: string | null;
  seniority: string | null;
  language: "es" | "en";
  summary: string;
  mustHave: string[];
  niceToHave: string[];
  responsibilities: string[];
  keywords: string[];
}
