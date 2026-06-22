import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
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
  domainMatch?: "strong" | "partial" | "weak";
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

// ─── Stage 2: LinkedIn Analysis (V2 format — returned by /api/linkedin/analyse) ─
export interface LinkedInAnalysisResult {
  mode: "profile_text" | "screenshot" | "cv_based";
  overallScore: number;
  targetSpace: string;
  sectionScores: { section: string; score: number; current: string; issue: string }[];
  headline: string;
  headlineAlternatives: string[];
  about: string;
  experienceRewrites: { role: string; before: string; after: string }[];
  skillsToAdd: string[];
  recruiterKeywords: string[];
  featuredSection: string;
  bannerIdea: string;
  creatorMode: string;
  posts: { hook: string; angle: string; body: string }[];
  priorityActions: string[];
  gapAnalysis: string;
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
  categories: { name: string; score: number }[] | null;
}

// Launch config — 6 weeks from first deploy
export const LAUNCH_CONFIG = {
  freeUntil: new Date("2026-07-29"),
  productName: "CVScore",
};

// ─── Predictions ──────────────────────────────────────────────────────────────
export const predictions = sqliteTable("predictions", {
  id: text("id").primaryKey(),
  sport: text("sport").notNull(),           // 'worldcup' | 'premier_league' | 'ipl'
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  matchDate: text("match_date").notNull(),  // YYYY-MM-DD
  competition: text("competition").notNull(),
  venue: text("venue"),
  kickoff: text("kickoff"),
  pick: text("pick").notNull(),
  pickDescription: text("pick_description").notNull(),
  confidence: integer("confidence").notNull(),
  reasoning: text("reasoning").notNull(),
  keyFactors: text("key_factors").notNull(), // JSON: string[]
  matchContext: text("match_context").notNull(),
  riskNote: text("risk_note").notNull(),
  alternativeAngle: text("alternative_angle").notNull(),
  outcome: text("outcome").default("pending"), // 'pending' | 'correct' | 'incorrect'
  actualResult: text("actual_result"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── User picks (pick logging) ────────────────────────────────────────────────
export const userPicks = sqliteTable("user_picks", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  predictionId: text("prediction_id").notNull(),
  sport: text("sport").notNull(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  matchDate: text("match_date").notNull(),
  userPick: text("user_pick").notNull(),
  claudePick: text("claude_pick").notNull(),
  claudeConfidence: integer("claude_confidence").notNull(),
  userOutcome: text("user_outcome").default("pending"),
  claudeOutcome: text("claude_outcome").default("pending"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── FitPlan plans ────────────────────────────────────────────────────────────
export const fitPlans = sqliteTable("fit_plans", {
  id: text("id").primaryKey(),
  email: text("email"),
  goal: text("goal").notNull(),
  ageYears: integer("age_years").notNull(),
  heightCm: integer("height_cm").notNull(),
  weightKg: real("weight_kg").notNull(),
  targetWeightKg: real("target_weight_kg"),
  activityLevel: text("activity_level").notNull(),
  trainingDaysPerWeek: integer("training_days_per_week").notNull(),
  equipment: text("equipment").notNull(),
  dietaryRestrictions: text("dietary_restrictions"),
  healthNotes: text("health_notes"),
  tdee: integer("tdee"),
  targetCalories: integer("target_calories"),
  macros: text("macros"),       // JSON
  weeklyPlan: text("weekly_plan"), // JSON
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── Token usage log (soft counter during free period) ────────────────────────
export const tokenUsage = sqliteTable("token_usage", {
  id: text("id").primaryKey(),
  email: text("email"),
  action: text("action").notNull(),
  tokenCost: integer("token_cost").notNull(),
  isFree: integer("is_free", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ─── Type exports for new tables ──────────────────────────────────────────────
export type Prediction = typeof predictions.$inferSelect;
export type UserPick = typeof userPicks.$inferSelect;
export type FitPlan = typeof fitPlans.$inferSelect;
export type TokenUsage = typeof tokenUsage.$inferSelect;

// ─── Interview prep extended types ───────────────────────────────────────────
export interface InterviewQuestion {
  category: string;
  question: string;
  hint: string;
  whyAsked: string;
}

export interface DeepAnalysisResultV2 {
  upskilling: { skill: string; reason: string; resource: string }[];
  interviewPrep: InterviewQuestion[];
  questionsToAsk: string[];
  competitiveInsights: string;
}

// LinkedInAnalysisResultV2 merged into LinkedInAnalysisResult above

// ─── FitPlan types ────────────────────────────────────────────────────────────
export interface MealItem {
  name: string;
  description: string;
  calories: number;
  proteinG: number;
  qualityScore: number;
  qualityNotes: string;
  estimatedCost: string;
}

export interface MealDay {
  day: string;
  meals: MealItem[];
  totalCalories: number;
  totalProteinG: number;
  estimatedDayCost: string;
}

export interface ExerciseItem {
  name: string;
  sets: number;
  reps: string;
  rest: string;
  notes: string;
}

export interface TrainingDay {
  day: string;
  type: string;
  focus: string;
  exercises: ExerciseItem[];
  duration: string;
}

export interface GroceryItem {
  item: string;
  estimatedPrice: string;
  qualityNote: string;
}

export interface FitPlanResult {
  summary: string;
  weeklyMeals: MealDay[];
  weeklyTraining: TrainingDay[];
  groceryList: {
    protein: GroceryItem[];
    carbs: GroceryItem[];
    fats: GroceryItem[];
    vegetables: GroceryItem[];
    other: GroceryItem[];
  };
  estimatedWeeklyCost: string;
  costBreakdown: string;
  progressionPlan: string;
  keyTips: string[];
}

// ─── Q&A types ────────────────────────────────────────────────────────────────
export interface QAQuestion {
  id: string;
  text: string;
  wordLimit?: number;
  bulletPoints: string[];
}

export interface QAAnswer {
  questionId: string;
  question: string;
  answer: string;
  wordCount: number;
  withinLimit: boolean;
  whyAsked: string;
  alternativeLine: string;
  strengthsUsed: string[];
}

export interface QAResult {
  answers: QAAnswer[];
  overallAdvice: string;
}
