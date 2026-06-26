import JSZip from "jszip";

export interface LinkedInExport {
  profile: {
    firstName?: string;
    lastName?: string;
    headline?: string;
    summary?: string;
    industry?: string;
    location?: string;
  };
  positions: Array<{
    companyName: string;
    title: string;
    description?: string;
    startedOn?: string;
    finishedOn?: string;
  }>;
  education: Array<{
    schoolName: string;
    degreeName?: string;
    fieldOfStudy?: string;
    startDate?: string;
    endDate?: string;
  }>;
  skills: string[];
  certifications: Array<{
    name: string;
    authority?: string;
  }>;
  endorsements: Array<{
    skillName: string;
    count: number;
  }>;
  recommendations: Array<{
    recommenderFirstName: string;
    recommenderLastName: string;
    recommenderTitle?: string;
    text: string;
  }>;
  languages: Array<{
    name: string;
    proficiency?: string;
  }>;
  courses: Array<{
    name: string;
    number?: string;
  }>;
  honors: Array<{
    title: string;
    issuer?: string;
  }>;
  savedJobs: Array<{
    company: string;
    title: string;
    date?: string;
  }>;
  network: {
    totalCount: number;
    topCompanies: Array<{ name: string; count: number }>;
    topPositions: Array<{ name: string; count: number }>;
  };
}

// ── Minimal CSV parser ─────────────────────────────────────────────────────────
function parseCSVRow(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  values.push(current.trim());
  return values;
}

function parseCSV(content: string): Record<string, string>[] {
  const rawLines = content.split(/\r?\n/);
  if (rawLines.length < 2) return [];
  const nonEmpty = rawLines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length < 2) return [];
  const headers = parseCSVRow(nonEmpty[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < nonEmpty.length; i++) {
    const vals = parseCSVRow(nonEmpty[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ""; });
    rows.push(row);
  }
  return rows;
}

function parseConnectionsCSV(content: string): Record<string, string>[] {
  // Connections.csv has 2 note lines before the actual CSV header
  const lines = content.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.trim().startsWith("First Name"));
  if (headerIdx === -1) return [];
  return parseCSV(lines.slice(headerIdx).join("\n"));
}

function topN(map: Map<string, number>, n: number): Array<{ name: string; count: number }> {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

const IGNORE_FILES = new Set([
  "messages.csv",
  "email addresses.csv",
  "phonenumbers.csv",
  "whatsapp phone numbers.csv",
  "private_identity_asset.csv",
  "registration.csv",
  "ad_targeting.csv",
  "rich_media.csv",
  "invitations.csv",
  "receipts_v2.csv",
  "guide_messages.csv",
  "learning_coach_messages.csv",
  "learning_role_play_messages.csv",
  "savedjobsalerts.csv",
]);

export async function parseLinkedInExport(zipBuffer: Buffer): Promise<LinkedInExport> {
  const zip = await JSZip.loadAsync(zipBuffer);

  const files = new Map<string, string>();
  await Promise.all(
    Object.entries(zip.files).map(async ([entryName, entry]) => {
      if (entry.dir) return;
      const name = entryName.split("/").pop()?.toLowerCase() || "";
      if (!name.endsWith(".csv")) return;
      if (IGNORE_FILES.has(name)) return;
      if (name.includes("job applicant saved screening")) return;
      try {
        files.set(name, await entry.async("string"));
      } catch { /* skip unreadable */ }
    })
  );

  // ── Profile ────────────────────────────────────────────────────────────────
  const profile: LinkedInExport["profile"] = {};
  const profileRaw = files.get("profile.csv");
  if (profileRaw) {
    const rows = parseCSV(profileRaw);
    if (rows.length > 0) {
      const r = rows[0];
      profile.firstName = r["First Name"] || r["firstName"] || undefined;
      profile.lastName = r["Last Name"] || r["lastName"] || undefined;
      profile.headline = r["Headline"] || r["headline"] || undefined;
      profile.summary = (r["Summary"] || r["summary"] || "").slice(0, 1000) || undefined;
      profile.industry = r["Industry"] || r["industry"] || undefined;
      profile.location = r["Geo Location"] || r["location"] || r["Location"] || undefined;
    }
  }

  // ── Positions ──────────────────────────────────────────────────────────────
  const positions: LinkedInExport["positions"] = [];
  const posRaw = files.get("positions.csv");
  if (posRaw) {
    for (const r of parseCSV(posRaw)) {
      const companyName = r["Company Name"] || r["companyName"] || r["Company"] || "";
      const title = r["Title"] || r["title"] || "";
      if (!companyName && !title) continue;
      positions.push({
        companyName,
        title,
        description: (r["Description"] || r["description"] || "").slice(0, 300) || undefined,
        startedOn: r["Started On"] || r["startedOn"] || undefined,
        finishedOn: r["Finished On"] || r["finishedOn"] || undefined,
      });
    }
  }

  // ── Education ─────────────────────────────────────────────────────────────
  const education: LinkedInExport["education"] = [];
  const eduRaw = files.get("education.csv");
  if (eduRaw) {
    for (const r of parseCSV(eduRaw)) {
      const schoolName = r["School Name"] || r["schoolName"] || r["School"] || "";
      if (!schoolName) continue;
      education.push({
        schoolName,
        degreeName: r["Degree Name"] || r["degreeName"] || undefined,
        fieldOfStudy: r["Field Of Study"] || r["fieldOfStudy"] || undefined,
        startDate: r["Start Date"] || r["startDate"] || undefined,
        endDate: r["End Date"] || r["endDate"] || undefined,
      });
    }
  }

  // ── Skills ────────────────────────────────────────────────────────────────
  const skills: string[] = [];
  const skillsRaw = files.get("skills.csv");
  if (skillsRaw) {
    for (const r of parseCSV(skillsRaw)) {
      const name = r["Name"] || r["name"] || r["Skill"] || "";
      if (name) skills.push(name);
    }
  }

  // ── Certifications ────────────────────────────────────────────────────────
  const certifications: LinkedInExport["certifications"] = [];
  const certRaw = files.get("certifications.csv");
  if (certRaw) {
    for (const r of parseCSV(certRaw)) {
      const name = r["Name"] || r["name"] || r["Certificate Name"] || "";
      if (!name) continue;
      certifications.push({ name, authority: r["Authority"] || r["authority"] || undefined });
    }
  }

  // ── Endorsements ─────────────────────────────────────────────────────────
  const endorsements: LinkedInExport["endorsements"] = [];
  const endorseRaw = files.get("endorsement_received_info.csv");
  if (endorseRaw) {
    const countMap = new Map<string, number>();
    for (const r of parseCSV(endorseRaw)) {
      const skill = r["Skill Name"] || r["skillName"] || r["skill_name"] || r["Skill"] || "";
      if (!skill) continue;
      countMap.set(skill, (countMap.get(skill) || 0) + 1);
    }
    for (const [skillName, count] of Array.from(countMap.entries())) {
      endorsements.push({ skillName, count });
    }
    endorsements.sort((a, b) => b.count - a.count);
  }

  // ── Recommendations ───────────────────────────────────────────────────────
  const recommendations: LinkedInExport["recommendations"] = [];
  const recRaw = files.get("recommendations_received.csv");
  if (recRaw) {
    for (const r of parseCSV(recRaw)) {
      const text = r["Text"] || r["text"] || r["Recommendation"] || r["recommendation"] || "";
      if (!text || text.length < 10) continue;
      recommendations.push({
        recommenderFirstName: r["First Name"] || r["firstName"] || r["Recommender First Name"] || "",
        recommenderLastName: r["Last Name"] || r["lastName"] || r["Recommender Last Name"] || "",
        recommenderTitle: r["Title"] || r["title"] || undefined,
        text: text.slice(0, 500),
      });
    }
  }

  // ── Languages ─────────────────────────────────────────────────────────────
  const languages: LinkedInExport["languages"] = [];
  const langRaw = files.get("languages.csv");
  if (langRaw) {
    for (const r of parseCSV(langRaw)) {
      const name = r["Name"] || r["name"] || r["Language"] || "";
      if (!name) continue;
      languages.push({ name, proficiency: r["Proficiency"] || r["proficiency"] || undefined });
    }
  }

  // ── Courses ───────────────────────────────────────────────────────────────
  const courses: LinkedInExport["courses"] = [];
  const coursesRaw = files.get("courses.csv");
  if (coursesRaw) {
    for (const r of parseCSV(coursesRaw)) {
      const name = r["Name"] || r["name"] || r["Course Name"] || "";
      if (!name) continue;
      courses.push({ name, number: r["Number"] || r["number"] || undefined });
    }
  }

  // ── Honors & Awards ───────────────────────────────────────────────────────
  const honors: LinkedInExport["honors"] = [];
  const honorsRaw = files.get("honors_awards.csv") || files.get("honor_awards.csv") || files.get("honorsawards.csv");
  if (honorsRaw) {
    for (const r of parseCSV(honorsRaw)) {
      const title = r["Title"] || r["title"] || r["Honor"] || r["Award"] || "";
      if (!title) continue;
      honors.push({ title, issuer: r["Issuer"] || r["issuer"] || r["Authority"] || undefined });
    }
  }

  // ── Saved Jobs (no URLs) ──────────────────────────────────────────────────
  const savedJobs: LinkedInExport["savedJobs"] = [];
  const savedJobsRaw = files.get("savedjobs.csv") || files.get("saved_jobs.csv") || files.get("jobs_saved.csv");
  if (savedJobsRaw) {
    for (const r of parseCSV(savedJobsRaw)) {
      const company = r["Company Name"] || r["company"] || r["Company"] || "";
      const title = r["Job Title"] || r["title"] || r["Title"] || "";
      if (!company && !title) continue;
      savedJobs.push({ company, title, date: r["Saved Date"] || r["date"] || r["Date"] || undefined });
    }
  }

  // ── Network (Connections) ─────────────────────────────────────────────────
  let totalCount = 0;
  const companyMap = new Map<string, number>();
  const positionMap = new Map<string, number>();

  const connRaw = files.get("connections.csv");
  if (connRaw) {
    const rows = parseConnectionsCSV(connRaw);
    totalCount = rows.length;
    for (const r of rows) {
      const company = (r["Company"] || r["company"] || "").trim();
      const position = (r["Position"] || r["position"] || "").trim();
      if (company) companyMap.set(company, (companyMap.get(company) || 0) + 1);
      if (position) positionMap.set(position, (positionMap.get(position) || 0) + 1);
    }
  }

  return {
    profile,
    positions,
    education,
    skills,
    certifications,
    endorsements,
    recommendations,
    languages,
    courses,
    honors,
    savedJobs,
    network: {
      totalCount,
      topCompanies: topN(companyMap, 20),
      topPositions: topN(positionMap, 20),
    },
  };
}
