export type Profile = {
  id: string; fullName: string; bio: string; institution: string; department: string;
  location: string; interests: string[]; updatedAt: string | null; learningSkillsPublic: boolean; avatarUrl: string;
};
export type SkillEntry = {
  id: string; kind: "teach" | "learn"; name: string; category: string;
  experienceLevel: "Beginner" | "Intermediate" | "Advanced"; description: string;
  createdAt: string; updatedAt: string; instructionLanguage: string;
};
export type FieldErrors = Record<string, string>;
export async function readApi<T>(response: Response): Promise<T & { error?: string; errors?: FieldErrors }> {
  return await response.json() as T & { error?: string; errors?: FieldErrors };
}
export const skillCategories = ["Technology", "Design", "Creative arts", "Business", "Languages", "Science", "Education", "Wellness", "Music", "Other"];
export const experienceLevels = ["Beginner", "Intermediate", "Advanced"] as const;
export const languages = ["English", "Tamil", "Hindi", "Telugu", "Malayalam", "Kannada", "Bengali", "Marathi", "Urdu", "French", "Spanish", "German", "Japanese", "Korean", "Mandarin", "Other"] as const;
