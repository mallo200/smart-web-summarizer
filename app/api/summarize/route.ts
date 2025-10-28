import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import * as cheerio from "cheerio";

const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clamp(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

function extractFirstJsonObject(input: string): any {
  // Try direct parse first
  try {
    return JSON.parse(input);
  } catch {}
  // Fallback: find first balanced JSON object
  const start = input.indexOf("{");
  if (start === -1) throw new Error("JSON introuvable dans la réponse du modèle");
  let depth = 0;
  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth === 0) {
      const candidate = input.slice(start, i + 1);
      try {
        return JSON.parse(candidate);
      } catch {}
    }
  }
  throw new Error("Impossible d'extraire un objet JSON valide");
}

async function scrapeReadableText(targetUrl: string, timeoutMs = 15000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Échec du chargement de la page (${res.status})`);
    }
    const html = await res.text();
    const $ = cheerio.load(html);

    const articleText = $("article p, article h1, article h2, article li")
      .toArray()
      .map((el) => $(el).text())
      .join(" \n");
    const mainText = $("main p, main li")
      .toArray()
      .map((el) => $(el).text())
      .join(" \n");
    const paraText = $("p")
      .toArray()
      .map((el) => $(el).text())
      .join(" \n");

    const raw = articleText || mainText || paraText;
    const normalized = normalizeWhitespace(raw);
    // Limit to ~12k chars to keep token usage reasonable
    return clamp(normalized, 12000);
  } finally {
    clearTimeout(timeout);
  }
}

async function summarizeWithMistral(text: string): Promise<{ title: string; summary_points: string[] }> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY manquant");

  const systemPrompt =
    "Tu es un expert en synthèse. Résume le texte suivant en un titre et 3 points clés maximum. Réponds uniquement en format JSON avec cette structure :\\n\\n{\\n  \"title\": \"Le titre de l'article\",\\n  \"summary_points\": [\\n    \"Point clé 1\",\\n    \"Point clé 2\",\\n    \"Point clé 3\"\\n  ]\\n}\\n";

  const userPrompt = `Le texte à analyser est : '${text}'`;

  const res = await fetch(MISTRAL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "mistral-small-2506",
      temperature: 0.2,
      max_tokens: 512,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Erreur Mistral: ${res.status} ${errText}`);
  }
  const data = (await res.json()) as any;
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Réponse Mistral vide");
  const parsed = extractFirstJsonObject(content);
  const title: string = typeof parsed?.title === "string" ? parsed.title : "Résumé";
  const pointsRaw: unknown = parsed?.summary_points;
  const summary_points = Array.isArray(pointsRaw)
    ? pointsRaw.map((p) => String(p)).slice(0, 3)
    : [];
  return { title, summary_points };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { url?: string };
    const inputUrl = body?.url?.trim();
    if (!inputUrl) {
      return NextResponse.json({ error: "Paramètre url manquant" }, { status: 400 });
    }
    let parsed: URL;
    try {
      parsed = new URL(inputUrl);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("");
    } catch {
      return NextResponse.json({ error: "URL invalide" }, { status: 400 });
    }

    const text = await scrapeReadableText(parsed.toString());
    if (!text) {
      return NextResponse.json({ error: "Aucun contenu exploitable sur la page" }, { status: 422 });
    }

    const { title, summary_points } = await summarizeWithMistral(text);

    // Persist using anon client (requires RLS insert policy)
    const payload = {
      original_url: parsed.toString(),
      title,
      summary: JSON.stringify({ summary_points }),
    };
    const { data: inserted, error: insertError } = await supabase
      .from("summaries")
      .insert(payload)
      .select("id, original_url, title, summary, created_at")
      .single();
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    let bullets: string[] = [];
    try {
      const summaryObj = JSON.parse(inserted.summary ?? "{}");
      bullets = Array.isArray(summaryObj?.summary_points)
        ? summaryObj.summary_points.map((p: any) => String(p)).slice(0, 3)
        : [];
    } catch {}

    const response = {
      id: inserted.id as number,
      url: inserted.original_url as string,
      title: inserted.title as string,
      bullets,
      created_at: inserted.created_at as string,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


