export type Profile = {
  id: string; fullName: string; bio: string; institution: string; department: string;
  location: string; interests: string[]; updatedAt: string | null; learningSkillsPublic: boolean; avatarUrl: string; profileComplete: boolean;
};
export type SkillEntry = {
  id: string; kind: "teach" | "learn"; name: string; category: string;
  experienceLevel: "Beginner" | "Intermediate" | "Advanced"; description: string;
  createdAt: string; updatedAt: string; instructionLanguage: string;
};
export type FieldErrors = Record<string, string>;
export async function readApi<T>(response: Response): Promise<T & { error?: string; errors?: FieldErrors }> {
  let raw: string;
  try {
    raw = await response.text();
  } catch {
    throw new Error("Could not read the server response. Check your connection and try again.");
  }

  if (!raw.trim()) {
    if (!response.ok) {
      throw new Error(`The server could not complete the request (HTTP ${response.status}). Please try again.`);
    }
    throw new Error("The server returned an empty response. Please try again.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    if (!response.ok) {
      throw new Error(`The server could not complete the request (HTTP ${response.status}). Please try again.`);
    }
    throw new Error("The server returned an unreadable response. Please refresh and try again.");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("The server returned an unexpected response. Please refresh and try again.");
  }
  return payload as T & { error?: string; errors?: FieldErrors };
}
export const skillCategories = ["Technology", "Design", "Creative arts", "Business", "Languages", "Science", "Education", "Wellness", "Music", "Other"];
export const experienceLevels = ["Beginner", "Intermediate", "Advanced"] as const;
export const languages = ["English", "Tamil", "Hindi", "Telugu", "Malayalam", "Kannada", "Bengali", "Marathi", "Urdu", "French", "Spanish", "German", "Japanese", "Korean", "Mandarin", "Other"] as const;
