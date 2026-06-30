export type AdversarialVerificationOutcome = "survived" | "refuted";

export interface AdversarialVerificationAttempt {
  claim_ref: string;
  refutation_tried: string;
  outcome: AdversarialVerificationOutcome;
  evidence: unknown;
}

export interface AdversarialProofVerificationBlock {
  verifier_agent_id: string;
  attempts: AdversarialVerificationAttempt[];
  verdict: AdversarialVerificationOutcome;
  verified_at: string;
  model?: string | null;
  cost_tokens?: number | null;
}

export interface AdversarialProofVerifierInput {
  parentIssue: {
    id: string;
    identifier?: string | null;
    title?: string | null;
  };
  executorAgentId: string;
  verifierAgentId: string;
  proofEnvelope: Record<string, unknown>;
  childArtifacts?: Array<{
    issueId: string;
    identifier?: string | null;
    title?: string | null;
    status?: string | null;
    artifact?: unknown;
  }>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/**
 * Build the task packet for the independent verifier adapter.
 *
 * This is intentionally pure and side-effect free: the caller owns how the packet
 * is delivered to a Hermes/Claude/process adapter. Keeping this function pure
 * lets the default-off closure gate consume the verifier's returned
 * `verification` block without enabling live auto-dispatch or credentials.
 */
export function buildAdversarialProofVerifierPrompt(input: AdversarialProofVerifierInput): string {
  return [
    "You are the independent adversarial verifier for a Paperclip parent-close proof envelope.",
    "Your job is to REFUTE each PASS claim if possible. Be skeptical: a closure only survives if you cannot break it with the provided artifacts/evidence.",
    "Do not execute production/live side effects. Use only the supplied proof envelope and child artifact evidence unless the caller explicitly authorizes more.",
    "Return ONLY JSON with this shape:",
    "{\"verifier_agent_id\": string, \"attempts\": [{\"claim_ref\": string, \"refutation_tried\": string, \"outcome\": \"refuted\"|\"survived\", \"evidence\": string|object}], \"verdict\": \"survived\"|\"refuted\", \"verified_at\": ISO8601 string, \"model\": string|null, \"cost_tokens\": number|null}",
    "Rules:",
    `- verifier_agent_id MUST be ${JSON.stringify(input.verifierAgentId)}.`,
    `- verifier_agent_id MUST NOT equal executorAgentId ${JSON.stringify(input.executorAgentId)}.`,
    "- If any material claim is false, missing, stale, or unsupported, set that attempt outcome to refuted and verdict to refuted.",
    "- If you are uncertain because evidence is missing, default to refuted.",
    "- If all attempted refutations fail, every attempt outcome is survived and verdict is survived.",
    "",
    "Parent issue:",
    JSON.stringify(input.parentIssue, null, 2),
    "",
    "Proof envelope:",
    JSON.stringify(input.proofEnvelope, null, 2),
    "",
    "Child artifacts:",
    JSON.stringify(input.childArtifacts ?? [], null, 2),
  ].join("\n");
}

/**
 * Parse and normalize a verifier adapter JSON response into the v0.2
 * `verification` block consumed by the parent done gate.
 */
export function parseAdversarialProofVerifierResponse(responseText: string): AdversarialProofVerificationBlock {
  const parsed = JSON.parse(responseText) as unknown;
  const record = asRecord(parsed);
  if (!record) throw new Error("adversarial verifier response must be a JSON object");

  const verifierAgentId = typeof record.verifier_agent_id === "string" ? record.verifier_agent_id.trim() : "";
  if (!verifierAgentId) throw new Error("adversarial verifier response missing verifier_agent_id");

  const verdict = record.verdict;
  if (verdict !== "survived" && verdict !== "refuted") {
    throw new Error("adversarial verifier response verdict must be survived or refuted");
  }

  const attemptsRaw = Array.isArray(record.attempts) ? record.attempts : null;
  if (!attemptsRaw || attemptsRaw.length === 0) {
    throw new Error("adversarial verifier response must include at least one attempt");
  }

  const attempts = attemptsRaw.map((attemptRaw, index): AdversarialVerificationAttempt => {
    const attempt = asRecord(attemptRaw);
    if (!attempt) throw new Error(`adversarial verifier attempt ${index} must be an object`);
    const outcome = attempt.outcome;
    if (outcome !== "survived" && outcome !== "refuted") {
      throw new Error(`adversarial verifier attempt ${index} outcome must be survived or refuted`);
    }
    const claimRef = typeof attempt.claim_ref === "string" ? attempt.claim_ref.trim() : "";
    const refutationTried = typeof attempt.refutation_tried === "string" ? attempt.refutation_tried.trim() : "";
    if (!claimRef) throw new Error(`adversarial verifier attempt ${index} missing claim_ref`);
    if (!refutationTried) throw new Error(`adversarial verifier attempt ${index} missing refutation_tried`);
    if (attempt.evidence === undefined || attempt.evidence === null) {
      throw new Error(`adversarial verifier attempt ${index} missing evidence`);
    }
    if (
      (typeof attempt.evidence === "string" && attempt.evidence.trim().length === 0)
      || attempt.evidence === false
      || attempt.evidence === 0
    ) {
      throw new Error(`adversarial verifier attempt ${index} evidence must be non-empty`);
    }
    return {
      claim_ref: claimRef,
      refutation_tried: refutationTried,
      outcome,
      evidence: attempt.evidence,
    };
  });

  if (verdict === "survived" && attempts.some((attempt) => attempt.outcome !== "survived")) {
    throw new Error("adversarial verifier response cannot survive with refuted attempts");
  }

  const verifiedAt = typeof record.verified_at === "string" && record.verified_at.trim().length > 0
    ? record.verified_at.trim()
    : new Date().toISOString();

  return {
    verifier_agent_id: verifierAgentId,
    attempts,
    verdict,
    verified_at: verifiedAt,
    model: typeof record.model === "string" ? record.model : null,
    cost_tokens: typeof record.cost_tokens === "number" && Number.isFinite(record.cost_tokens) ? record.cost_tokens : null,
  };
}
