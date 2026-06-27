/**
 * Generic weighted lead-scoring helper.
 *
 * prompts.ts's calculateLeadScore(industry, responses) is driven by a fixed
 * per-industry PROMPT_TEMPLATES table and cannot accept arbitrary weights
 * (and per this build's constraints, prompts.ts cannot be modified). Once a
 * tenant has an industry_agents-derived `agent_config.lead_score_weights`
 * (or a Prompt-Architect-generated one), scoring should use those weights
 * instead of the static table. This is the same weighted-average algorithm
 * as prompts.ts's calculateLeadScore, just parameterized on a weights map
 * instead of an industry lookup, so both agent.ts and the update_lead tool
 * can share one implementation instead of duplicating it.
 */
export function calculateWeightedLeadScore(
  weights: Record<string, number | { weight: number; required?: boolean }>,
  responses: Record<string, any>
): { score: number; missingRequired: string[] } {
  let score = 0;
  let totalWeight = 0;
  const missingRequired: string[] = [];

  for (const [key, criterion] of Object.entries(weights || {})) {
    const weight = typeof criterion === 'number' ? criterion : criterion?.weight ?? 0;
    const required = typeof criterion === 'object' ? !!criterion?.required : false;
    totalWeight += weight;

    if (responses[key] !== undefined && responses[key] !== null && responses[key] !== '') {
      score += weight;
    } else if (required) {
      missingRequired.push(key);
    }
  }

  const finalScore = totalWeight > 0 ? Math.round((score / totalWeight) * 100) : 0;
  return { score: finalScore, missingRequired };
}
