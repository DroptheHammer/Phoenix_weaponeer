export function readTokens(css?: string): Record<string, string>;
export function readMedia(css?: string): { query: string; tokens: Record<string, string> }[];
export function readPhone(query: string, css?: string): { query: string; tokens: Record<string, string> } | null;
export function hexOf(name: string, tokens?: Record<string, string>): string;
