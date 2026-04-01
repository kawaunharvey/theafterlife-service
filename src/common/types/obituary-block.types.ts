export type ObituaryBlock =
  | { type: "PARAGRAPH";    metadata: { text: string } }
  | { type: "SUMMARY";      metadata: { memoryCount: number } }
  | { type: "VIDEO";        metadata: { url: string; thumbnailUrl?: string; captionText?: string; durationMs?: number } }
  | { type: "IMAGE";        metadata: { url: string; altText?: string; captionText?: string } }
  | { type: "AUDIO";        metadata: { url: string; captionText?: string; durationMs?: number } }
  | { type: "QUOTE";        metadata: { text: string; attribution?: string } }
  | { type: "NEWS_ARTICLE"; metadata: { headline: string; url: string; sourceLabel?: string; publishedAt?: string } };
