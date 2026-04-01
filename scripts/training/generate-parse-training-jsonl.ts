import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PrismaClient, TaxonomyKind } from "@prisma/client";
import OpenAI from "openai";
import * as dotenv from "dotenv";

dotenv.config();

type NodeKind = "DTE" | "INTENT" | "TAG";

type TrainingNode = {
  key: string;
  kind: NodeKind;
  confidence: number;
};

type TrainingAssistantPayload = {
  nodes: TrainingNode[];
  suggestions: Array<{
    key: string;
    name: string;
    kind: NodeKind;
    group?: string;
    confidence: number;
    reason: string;
  }>;
  locations: {
    user: { city?: string; state?: string } | null;
    event: { city?: string; state?: string } | null;
  };
};

type JsonlRow = {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
};

type StoryDraft = {
  text: string;
  userLocation: { city?: string; state?: string } | null;
  eventLocation: { city?: string; state?: string } | null;
};

type ActionRow = {
  intentKey: string;
  dependsOnIntentKeys: string[];
};

type TaxonomyNodeSeed = {
  key: string;
  kind: NodeKind;
  name: string;
  metadata: Record<string, unknown> | null;
  aliases: string[];
};

const SYSTEM_PROMPT = `You are a grief-support intake assistant helping families navigate the death of a loved one.

Analyze the situation described and return the relevant taxonomy nodes.

WHAT TO RETURN:
1. DTE (Death-Triggering Event): Identify the cause or circumstance of death if stated or clearly implied.
2. INTENT nodes: Return intents directly stated by the user and strongly implied intents.

RULES:
- Return ONLY keys that exist in the provided taxonomy.
- Do not invent keys.
- Unless a pet is explicitly referenced, assume human context.
- Return JSON only.

RESPONSE FORMAT:
{
  "nodes": [{ "key": "EXISTING_KEY", "kind": "DTE|INTENT|TAG", "confidence": 0.0-1.0 }],
  "suggestions": [],
  "locations": {
    "user": { "city": "...", "state": "..." } or null,
    "event": { "city": "...", "state": "..." } or null
  }
}`;

const DEFAULT_OUT = "./tmp/parse-training.story.jsonl";
const DEFAULT_LOCALE = "en-US";

function parseArgs() {
  const args = process.argv.slice(2);

  const out = getArg(args, "--out") ?? DEFAULT_OUT;
  const locale = getArg(args, "--locale") ?? DEFAULT_LOCALE;
  const stories = Number(getArg(args, "--stories") ?? "250");
  const maxIntents = Number(getArg(args, "--maxIntents") ?? "2");
  const maxTags = Number(getArg(args, "--maxTags") ?? "1");
  const maxDteInferredIntents = Number(getArg(args, "--maxDteInferredIntents") ?? "2");
  const withAi = args.includes("--with-ai");

  return {
    out,
    locale,
    stories: Number.isFinite(stories) && stories > 0 ? stories : 250,
    maxIntents: Number.isFinite(maxIntents) && maxIntents > 0 ? maxIntents : 2,
    maxTags: Number.isFinite(maxTags) && maxTags > 0 ? maxTags : 1,
    maxDteInferredIntents:
      Number.isFinite(maxDteInferredIntents) && maxDteInferredIntents > 0
        ? maxDteInferredIntents
        : 2,
    withAi,
  };
}

function getArg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

function randInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sampleOne<T>(arr: T[]): T | null {
  if (arr.length === 0) return null;
  return arr[randInt(arr.length)];
}

function sampleMany<T>(arr: T[], count: number): T[] {
  return shuffle(arr).slice(0, Math.max(0, Math.min(count, arr.length)));
}

function pickAlias(node: TaxonomyNodeSeed): string {
  if (node.aliases.length === 0) return node.name;
  return node.aliases[randInt(node.aliases.length)];
}

function toNodeKind(kind: TaxonomyKind): NodeKind | null {
  if (kind === TaxonomyKind.DTE) return "DTE";
  if (kind === TaxonomyKind.INTENT) return "INTENT";
  if (kind === TaxonomyKind.TAG) return "TAG";
  return null;
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function uniqueNodes(nodes: TrainingNode[]): TrainingNode[] {
  const byKey = new Map<string, TrainingNode>();
  for (const node of nodes) {
    const existing = byKey.get(node.key);
    if (!existing || node.confidence > existing.confidence) {
      byKey.set(node.key, node);
    }
  }
  return [...byKey.values()];
}

function buildAssistantPayload(
  nodes: TrainingNode[],
  userLocation: { city?: string; state?: string } | null,
  eventLocation: { city?: string; state?: string } | null,
): TrainingAssistantPayload {
  return {
    nodes: uniqueNodes(nodes),
    suggestions: [],
    locations: {
      user: userLocation,
      event: eventLocation,
    },
  };
}

function buildUserMessage(locale: string, input: string): string {
  return `Locale: ${locale}\n\nInput: ${input}`;
}

function rowFromStory(params: {
  locale: string;
  story: StoryDraft;
  nodes: TrainingNode[];
}): JsonlRow {
  const { locale, story, nodes } = params;
  return {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(locale, story.text) },
      {
        role: "assistant",
        content: JSON.stringify(
          buildAssistantPayload(nodes, story.userLocation, story.eventLocation),
        ),
      },
    ],
  };
}

function buildFallbackStory(params: {
  dte: TaxonomyNodeSeed | null;
  intents: TaxonomyNodeSeed[];
  tags: TaxonomyNodeSeed[];
}): StoryDraft {
  const bits: string[] = [];

  if (params.dte) {
    bits.push(pickAlias(params.dte));
  }

  for (const intent of params.intents) {
    bits.push(pickAlias(intent));
  }

  for (const tag of params.tags) {
    bits.push(`Also, ${pickAlias(tag).replace(/^[A-Z]/, (m) => m.toLowerCase())}.`);
  }

  if (bits.length === 0) {
    bits.push("My father passed away and we need help with next steps.");
  }

  return {
    text: bits.join(" "),
    userLocation: null,
    eventLocation: null,
  };
}

async function generateStoryWithAi(params: {
  openai: OpenAI;
  model: string;
  locale: string;
  dte: TaxonomyNodeSeed | null;
  intents: TaxonomyNodeSeed[];
  tags: TaxonomyNodeSeed[];
}): Promise<StoryDraft | null> {
  const { openai, model, locale, dte, intents, tags } = params;

  const anchors: Array<{ key: string; kind: NodeKind; name: string; aliases: string[] }> = [];
  if (dte) anchors.push({ key: dte.key, kind: "DTE", name: dte.name, aliases: dte.aliases.slice(0, 3) });
  for (const i of intents) anchors.push({ key: i.key, kind: "INTENT", name: i.name, aliases: i.aliases.slice(0, 3) });
  for (const t of tags) anchors.push({ key: t.key, kind: "TAG", name: t.name, aliases: t.aliases.slice(0, 3) });

  const prompt = `Create one realistic user intake story for bereavement planning.

Return strict JSON only:
{
  "story": "1-3 natural language sentences a real user might type",
  "locations": {
    "user": { "city": string, "state": string } | null,
    "event": { "city": string, "state": string } | null
  }
}

Constraints:
- Locale: ${locale}
- Use these anchors semantically (do not mention keys):
${JSON.stringify(anchors, null, 2)}
- Unless pet/animal is explicitly present in anchors, keep human context.
- Keep wording grounded, plain, and emotionally realistic.
- Mention location only if natural.`;

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You generate realistic first-person user stories for classifier training." },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      story?: string;
      locations?: {
        user?: { city?: string; state?: string } | null;
        event?: { city?: string; state?: string } | null;
      };
    };

    if (!parsed.story || typeof parsed.story !== "string") return null;

    return {
      text: parsed.story.trim(),
      userLocation: parsed.locations?.user ?? null,
      eventLocation: parsed.locations?.event ?? null,
    };
  } catch {
    return null;
  }
}

async function main() {
  const options = parseArgs();

  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URI } },
  });

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const openai = options.withAi && process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

  console.log("Generating story-based parse training JSONL...");
  console.log(`  locale=${options.locale}`);
  console.log(`  stories=${options.stories}`);
  console.log(`  withAi=${Boolean(openai)}`);

  const [taxonomyRows, actions] = await Promise.all([
    prisma.taxonomyNode.findMany({
      where: {
        isActive: true,
        kind: { in: [TaxonomyKind.DTE, TaxonomyKind.INTENT, TaxonomyKind.TAG] },
      },
      select: {
        key: true,
        kind: true,
        name: true,
        metadata: true,
        aliases: {
          select: { label: true },
          take: 8,
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.action.findMany({
      where: { isActive: true },
      select: { intentKey: true, dependsOnIntentKeys: true },
    }),
  ]);

  const actionByIntent = new Map<string, ActionRow>();
  for (const row of actions) {
    if (!actionByIntent.has(row.intentKey)) actionByIntent.set(row.intentKey, row);
  }

  const nodes: TaxonomyNodeSeed[] = taxonomyRows
    .map((row) => {
      const kind = toNodeKind(row.kind);
      if (!kind) return null;
      return {
        key: row.key,
        kind,
        name: row.name,
        metadata: (row.metadata as Record<string, unknown> | null) ?? null,
        aliases: row.aliases.map((a) => a.label),
      } satisfies TaxonomyNodeSeed;
    })
    .filter((n): n is TaxonomyNodeSeed => n !== null);

  const dtes = nodes.filter((n) => n.kind === "DTE");
  const intents = nodes.filter((n) => n.kind === "INTENT");
  const tags = nodes.filter((n) => n.kind === "TAG");

  if (intents.length === 0) {
    throw new Error("No INTENT taxonomy nodes found. Cannot generate training data.");
  }

  const rows: JsonlRow[] = [];
  let aiStoryCount = 0;
  let fallbackStoryCount = 0;

  for (let i = 0; i < options.stories; i++) {
    const chooseDte = dtes.length > 0 && Math.random() < 0.75;
    const dte = chooseDte ? sampleOne(dtes) : null;

    const intentCount = Math.max(1, randInt(options.maxIntents) + 1);
    const pickedIntents = sampleMany(intents, intentCount);
    const tagCount = tags.length > 0 && Math.random() < 0.5 ? randInt(options.maxTags + 1) : 0;
    const pickedTags = sampleMany(tags, tagCount);

    const trainingNodes: TrainingNode[] = [];
    if (dte) {
      trainingNodes.push({ key: dte.key, kind: "DTE", confidence: 0.95 });

      const meta = dte.metadata ?? {};
      const inferred = Array.isArray(meta.intentKeys)
        ? meta.intentKeys.filter((v): v is string => typeof v === "string").slice(0, options.maxDteInferredIntents)
        : [];
      for (const key of inferred) {
        trainingNodes.push({ key, kind: "INTENT", confidence: 0.81 });
      }
    }

    for (const intent of pickedIntents) {
      trainingNodes.push({ key: intent.key, kind: "INTENT", confidence: 0.93 });
      const dep = actionByIntent.get(intent.key)?.dependsOnIntentKeys?.[0];
      if (dep) {
        trainingNodes.push({ key: dep, kind: "INTENT", confidence: 0.79 });
      }
    }

    for (const tag of pickedTags) {
      trainingNodes.push({ key: tag.key, kind: "TAG", confidence: 0.88 });
    }

    const story = openai
      ? await generateStoryWithAi({
        openai,
        model,
        locale: options.locale,
        dte,
        intents: pickedIntents,
        tags: pickedTags,
      })
      : null;

    if (story) {
      aiStoryCount++;
      rows.push(
        rowFromStory({
          locale: options.locale,
          story,
          nodes: uniqueNodes(trainingNodes),
        }),
      );
      continue;
    }

    fallbackStoryCount++;
    rows.push(
      rowFromStory({
        locale: options.locale,
        story: buildFallbackStory({ dte, intents: pickedIntents, tags: pickedTags }),
        nodes: uniqueNodes(
          trainingNodes.map((n) => ({
            ...n,
            confidence: clampConfidence(n.confidence - 0.03),
          })),
        ),
      }),
    );
  }

  const outputPath = resolve(process.cwd(), options.out);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");

  console.log("Done.");
  console.log(`  nodesLoaded=${nodes.length} (dte=${dtes.length}, intent=${intents.length}, tag=${tags.length})`);
  console.log(`  rowsWritten=${rows.length}`);
  console.log(`  aiStories=${aiStoryCount}`);
  console.log(`  fallbackStories=${fallbackStoryCount}`);
  console.log(`  output=${outputPath}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Failed to generate training JSONL", err);
  process.exit(1);
});
