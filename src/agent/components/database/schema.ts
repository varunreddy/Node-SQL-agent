import { z } from "zod";

export const NextStepDecisionSchema = z.object({
    action: z.enum(["execute_step", "finish"]),
    tool_name: z.string().optional(),
    tool_parameters: z.record(z.string(), z.any()).optional(),
    rationale: z.string().optional().default("No rationale provided"),
    final_summary: z.string().optional(),
});

export type NextStepDecision = z.infer<typeof NextStepDecisionSchema>;

export const ScopeAssessmentSchema = z.object({
    confidence_score: z.number().min(0).max(1),
    complexity_score: z.number().min(0).max(10),
    risk_level: z.enum(["low", "medium", "high"]),
    summary: z.string(),
    requirements_checklist: z.array(z.string()),
    performance_issues: z.array(z.string()).optional(),
    user_intent_alignment: z.string(),
});
