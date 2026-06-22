import supabase from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name: string;
  runCount: number;
  createdAt: Date;
  lastSeenAt: Date;
}

export interface Session {
  id: string;
  userId: string | null;
  cvText: string | null;
  jdText: string | null;
  jobTitle: string | null;
  companyName: string | null;
  score: number | null;
  categories: string | null;
  keywords: string | null;
  actions: string | null;
  deepAnalysis: string | null;
  rewrite: string | null;
  coverLetters: string | null;
  companyIntel: string | null;
  linkedinText: string | null;
  linkedinAnalysis: string | null;
  createdAt: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function mapUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    runCount: row.run_count,
    createdAt: new Date(row.created_at),
    lastSeenAt: new Date(row.last_seen_at),
  };
}

function mapSession(row: any): Session {
  return {
    id: row.id,
    userId: row.user_id,
    cvText: row.cv_text,
    jdText: row.jd_text,
    jobTitle: row.job_title,
    companyName: row.company_name,
    score: row.score,
    categories: row.categories,
    keywords: row.keywords,
    actions: row.actions,
    deepAnalysis: row.deep_analysis,
    rewrite: row.rewrite,
    coverLetters: row.cover_letters,
    companyIntel: row.company_intel,
    linkedinText: row.linkedin_text,
    linkedinAnalysis: row.linkedin_analysis,
    createdAt: new Date(row.created_at),
  };
}

// ─── Storage (all async — Supabase JS is promise-based) ───────────────────────
export const storage = {
  async getUserByEmail(email: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    if (error) throw error;
    return data ? mapUser(data) : undefined;
  },

  async getUserById(id: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapUser(data) : undefined;
  },

  async createUser(user: { id: string; email: string; name: string; runCount: number }): Promise<User> {
    const { data, error } = await supabase
      .from("users")
      .insert({
        id: user.id,
        email: user.email.toLowerCase(),
        name: user.name,
        run_count: user.runCount,
      })
      .select()
      .single();
    if (error) throw error;
    return mapUser(data);
  },

  async touchLastSeen(userId: string): Promise<void> {
    const { error } = await supabase
      .from("users")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) throw error;
  },

  async incrementRunCount(userId: string): Promise<void> {
    const { error } = await supabase.rpc("increment_run_count", { user_id: userId });
    if (error) throw error;
  },

  async getAllUsers(): Promise<User[]> {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(mapUser);
  },

  async createSession(session: {
    id: string;
    userId: string | null;
    cvText: string;
    jdText: string;
    jobTitle: string | null;
    companyName: string | null;
    score: number;
    categories: string;
    keywords: string;
    actions: string;
  }): Promise<Session> {
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        id: session.id,
        user_id: session.userId,
        cv_text: session.cvText,
        jd_text: session.jdText,
        job_title: session.jobTitle,
        company_name: session.companyName,
        score: session.score,
        categories: session.categories,
        keywords: session.keywords,
        actions: session.actions,
      })
      .select()
      .single();
    if (error) throw error;
    return mapSession(data);
  },

  async updateSession(
    sessionId: string,
    updates: Partial<{
      deepAnalysis: string;
      rewrite: string;
      coverLetters: string;
      companyIntel: string;
      linkedinText: string;
      linkedinAnalysis: string;
    }>
  ): Promise<void> {
    const dbUpdates: Record<string, any> = {};
    if (updates.deepAnalysis !== undefined) dbUpdates.deep_analysis = updates.deepAnalysis;
    if (updates.rewrite !== undefined) dbUpdates.rewrite = updates.rewrite;
    if (updates.coverLetters !== undefined) dbUpdates.cover_letters = updates.coverLetters;
    if (updates.companyIntel !== undefined) dbUpdates.company_intel = updates.companyIntel;
    if (updates.linkedinText !== undefined) dbUpdates.linkedin_text = updates.linkedinText;
    if (updates.linkedinAnalysis !== undefined) dbUpdates.linkedin_analysis = updates.linkedinAnalysis;
    if (Object.keys(dbUpdates).length === 0) return;

    const { error } = await supabase
      .from("sessions")
      .update(dbUpdates)
      .eq("id", sessionId);
    if (error) throw error;
  },

  // Returns all users active in last N days, with their most recent scored session
  async getActiveUsersWithLastSession(daysSince: number): Promise<{ user: User; session: Session }[]> {
    const since = new Date(Date.now() - daysSince * 24 * 60 * 60 * 1000).toISOString();
    const { data: users, error: userErr } = await supabase
      .from("users")
      .select("*")
      .gte("last_seen_at", since);
    if (userErr) throw userErr;
    if (!users || users.length === 0) return [];

    const results: { user: User; session: Session }[] = [];
    for (const u of users) {
      const { data: sessions, error: sessErr } = await supabase
        .from("sessions")
        .select("*")
        .eq("user_id", u.id)
        .not("score", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (sessErr) continue;
      if (sessions && sessions.length > 0) {
        results.push({ user: mapUser(u), session: mapSession(sessions[0]) });
      }
    }
    return results;
  },

  async getRecentSessionsByUser(userId: string, limit: number): Promise<Session[]> {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("user_id", userId)
      .not("score", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(mapSession);
  },

  async getSession(sessionId: string): Promise<Session | undefined> {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapSession(data) : undefined;
  },
};
