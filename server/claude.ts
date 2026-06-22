/**
 * server/claude.ts — ADD as new file
 * Claude Sonnet/Haiku API helper
 * Used by: LinkedIn screenshot, Predict, FitPlan, CV differential
 */

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

function getKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set in Railway environment variables");
  return key;
}

export async function callClaude(
  prompt: string,
  system = "You are a helpful expert. Return valid JSON only.",
  model: "claude-sonnet-4-6" | "claude-haiku-4-5-20251001" = "claude-sonnet-4-6",
  maxTokens = 5000,
  retries = 3,
  imageBase64?: string,
  imageMediaType = "image/jpeg"
): Promise<string> {
  const key = getKey();

  const userContent: any[] = imageBase64
    ? [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: imageMediaType,
            data: imageBase64.replace(/^data:image\/[a-z]+;base64,/, ""),
          },
        },
        { type: "text", text: prompt },
      ]
    : prompt;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(ANTHROPIC_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": key,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: userContent }],
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        return (data.content as any[])
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text as string)
          .join("");
      }

      if ([529, 503, 502, 500].includes(res.status) && attempt < retries) {
        await new Promise((r) =>
          setTimeout(r, Math.pow(2, attempt) * 1000 + Math.random() * 500)
        );
        continue;
      }

      const errText = await res.text();
      throw new Error(`Claude API error ${res.status}: ${errText}`);
    } catch (err: any) {
      if (attempt === retries) throw err;
      await new Promise((r) =>
        setTimeout(r, Math.pow(2, attempt) * 1000 + Math.random() * 500)
      );
    }
  }
  throw new Error("Claude API: max retries exceeded");
}

export const callClaudeHaiku = (prompt: string, system?: string) =>
  callClaude(prompt, system, "claude-haiku-4-5-20251001", 2048);

export const callClaudeSonnet = (prompt: string, system?: string, imageBase64?: string) =>
  callClaude(prompt, system, "claude-sonnet-4-6", 5000, 3, imageBase64);

/**
 * Fetch a public URL and extract clean text (for JD URL fetching)
 */
export async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; CVScore/1.0; +https://usefulshxt.com)",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching URL`);
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 6000);
}
