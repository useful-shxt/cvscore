import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Users (email capture) ────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  runCount: integer("run_count").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const insertUserSchema = createInsertSchema(users).omit({ createdAt: true, lastSeenAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ─── Sessions (scoring runs / application tracker) ────────────────────────────
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  cvText: text("cv_text").notNull(),
  jdText: text("jd_text").notNull(),
  // Stage 2 — job metadata
  jobTitle: text("job_title"),         // extracted from JD
  companyName: text("company_name"),   // extracted from JD
  // Scores
  score: integer("score"),
  categories: text("categories"),      // JSON
  keywords: text("keywords"),          // JSON: { matched, missing }
  actions: text("actions"),            // JSON array
  deepAnalysis: text("deep_analysis"), // JSON
  // Stage 2 — company intel + LinkedIn
  companyIntel: text("company_intel"), // raw string from sonar web search
  linkedinText: text("linkedin_text"), // pasted LinkedIn profile text
  linkedinAnalysis: text("linkedin_analysis"), // JSON: LinkedInAnalysisResult
  // Outputs
  rewrite: text("rewrite"),            // JSON
  coverLetters: text("cover_letters"), // JSON array
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const insertSessionSchema = createInsertSchema(sessions).omit({ createdAt: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// ─── Score categories ─────────────────────────────────────────────────────────
export const SCORE_CATEGORIES = [
  "Keyword Alignment",
  "CV Structure & Format",
  "Experience Relevance",
  "Quantified Impact",
  "ATS Compatibility",
  "Narrative Clarity",
] as const;

export type ScoreCategory = typeof SCORE_CATEGORIES[number];

export interface CategoryScore {
  name: ScoreCategory;
  score: number;
  feedback: string;
  suggestion: string;
}

export interface FastScoreResult {
  overallScore: number;
  categories: CategoryScore[];
  keywords: { matched: string[]; missing: string[] };
  topActions: string[];
  summary: string;
}

export interface DeepAnalysisResult {
  upskilling: { skill: string; reason: string; resource: string }[];
  interviewPrep: { question: string; hint: string }[];
  competitiveInsights: string;
}

export interface RewriteResult {
  name: string;
  tagline: string;
  contact: string;
  summary: string;
  skills: string[];
  experience: { title: string; company: string; dates: string; bullets: string[] }[];
  education: { degree: string; institution: string; dates: string }[];
  extras: string[];
}

export interface CoverLetter {
  tone: string;
  desc: string;
  salutation: string;
  paragraphs: string[];
  sign: string;
}

// ─── Stage 2: Company Intel ───────────────────────────────────────────────────
export interface CompanyIntelResult {
  companyName: string;
  jobTitle: string;
  overview: string;       // 2-3 sentence company overview
  culture: string;        // what they value in employees
  recentNews: string;     // recent notable news/developments
  techStack: string;      // technologies/tools used
  hiringSignals: string;  // what the role signals about the company direction
}

// ─── Stage 2: LinkedIn Analysis ───────────────────────────────────────────────
export interface LinkedInAnalysisResult {
  overallScore: number;
  headlineScore: number;
  headlineFeedback: string;
  summaryScore: number;
  summaryFeedback: string;
  skillsScore: number;
  skillsFeedback: string;
  experienceScore: number;
  experienceFeedback: string;
  gaps: string[];           // things on CV missing from LinkedIn
  extras: string[];         // things on LinkedIn not on CV (potential strengths)
  topActions: string[];     // 3 quick wins
  keywordsMissing: string[]; // keywords from JD missing from LinkedIn
}

// ─── Stage 2: Tracker entry (lightweight session summary) ─────────────────────
export interface TrackerEntry {
  sessionId: string;
  jobTitle: string;
  companyName: string;
  score: number;
  createdAt: string;
  keywords: { matched: string[]; missing: string[] } | null;
  topActions: string[];
}

// Launch config — 6 weeks from first deploy
export const LAUNCH_CONFIG = {
  freeUntil: new Date("2026-07-29"),
  productName: "CVScore",
};
