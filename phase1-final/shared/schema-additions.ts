// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 ADDITIONS
// Paste everything below this line at the BOTTOM of shared/schema.ts
// Then run: npm run db:push  (in Railway shell)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─── LinkedIn extended types ──────────────────────────────────────────────────
export interface LinkedInAnalysisResultV2 {
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
