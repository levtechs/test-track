import type { SkillElo, EstimatedScore } from "@/types";
import { expected } from "@/lib/algorithm/rating";
import {
  RW_OPERATIONAL_TOTAL,
  MATH_OPERATIONAL_TOTAL,
  getSkillWeights,
} from "@/lib/algorithm/sat-blueprint";

const REF_OPERATIONAL_ELO = 1120;

const MODULE2_HARD_ELO_DELTA = 85;
const MODULE2_EASY_ELO_DELTA = -85;

const ROUTING_LOGISTIC_K = 14;
const ROUTING_MID_ACCURACY = 0.56;

const EMPIRICAL_BLEND_SCALE = 5;

const EMPIRICAL_ALPHA = 2;
const EMPIRICAL_BETA = 2;

const RECENT_MS = 7 * 86400000;

const CONF_RECENT_TARGET = 45;
const CONF_COVERAGE_WEIGHT = 0.45;
const CONF_VOLUME_WEIGHT = 0.35;
const CONF_ELO_WEIGHT = 0.2;

export interface ScoreResponseEvent {
  skill: string;
  module: "english" | "math";
  isCorrect: boolean;
  answeredAt: number;
}

export function empiricalRate(correct: number, total: number): number | null {
  if (total <= 0) return null;
  return (correct + EMPIRICAL_ALPHA) / (total + EMPIRICAL_ALPHA + EMPIRICAL_BETA);
}

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function eloSkillProb(skillElo: SkillElo | undefined, moduleRating: number, refElo: number): number {
  const r = skillElo && skillElo.questionCount ? skillElo.rating : moduleRating;
  return expected(r, refElo);
}

function blendedProb(
  pElo: number,
  empiricalCorrect: number,
  empiricalTotal: number,
  eloAttempts: number
): number {
  if (empiricalTotal <= 0) {
    return pElo;
  }
  const pEmp = empiricalRate(empiricalCorrect, empiricalTotal);
  if (pEmp === null) return pElo;
  const w = Math.sqrt(empiricalTotal) / (Math.sqrt(empiricalTotal) + EMPIRICAL_BLEND_SCALE);
  let out = (1 - w) * pElo + w * pEmp;
  const anchor = eloAttempts / (eloAttempts + 40);
  out = (1 - anchor * 0.2) * out + anchor * 0.2 * pElo;
  return out;
}

function splitRecentOlder(
  events: ScoreResponseEvent[],
  nowMs: number
): {
  recent: Map<string, { c: number; t: number }>;
  olderSorted: ScoreResponseEvent[];
} {
  const recent = new Map<string, { c: number; t: number }>();
  const oldList: ScoreResponseEvent[] = [];

  for (const e of events) {
    const inWeek = nowMs - e.answeredAt <= RECENT_MS;
    if (inWeek) {
      const cur = recent.get(e.skill) ?? { c: 0, t: 0 };
      cur.t++;
      if (e.isCorrect) cur.c++;
      recent.set(e.skill, cur);
    } else {
      oldList.push(e);
    }
  }

  oldList.sort((a, b) => a.answeredAt - b.answeredAt);

  return { recent, olderSorted: oldList };
}

/**
 * Prefer last‑week counts; skills with zero recent trials take the earliest slice of older
 * answers up to ⌈blueprint quota for skill⌉.
 */
function empiricalPerSkillMerged(
  weights: Record<string, number>,
  recent: Map<string, { c: number; t: number }>,
  olderSorted: ScoreResponseEvent[]
): Map<string, { correct: number; total: number; recentTrials: number }> {
  const merged = new Map<string, { correct: number; total: number; recentTrials: number }>();

  const skillLists = new Map<string, ScoreResponseEvent[]>();
  for (const e of olderSorted) {
    if (!skillLists.has(e.skill)) skillLists.set(e.skill, []);
    skillLists.get(e.skill)!.push(e);
  }

  for (const skill of Object.keys(weights)) {
    const cap = Math.max(1, Math.ceil(weights[skill]));

    const r = recent.get(skill);
    if (r && r.t > 0) {
      merged.set(skill, { correct: r.c, total: r.t, recentTrials: r.t });
      continue;
    }

    const series = skillLists.get(skill);
    if (series && series.length > 0) {
      const take = Math.min(cap, series.length);
      let tc = 0;
      for (let i = 0; i < take; i++) {
        if (series[i].isCorrect) tc++;
      }
      merged.set(skill, { correct: tc, total: take, recentTrials: 0 });
    } else {
      merged.set(skill, { correct: 0, total: 0, recentTrials: 0 });
    }
  }

  return merged;
}

function expectedRawOperational(
  weights: Record<string, number>,
  skillElos: Record<string, SkillElo> | undefined,
  merged: Map<string, { correct: number; total: number; recentTrials: number }>,
  moduleRating: number,
  module: "english" | "math"
): number {
  const totalOps =
    module === "english" ? RW_OPERATIONAL_TOTAL : MATH_OPERATIONAL_TOTAL;
  const module1Ops = totalOps / 2;

  const pBySkill: Record<string, number> = {};

  for (const skill of Object.keys(weights)) {
    const se = skillElos?.[skill];
    const pEloM1 = eloSkillProb(se, moduleRating, REF_OPERATIONAL_ELO);
    const row = merged.get(skill)!;
    const pBlended = blendedProb(pEloM1, row.correct, row.total, se?.questionCount ?? 0);
    pBySkill[skill] = pBlended;
  }

  let eM1 = 0;
  for (const s of Object.keys(weights)) {
    const qs = weights[s] !== undefined ? weights[s] / 2 : 0;
    eM1 += qs * (pBySkill[s] ?? expected(moduleRating, REF_OPERATIONAL_ELO));
  }

  const acc1 = module1Ops > 0 ? eM1 / module1Ops : 0;
  const pHard = logistic(ROUTING_LOGISTIC_K * (acc1 - ROUTING_MID_ACCURACY));

  let eM2 = 0;
  for (const s of Object.keys(weights)) {
    const qs = weights[s] !== undefined ? weights[s] / 2 : 0;
    const se = skillElos?.[s];
    const row = merged.get(s)!;

    const pHardSkill = blendedProb(
      eloSkillProb(se, moduleRating, REF_OPERATIONAL_ELO + MODULE2_HARD_ELO_DELTA),
      row.correct,
      row.total,
      se?.questionCount ?? 0
    );

    const pEasySkill = blendedProb(
      eloSkillProb(se, moduleRating, REF_OPERATIONAL_ELO + MODULE2_EASY_ELO_DELTA),
      row.correct,
      row.total,
      se?.questionCount ?? 0
    );

    eM2 += qs * (pHard * pHardSkill + (1 - pHard) * pEasySkill);
  }

  return eM1 + eM2;
}

function confidenceScore(params: {
  recentModuleResponses: number;
  skillsTracked: number;
  skillsAnyData: number;
  avgEloN: number;
}): number {
  const vol = Math.min(1, params.recentModuleResponses / CONF_RECENT_TARGET);
  const cov =
    params.skillsTracked > 0 ? Math.min(1, params.skillsAnyData / params.skillsTracked) : 0;
  const elo = Math.min(1, params.avgEloN / 120);
  const score =
    CONF_COVERAGE_WEIGHT * cov + CONF_VOLUME_WEIGHT * vol + CONF_ELO_WEIGHT * elo;
  return Math.round(Math.max(0, Math.min(1, score)) * 100) / 100;
}

function rawOperationalToScaled(expectedCorrect: number, operationalTotal: number): number {
  const frac = operationalTotal > 0 ? Math.max(0, Math.min(1, expectedCorrect / operationalTotal)) : 0;
  const linear = 200 + 600 * frac;
  const roundedTen = Math.round(linear / 10) * 10;
  return Math.max(200, Math.min(800, roundedTen));
}

export function estimateSectionScore(opts: {
  skillElos: Record<string, SkillElo> | undefined;
  module: "english" | "math";
  moduleRating: number;
  responses?: ScoreResponseEvent[];
  nowMs?: number;
}): EstimatedScore {
  const nowMs = opts.nowMs ?? Date.now();
  const weights = getSkillWeights(opts.module);
  const operationalTotal =
    opts.module === "english" ? RW_OPERATIONAL_TOTAL : MATH_OPERATIONAL_TOTAL;

  const filtered =
    opts.responses?.filter(
      (r) => r.module === opts.module && weights[r.skill] !== undefined && weights[r.skill] > 0
    ) ?? [];

  const { recent, olderSorted } = splitRecentOlder(filtered, nowMs);
  const merged = empiricalPerSkillMerged(weights, recent, olderSorted);

  let avgEloN = 0;
  let nSkillElo = 0;
  for (const s of Object.keys(weights)) {
    const n = opts.skillElos?.[s]?.questionCount ?? 0;
    if (n > 0) {
      avgEloN += n;
      nSkillElo++;
    }
  }
  avgEloN = nSkillElo > 0 ? avgEloN / nSkillElo : 0;

  const recentModuleResponses = filtered.filter((e) => nowMs - e.answeredAt <= RECENT_MS).length;

  let skillsAnyData = 0;
  for (const s of Object.keys(weights)) {
    const m = merged.get(s)!;
    const hasElo = (opts.skillElos?.[s]?.questionCount ?? 0) > 0;
    if (m.total > 0 || hasElo) skillsAnyData++;
  }

  const expectedOperational = expectedRawOperational(
    weights,
    opts.skillElos,
    merged,
    opts.moduleRating,
    opts.module
  );

  const score = rawOperationalToScaled(expectedOperational, operationalTotal);
  const frac = operationalTotal > 0 ? expectedOperational / operationalTotal : 0;
  const rawAccuracy = Math.round(Math.max(0, Math.min(1, frac)) * 100) / 100;

  const confidence = confidenceScore({
    recentModuleResponses,
    skillsTracked: Object.keys(weights).length,
    skillsAnyData,
    avgEloN,
  });

  return {
    score,
    confidence,
    rawAccuracy,
    calculatedAt: nowMs,
  };
}

export function estimateTotalScore(
  skillElos: Record<string, SkillElo> | undefined,
  ratings?: { english?: number; math?: number },
  responses?: ScoreResponseEvent[]
): { total: number; english: EstimatedScore; math: EstimatedScore } {
  const english = estimateSectionScore({
    skillElos,
    module: "english",
    moduleRating: ratings?.english ?? 1000,
    responses,
  });
  const math = estimateSectionScore({
    skillElos,
    module: "math",
    moduleRating: ratings?.math ?? 1000,
    responses,
  });
  const total = english.score + math.score;

  return { total, english, math };
}
