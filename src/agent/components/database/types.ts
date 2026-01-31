import { BaseMessage } from "@langchain/core/messages";

export interface DatabaseStep {
    description: string;
    tool_name: string;
    tool_parameters: Record<string, any>;
    status: "pending" | "approved" | "denied" | "completed" | "failed";
    policy_decision?: {
        approved: boolean;
        reason: string;
    } | null;
    result?: any;
    scope_assessment?: ScopeAssessment | null;
}

export interface ScopeAssessment {
    confidence_score: number;
    complexity_score: number;
    risk_level: "low" | "medium" | "high";
    summary: string;
    requirements_checklist: Record<string, boolean>;
    performance_issues?: string[];
    user_intent_alignment: string;
    is_destructive?: boolean;
    operation_type?: string;
}

export interface DatabaseSummary {
    summary_text: string;
    actions_taken: string[];
    status: "success" | "partial" | "failed" | "blocked";
}

export interface UserContext {
    user_id: string;
    roles: string[];
}

export interface PlannerOutput {
    entities?: string | null;
    measure?: string | null;
    secondary_attribute?: string | null;
    operation: "standard" | "per_entity_argmax" | "statistical_analysis" | "sequential_analysis";
    trend_mode?: "any_occurrence" | "net_positive" | "monotonic" | null;
    constraint?: string | null;
    reasoning?: string | null;
    interpretation_note?: string | null;
}

import { LLMConfig } from "../../core/llmFactory";

export interface AgentConfig {
    dbUrl?: string;
    llmConfig?: LLMConfig;
}

export interface DatabaseSubState {
    messages: BaseMessage[];
    user_context?: UserContext;
    config?: AgentConfig;
    planner_output?: any;
    current_step?: DatabaseStep | null;
    execution_log: string[];
    completed_steps: DatabaseStep[];
    database_summary?: DatabaseSummary | null;
    step_count: number;
    max_steps: number;
    recommended_tools: any[];
    [key: string]: any;
}
