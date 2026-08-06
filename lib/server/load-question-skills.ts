import type { Firestore } from "firebase-admin/firestore";

/** Batch Firestore `in` lookups (≤10 IDs per query). */
export async function loadQuestionSkillMeta(
  db: Firestore,
  questionIds: string[]
): Promise<Map<string, { skill: string; module: "english" | "math" }>> {
  const map = new Map<string, { skill: string; module: "english" | "math" }>();
  const uniq = [...new Set(questionIds)].filter(Boolean);
  for (let i = 0; i < uniq.length; i += 10) {
    const chunk = uniq.slice(i, i + 10);
    const snap = await db.collection("questions").where("question_id", "in", chunk).get();
    for (const doc of snap.docs) {
      const d = doc.data() as {
        question_id: string;
        skill?: string;
        module?: string;
      };
      if (
        typeof d.skill === "string" &&
        (d.module === "english" || d.module === "math")
      ) {
        map.set(d.question_id, { skill: d.skill, module: d.module });
      }
    }
  }
  return map;
}
