/**
 * fitplan.tsx — Add to client/src/pages/fitplan.tsx
 *
 * Personalised meal + training plan generator
 * Powered by Claude Sonnet (via /api/fitplan/generate)
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface FitPlanIntake {
  goal: string;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  targetWeightKg?: number;
  activityLevel: string;
  trainingDaysPerWeek: number;
  equipment: string;
  dietaryRestrictions: string[];
  healthNotes: string;
}

interface MacroTargets { calories: number; proteinG: number; carbsG: number; fatG: number; }
interface MealItem { name: string; description: string; calories: number; proteinG: number; }
interface MealDay { day: string; meals: MealItem[]; totalCalories: number; totalProteinG: number; }
interface Exercise { name: string; sets: number; reps: string; rest: string; notes: string; }
interface TrainingDay { day: string; type: string; focus: string; exercises: Exercise[]; duration: string; }
interface GroceryList { protein: string[]; carbs: string[]; fats: string[]; vegetables: string[]; other: string[]; }

interface FitPlanResult {
  intake: FitPlanIntake;
  targets: { tdee: number; targetCalories: number; macros: MacroTargets };
  plan: {
    summary: string;
    weeklyMeals: MealDay[];
    weeklyTraining: TrainingDay[];
    groceryList: GroceryList;
    progressionPlan: string;
    keyTips: string[];
  };
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const GOALS = [
  { id: "lose_fat", label: "Lose Fat", emoji: "🔥", desc: "Calorie deficit + preserve muscle" },
  { id: "build_muscle", label: "Build Muscle", emoji: "💪", desc: "Calorie surplus + progressive overload" },
  { id: "maintain", label: "Maintain", emoji: "⚖️", desc: "Body recomposition at same weight" },
  { id: "improve_fitness", label: "Get Fit", emoji: "🏃", desc: "Cardio + general conditioning" },
  { id: "athletic_performance", label: "Performance", emoji: "⚡", desc: "Sport-specific training" },
];

const ACTIVITY_LEVELS = [
  { id: "sedentary", label: "Sedentary", desc: "Desk job, little exercise" },
  { id: "light", label: "Light", desc: "1-2 workouts/week" },
  { id: "moderate", label: "Moderate", desc: "3-4 workouts/week" },
  { id: "active", label: "Active", desc: "5-6 workouts/week" },
  { id: "very_active", label: "Very Active", desc: "2x/day or physical job" },
];

const EQUIPMENT_OPTIONS = [
  { id: "none", label: "No Equipment", desc: "Bodyweight only" },
  { id: "home_basic", label: "Home Basic", desc: "Dumbbells + bands" },
  { id: "home_full", label: "Home Full", desc: "Barbell + rack" },
  { id: "gym", label: "Gym", desc: "Full gym access" },
];

const DIETARY_OPTIONS = ["Vegetarian", "Vegan", "Gluten-free", "Dairy-free", "Halal", "Kosher", "Nut allergy", "No pork"];

// ─── Sub-components ────────────────────────────────────────────────────────────
function MacroCard({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div className="bg-[#151E35] border border-[#2A3558] rounded-xl p-4 text-center">
      <div className="font-display font-black text-2xl" style={{ color }}>{value}</div>
      <div className="text-xs text-white font-semibold mt-0.5">{unit}</div>
      <div className="text-xs text-[#8895B3] mt-0.5">{label}</div>
    </div>
  );
}

function MealDayCard({ day }: { day: MealDay }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-[#1A2340] border border-[#2A3558] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-[#1F2B47] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-display font-bold text-white">{day.day}</span>
          <Badge className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/20">
            {day.totalCalories} kcal
          </Badge>
          <Badge className="text-xs bg-green-500/10 text-green-400 border-green-500/20">
            {day.totalProteinG}g protein
          </Badge>
        </div>
        <span className="text-[#8895B3] text-sm">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-[#2A3558]">
          {day.meals.map((meal, i) => (
            <div key={i} className="pt-3">
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold text-[#8895B3] uppercase tracking-wider">{meal.name}</span>
                <span className="text-xs text-[#8895B3]">{meal.calories} kcal · {meal.proteinG}g protein</span>
              </div>
              <p className="text-sm text-[#C8D4EE] leading-relaxed">{meal.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrainingDayCard({ day }: { day: TrainingDay }) {
  const [open, setOpen] = useState(false);
  const isRest = day.type === "Rest" || day.type === "Active Recovery";
  return (
    <div className="bg-[#1A2340] border border-[#2A3558] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-[#1F2B47] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-display font-bold text-white">{day.day}</span>
          <Badge className={`text-xs border ${
            isRest ? "bg-[#2A3558]/50 text-[#8895B3] border-[#2A3558]"
            : "bg-purple-500/10 text-purple-400 border-purple-500/20"
          }`}>
            {day.type}
          </Badge>
          {!isRest && <span className="text-xs text-[#8895B3]">{day.duration}</span>}
        </div>
        {!isRest && <span className="text-[#8895B3] text-sm">{open ? "▲" : "▼"}</span>}
      </button>
      {open && !isRest && (
        <div className="px-4 pb-4 border-t border-[#2A3558]">
          <p className="text-xs text-[#8895B3] py-3">{day.focus}</p>
          <div className="space-y-2">
            {day.exercises.map((ex, i) => (
              <div key={i} className="bg-[#151E35] rounded-lg p-3">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-sm font-semibold text-white">{ex.name}</span>
                  <span className="text-xs text-[#8895B3]">{ex.sets}×{ex.reps} · {ex.rest}</span>
                </div>
                {ex.notes && <p className="text-xs text-[#8895B3]">{ex.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function FitPlan() {
  const [activeTab, setActiveTab] = useState<"meals" | "training" | "grocery">("meals");
  const [restrictions, setRestrictions] = useState<string[]>([]);
  const [form, setForm] = useState<Partial<FitPlanIntake>>({
    goal: "lose_fat",
    activityLevel: "moderate",
    trainingDaysPerWeek: 3,
    equipment: "gym",
    healthNotes: "",
  });

  const mutation = useMutation<FitPlanResult, Error, FitPlanIntake>({
    mutationFn: (data) => apiRequest("POST", "/api/fitplan/generate", data).then(r => r.json()),
  });

  const result = mutation.data;

  const handleSubmit = () => {
    if (!form.ageYears || !form.heightCm || !form.weightKg) return;
    mutation.mutate({
      ...form,
      ageYears: Number(form.ageYears),
      heightCm: Number(form.heightCm),
      weightKg: Number(form.weightKg),
      targetWeightKg: form.targetWeightKg ? Number(form.targetWeightKg) : undefined,
      trainingDaysPerWeek: Number(form.trainingDaysPerWeek || 3),
      dietaryRestrictions: restrictions,
      healthNotes: form.healthNotes || "",
    } as FitPlanIntake);
  };

  const toggleRestriction = (r: string) => {
    setRestrictions((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
  };

  return (
    <div className="min-h-screen bg-[#080D1A]">
      <div className="max-w-2xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-full px-4 py-1.5 mb-4">
            <span className="text-green-400 text-xs font-bold uppercase tracking-widest">AI Powered</span>
          </div>
          <h1 className="font-display font-black text-4xl text-white mb-3 tracking-tight">
            Your plan.<br />
            <span className="text-green-400">Built around you.</span>
          </h1>
          <p className="text-[#8895B3] text-base max-w-sm mx-auto leading-relaxed">
            Claude creates a personalised 7-day meal plan and training programme based on your goals, measurements, and lifestyle.
          </p>
        </div>

        {/* Form — shown until plan is generated */}
        {!result && (
          <div className="space-y-8">

            {/* Goal */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-[#8895B3] mb-4">What's your goal?</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {GOALS.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setForm((f) => ({ ...f, goal: g.id }))}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      form.goal === g.id
                        ? "border-green-500/40 bg-green-500/10"
                        : "border-[#2A3558] bg-[#1A2340] hover:border-[#3A4568]"
                    }`}
                  >
                    <div className="text-xl mb-1">{g.emoji}</div>
                    <div className="text-sm font-bold text-white">{g.label}</div>
                    <div className="text-xs text-[#8895B3] mt-0.5">{g.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Measurements */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-[#8895B3] mb-4">Your measurements</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "ageYears", label: "Age", placeholder: "e.g. 28", suffix: "yrs" },
                  { key: "heightCm", label: "Height", placeholder: "e.g. 178", suffix: "cm" },
                  { key: "weightKg", label: "Current weight", placeholder: "e.g. 82", suffix: "kg" },
                  { key: "targetWeightKg", label: "Target weight", placeholder: "Optional", suffix: "kg" },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="text-xs font-semibold text-[#8895B3] mb-1.5 block">{field.label}</label>
                    <div className="relative">
                      <input
                        type="number"
                        placeholder={field.placeholder}
                        value={(form as any)[field.key] || ""}
                        onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                        className="w-full bg-[#1A2340] border border-[#2A3558] rounded-lg text-white text-sm px-3 py-2.5 pr-10 outline-none focus:border-green-500/50 transition-colors"
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-[#8895B3]">{field.suffix}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Activity level */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-[#8895B3] mb-4">Activity level</h2>
              <div className="space-y-2">
                {ACTIVITY_LEVELS.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setForm((f) => ({ ...f, activityLevel: a.id }))}
                    className={`w-full flex justify-between items-center p-3 rounded-lg border text-sm transition-all ${
                      form.activityLevel === a.id
                        ? "border-green-500/40 bg-green-500/10"
                        : "border-[#2A3558] bg-[#1A2340] hover:border-[#3A4568]"
                    }`}
                  >
                    <span className="font-semibold text-white">{a.label}</span>
                    <span className="text-[#8895B3] text-xs">{a.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Training days + Equipment */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-[#8895B3] mb-4">Training days/week</h2>
                <div className="flex gap-2 flex-wrap">
                  {[2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      onClick={() => setForm((f) => ({ ...f, trainingDaysPerWeek: n }))}
                      className={`w-10 h-10 rounded-lg border font-bold text-sm transition-all ${
                        form.trainingDaysPerWeek === n
                          ? "border-green-500/40 bg-green-500/10 text-green-400"
                          : "border-[#2A3558] bg-[#1A2340] text-[#8895B3] hover:text-white"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-[#8895B3] mb-4">Equipment</h2>
                <div className="space-y-2">
                  {EQUIPMENT_OPTIONS.map((eq) => (
                    <button
                      key={eq.id}
                      onClick={() => setForm((f) => ({ ...f, equipment: eq.id }))}
                      className={`w-full flex justify-between items-center px-3 py-2 rounded-lg border text-xs transition-all ${
                        form.equipment === eq.id
                          ? "border-green-500/40 bg-green-500/10"
                          : "border-[#2A3558] bg-[#1A2340] hover:border-[#3A4568]"
                      }`}
                    >
                      <span className="font-semibold text-white">{eq.label}</span>
                      <span className="text-[#8895B3]">{eq.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Dietary restrictions */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-[#8895B3] mb-4">Dietary restrictions</h2>
              <div className="flex flex-wrap gap-2">
                {DIETARY_OPTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => toggleRestriction(r)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                      restrictions.includes(r)
                        ? "border-green-500/40 bg-green-500/10 text-green-400"
                        : "border-[#2A3558] bg-[#1A2340] text-[#8895B3] hover:text-white"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Health notes */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-[#8895B3] mb-4">
                Anything else? <span className="font-normal text-[#3D4F6E]">(optional)</span>
              </h2>
              <textarea
                rows={3}
                placeholder="Injuries, health conditions, preferences Claude should know about..."
                value={form.healthNotes || ""}
                onChange={(e) => setForm((f) => ({ ...f, healthNotes: e.target.value }))}
                className="w-full bg-[#1A2340] border border-[#2A3558] rounded-xl text-white text-sm px-4 py-3 outline-none focus:border-green-500/50 transition-colors resize-none placeholder-[#3D4F6E]"
              />
            </div>

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              disabled={mutation.isPending || !form.ageYears || !form.heightCm || !form.weightKg}
              className="w-full h-14 text-base font-bold bg-gradient-to-r from-green-500 to-blue-500 hover:opacity-90 transition-opacity"
            >
              {mutation.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Building your plan...
                </span>
              ) : "Generate my plan →"}
            </Button>

            {mutation.isError && (
              <p className="text-center text-sm text-red-400">{mutation.error.message}</p>
            )}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">

            {/* Summary */}
            <div className="bg-gradient-to-br from-green-500/10 to-blue-500/10 border border-green-500/20 rounded-2xl p-6">
              <h2 className="font-display font-black text-xl text-white mb-2">Your Plan</h2>
              <p className="text-[#C8D4EE] text-sm leading-relaxed">{result.plan.summary}</p>
            </div>

            {/* Macros */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-[#8895B3] mb-3">Daily Targets</h2>
              <div className="grid grid-cols-4 gap-3">
                <MacroCard label="Calories" value={result.targets.targetCalories} unit="kcal" color="#F59E0B" />
                <MacroCard label="Protein" value={result.targets.macros.proteinG} unit="g" color="#10B981" />
                <MacroCard label="Carbs" value={result.targets.macros.carbsG} unit="g" color="#3B82F6" />
                <MacroCard label="Fat" value={result.targets.macros.fatG} unit="g" color="#8B5CF6" />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-[#1A2340] border border-[#2A3558] rounded-xl p-1">
              {(["meals", "training", "grocery"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
                    activeTab === tab
                      ? "bg-blue-500/20 text-blue-400"
                      : "text-[#8895B3] hover:text-white"
                  }`}
                >
                  {tab === "meals" ? "🍽 Meals" : tab === "training" ? "🏋️ Training" : "🛒 Grocery"}
                </button>
              ))}
            </div>

            {/* Meals */}
            {activeTab === "meals" && (
              <div className="space-y-3">
                {result.plan.weeklyMeals.map((day, i) => <MealDayCard key={i} day={day} />)}
              </div>
            )}

            {/* Training */}
            {activeTab === "training" && (
              <div className="space-y-3">
                {result.plan.weeklyTraining.map((day, i) => <TrainingDayCard key={i} day={day} />)}
                {result.plan.progressionPlan && (
                  <div className="bg-[#1A2340] border border-[#2A3558] rounded-xl p-4 mt-2">
                    <div className="text-xs font-bold uppercase tracking-widest text-[#8895B3] mb-2">Progression Plan</div>
                    <p className="text-sm text-[#C8D4EE] leading-relaxed">{result.plan.progressionPlan}</p>
                  </div>
                )}
              </div>
            )}

            {/* Grocery */}
            {activeTab === "grocery" && result.plan.groceryList && (
              <div className="space-y-4">
                {Object.entries(result.plan.groceryList).map(([cat, items]) => (
                  <div key={cat} className="bg-[#1A2340] border border-[#2A3558] rounded-xl p-4">
                    <div className="text-xs font-bold uppercase tracking-widest text-[#8895B3] mb-3 capitalize">{cat}</div>
                    <ul className="space-y-1.5">
                      {(items as string[]).map((item, i) => (
                        <li key={i} className="flex gap-2 text-sm text-[#C8D4EE]">
                          <span className="text-green-400 flex-shrink-0">✓</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {/* Key tips */}
            {result.plan.keyTips?.length > 0 && (
              <div className="bg-[#1A2340] border border-[#2A3558] rounded-xl p-5">
                <div className="text-xs font-bold uppercase tracking-widest text-[#8895B3] mb-3">Key Tips</div>
                <ul className="space-y-2">
                  {result.plan.keyTips.map((tip, i) => (
                    <li key={i} className="flex gap-2 text-sm text-[#C8D4EE]">
                      <span className="text-[#F59E0B] flex-shrink-0">{i + 1}.</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Start over */}
            <Button
              onClick={() => mutation.reset()}
              variant="outline"
              className="w-full border-[#2A3558] text-[#8895B3] hover:text-white"
            >
              ← Generate a new plan
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
