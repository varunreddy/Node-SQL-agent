import { getLLM, invokeLLM } from "../../core/llmFactory";
import type { DatabaseSubState, DatabaseStep, ScopeAssessment } from "./types";
import type { NextStepDecision } from "./schema";
import databaseTools from "../../core/tools/registry/database_tools.json";

const logger = {
    info: (msg: string) => console.log(`[INFO] ${msg}`),
    error: (msg: string) => console.error(`[ERROR] ${msg}`),
    warn: (msg: string) => console.warn(`[WARN] ${msg}`),
};

// --- Policy Validator ---

export interface PolicyDecision {
    approved: boolean;
    decision_type: "allowed" | "denied" | "requires_approval";
    reason: string;
}

export class PolicyValidator {
    validateAction(action: { tool: string, parameters: any }, context: any, scope?: ScopeAssessment): PolicyDecision {

        // Use scope if available
        if (scope) {
            if (scope.is_destructive || scope.risk_level === "high") {
                if (!context.roles.includes("admin")) {
                    return {
                        approved: false,
                        decision_type: "denied",
                        reason: `Destructive/High-risk operation detected (${scope.operation_type}) and requires 'admin'.`
                    };
                }
            }
        }

        // Fallback to Regex if no scope
        const parameters = action.parameters || {};
        const query = (parameters.query || "").trim().toUpperCase();

        if (query.includes("DROP") || query.includes("DELETE")) {
            if (!context.roles.includes("admin")) {
                return {
                    approved: false,
                    decision_type: "denied",
                    reason: "Destructive operations (DROP/DELETE) require 'admin' role."
                };
            }
        }

        // Read-only check
        if (context.roles.includes("readonly") && !context.roles.includes("admin")) {
            if (scope && scope.operation_type !== "read" && scope.operation_type !== "schema") {
                return {
                    approved: false,
                    decision_type: "denied",
                    reason: "Read-only users cannot modify data."
                };
            }
            // Fallback regex
            if (["INSERT", "UPDATE", "CREATE", "ALTER"].some(op => query.includes(op))) {
                return {
                    approved: false,
                    decision_type: "denied",
                    reason: "Read-only users cannot modify data."
                };
            }
        }

        return {
            approved: true,
            decision_type: "allowed",
            reason: "Operation allowed by default policy."
        };
    }
}

// --- Helper Functions ---

function getDatabaseTools(): any[] {
    return (databaseTools as any).tools || [];
}

import type { AgentConfig } from "./types";

async function reflectOnQuery(
    toolName: string,
    toolParams: any,
    userRequest: string,
    plannerOutput: any,
    history: any[],
    config?: AgentConfig
): Promise<ScopeAssessment> {
    if (toolName === "get_schema") {
        return {
            summary: "Reading database schema.",
            risk_level: "low",
            complexity_score: 1,
            confidence_score: 1.0,
            requirements_checklist: {},
            user_intent_alignment: "Preparing to answer user request by inspecting schema.",
            performance_issues: [],
        } as ScopeAssessment;
    }

    let description = `Tool: ${toolName}`;
    if (toolName === "execute_sql") {
        description = `SQL Query: ${toolParams.query || ''}`;
        const sqlLower = (toolParams.query || '').toLowerCase();
        if (plannerOutput && plannerOutput.operation === "sequential_analysis") {
            if (!sqlLower.includes("order by") && !sqlLower.includes("over")) {
                description += "\n[WARNING: Planner requested Sequential/Temporal Analysis, but SQL lacks 'ORDER BY' or Window Functions! This is likely a Semantic Failure.]";
            }
        }
    } else if (toolName === "advanced_query") {
        description = `Complex Query: Tables=${toolParams.tables}, Joins=${toolParams.joins}, Aggregates=${toolParams.aggregates}`;
    } else {
        description = `Tool ${toolName} with params ${JSON.stringify(toolParams)}`;
    }

    let plannerContext = "";
    if (plannerOutput) {
        plannerContext = `
        PLANNER CONSTRAINTS (MUST SATISFY):
        - Operation: ${plannerOutput.operation}
        - Entities: ${plannerOutput.entities}
        - Measure: ${plannerOutput.measure}
        - Filter/Constraint: ${plannerOutput.constraint}
        - Interpretation Note: ${plannerOutput.interpretation_note}
        `;
    }

    let historyContext = "";
    if (history && history.length > 0) {
        historyContext = `
        RECENT EXECUTION HISTORY (PREVIOUS 2 STEPS):
        ${JSON.stringify(history, null, 2)}
        `;
    }

    const dbType = config?.dbType || 'postgres';
    const llm = getLLM({ jsonMode: true, config: config?.llmConfig });

    const prompt = `
    You are an Expert Database Administrator (DBA) and Query Optimizer.
    Current Database Dialect: ${dbType}
    
    User Request: "${userRequest}"
    ${plannerContext}
    ${historyContext}
    
    Proposed Action (Tool: ${toolName}):
    ${description}
    
    Analyze this action deeply based on ${dbType} syntax and best practices.
    
    1. **Risk & Destructiveness**: Is it changing data? Is it dropping tables?
    2. **Performance & Quality**:
       - Are there unbounded joins?
       - Cartesian products (comma-joins without WHERE)?
       - **Math Safety**: Check for integer division and potential division by zero.
       - **Dialect Specifics**: 
         - Postgres: ROUND() requires NUMERIC. Window functions are common.
         - MySQL: Limit/Offset syntax.
         - SQLite: Limited mathematical functions. PRAGMA for schema.
    3. **Intent Alignment**: Does this query actually answer what the user asked? 
    4. **Planner Verification**: Does the SQL satisfy the Planner constraints?
    
    RESPONSE FORMAT (JSON ONLY):
    {
        "summary": "...",
        "risk_level": "low" | "medium" | "high",
        "operation_type": "read" | "write" | "ddl" | "schema",
        "tables_involved": ["..."],
        "is_destructive": true | false,
        "complexity_score": 1-10,
        "performance_issues": ["..."],
        "optimization_suggestions": ["..."],
        "user_intent_alignment": "...",
        "confidence_score": 0.95,
        "requirements_checklist": { "per_entity_argmax": true, "correct_filters": true }
    }
    `;

    try {
        const response = await invokeLLM(llm, prompt);
        const data = JSON.parse(response);

        if (data.requirements_checklist && typeof data.requirements_checklist === 'object') {
            const values = Object.values(data.requirements_checklist);
            if (values.length > 0 && values.every(v => v === true)) {
                data.confidence_score = 0.96;
            }
        }

        return data as ScopeAssessment;
    } catch (e) {
        logger.error(`Reflector failed: ${e}`);
        return {
            summary: "Analysis failed",
            risk_level: "high",
            complexity_score: 10,
            confidence_score: 0.0,
            requirements_checklist: {},
            user_intent_alignment: "Unknown",
            performance_issues: ["Reflector Failed"]
        } as ScopeAssessment;
    }
}

// --- Nodes ---

export async function plannerNode(state: DatabaseSubState): Promise<Partial<DatabaseSubState>> {
    if (state.planner_output) return {};

    const userRequest = state.messages[0].content as string;
    const llm = getLLM({ jsonMode: true, config: state.config?.llmConfig });

    const prompt = `
    You are a SQL Query Planner. Analyze the user request.
    User Request: "${userRequest}"
    Detect patterns: per_entity_argmax, statistical_analysis, sequential_analysis, standard.
    Return JSON: { "entities": "...", "measure": "...", "operation": "...", "constraint": "...", "interpretation_note": "..." }
    `;

    const response = await invokeLLM(llm, prompt);
    let plan = {};
    try {
        plan = JSON.parse(response);
    } catch (e) {
        plan = { operation: "standard" };
    }

    return { planner_output: plan };
}

export async function databaseDecider(state: DatabaseSubState): Promise<Partial<DatabaseSubState>> {
    const stepCount = state.step_count || 0;

    if (stepCount >= (state.max_steps || 10)) {
        return {
            current_step: null,
            database_summary: {
                summary_text: "Max steps reached.",
                actions_taken: state.completed_steps.map(s => s.description),
                status: "partial"
            }
        };
    }

    const messages = state.messages;
    const userRequest = messages[0].content;
    const completedSteps = state.completed_steps || [];

    let recommendedTools = state.recommended_tools || [];
    if (recommendedTools.length === 0) {
        recommendedTools = getDatabaseTools();
    }

    const history = completedSteps.map(s => {
        let resultPreview = s.result;
        if (resultPreview && typeof resultPreview === 'object' && Array.isArray(resultPreview.data)) {
            if (resultPreview.data.length > 5) {
                resultPreview = { ...resultPreview, data: resultPreview.data.slice(0, 5), note: "truncated" };
            }
        }
        return { tool: s.tool_name, params: s.tool_parameters, status: s.status, result: resultPreview };
    });

    // OPTIMIZATION: Sliding Window for Decider Context
    // Only show the last 3 steps to avoid context explosion / rate limits.
    // We need slightly more context to understand patterns and self-correct.
    const recentHistory = history.slice(-3);
    const dbType = state.config?.dbType || 'postgres';
    const llm = getLLM({ jsonMode: true, config: state.config?.llmConfig });

    // Check for REFINEMENT FEEDBACK (from Policy Gate rejection)
    let refinementContext = "";
    let isReplanning = false;
    if (messages.length > 1) {
        const latestMsg = messages[messages.length - 1];
        const msgContent = typeof latestMsg.content === 'string' ? latestMsg.content : '';
        if (msgContent && msgContent.includes("[SCOPE REFLECTION FEEDBACK")) {
            isReplanning = true;
            refinementContext = `

    ╔══════════════════════════════════════════════════════════════════╗
    ║                 🚨 REPLANNING MODE ACTIVATED 🚨                  ║
    ╚══════════════════════════════════════════════════════════════════╝
    
    YOUR PREVIOUS QUERY WAS REJECTED. You MUST generate an IMPROVED query.
    
    ${msgContent}
    
    ═══════════════════════════════════════════════════════════════════
    MANDATORY: Generate a DIFFERENT, IMPROVED query that fixes the issues.
    DO NOT resubmit the same query - it WILL be rejected again.
    ═══════════════════════════════════════════════════════════════════
    `;
        }
    }

    const replanningNote = isReplanning
        ? "IMPORTANT: You are in REPLANNING mode. Your previous query was rejected. Read the feedback above carefully and submit an IMPROVED query."
        : "";

    const prompt = `
    You are a Database Management Engine.
    Current Database Dialect: ${dbType}
    User Request: ${userRequest}
    ${refinementContext}
    Available Tools: ${JSON.stringify(recommendedTools)}
    Execution History: ${JSON.stringify(recentHistory)}
    ${replanningNote}
    
    Strategies:
    1. Dialect Awareness: Use ${dbType} syntax.
    2. Schema First: Call get_schema if needed.
    3. Math Safety: NULLIF for division by zero.
    4. Self-Correction: If Execution History contains a "failed" step, analyze the error and try a different/corrected query.
    ${isReplanning ? "5. REPLANNING: Address ALL issues listed in the feedback above. Do NOT repeat the rejected query." : ""}
    
    Response Format (JSON):
    {
        "action": "execute_step" | "finish",
        "tool_name": "...",
        "tool_parameters": { ... },
        "rationale": "...",
        "final_summary": "..."
    }
    `;


    try {
        const response = await invokeLLM(llm, prompt);
        let decision = JSON.parse(response) as NextStepDecision;

        if (decision.action === "finish") {
            return {
                current_step: null,
                database_summary: {
                    summary_text: decision.final_summary || "Completed",
                    actions_taken: completedSteps.map(s => s.description),
                    status: "success"
                }
            };
        }

        const nextStep: DatabaseStep = {
            description: decision.rationale || "Executing Step",
            tool_name: decision.tool_name || "unknown",
            tool_parameters: decision.tool_parameters || {},
            status: "pending"
        };

        return {
            current_step: nextStep,
            step_count: stepCount + 1,
            recommended_tools: recommendedTools
        };
    } catch (e) {
        return {
            database_summary: {
                summary_text: `Error in decider: ${e}`,
                actions_taken: [],
                status: "failed"
            }
        };
    }
}

export async function scopeReflectorNode(state: DatabaseSubState): Promise<Partial<DatabaseSubState>> {
    const currentStep = state.current_step;
    if (!currentStep) return {};

    // OPTIMIZATION: Sliding Window for Scope Reflection
    // Only show the last 3 steps to avoid context explosion and reduce token usage.
    // We need slightly more context to understand patterns and self-correct.
    const recentHistory = state.completed_steps.slice(-3);

    const assessment = await reflectOnQuery(
        currentStep.tool_name,
        currentStep.tool_parameters,
        state.messages[0].content as string,
        state.planner_output,
        recentHistory,
        state.config
    );

    return {
        current_step: { ...currentStep, scope_assessment: assessment },
        execution_log: [...state.execution_log, `[SCOPE] ${assessment.summary}`]
    };
}

export async function policyNode(state: DatabaseSubState): Promise<Partial<DatabaseSubState>> {
    const currentStep = state.current_step;
    if (!currentStep) return {};

    // --- EXEMPTION: Informational and prerequisite tools bypass confidence checks ---
    // These are tools that:
    // 1. Only read metadata/schema (no data modification risk)
    // 2. Are prerequisite steps needed to plan the actual query
    // 3. Cannot meaningfully "satisfy user intent" on their own (they're helper steps)
    const EXEMPT_TOOLS = [
        "get_schema",      // Schema inspection - prerequisite for query planning
        "read_data",       // Read-only data inspection
        "list_tables",     // Table enumeration
        "describe_table",  // Column/type inspection
        "get_table_info",  // Table metadata
        "show_tables",     // MySQL-style table listing
        "pragma_table_info" // SQLite table info
    ];

    if (EXEMPT_TOOLS.includes(currentStep.tool_name)) {
        console.log(`[POLICY] Tool '${currentStep.tool_name}' is exempt from confidence checks (informational/prerequisite).`);
        return {
            current_step: {
                ...currentStep,
                status: "approved",
                policy_decision: {
                    approved: true,
                    reason: `Tool '${currentStep.tool_name}' is exempt from confidence filtering (informational/prerequisite step).`
                }
            } as DatabaseStep,
            execution_log: [...state.execution_log, `[POLICY] ${currentStep.tool_name} approved (exempt tool)`]
        };
    }

    // --- Confidence Threshold Filter ---
    // Only execute steps with confidence > 0.95 unless explicitly overridden
    const assessment = currentStep.scope_assessment;
    const CONFIDENCE_THRESHOLD = 0.95;

    if (assessment && assessment.confidence_score <= CONFIDENCE_THRESHOLD) {
        // Low confidence - TRIGGER AUTOMATIC REPLANNING
        console.warn(`[CONFIDENCE CHECK] Step confidence ${assessment.confidence_score} <= ${CONFIDENCE_THRESHOLD} - Triggering REPLANNING.`);

        // Build refinement prompt for the decider with full context of rejected step
        const issuesText = (assessment.performance_issues && assessment.performance_issues.length > 0)
            ? assessment.performance_issues.map(issue => `  - ${issue}`).join('\n')
            : '  (See optimization suggestions below)';

        const suggestionsText = (assessment.optimization_suggestions && assessment.optimization_suggestions.length > 0)
            ? assessment.optimization_suggestions.map(sug => `  - ${sug}`).join('\n')
            : '  (None provided)';

        // Include the rejected query/action for full context
        const rejectedActionContext = currentStep.tool_name === 'execute_sql'
            ? `REJECTED SQL QUERY:\n\`\`\`sql\n${currentStep.tool_parameters.query || '(no query)'}\n\`\`\``
            : `REJECTED ACTION: ${currentStep.tool_name}\nParameters: ${JSON.stringify(currentStep.tool_parameters, null, 2)}`;

        const refinementMessage = `
[SCOPE REFLECTION FEEDBACK - REPLANNING REQUIRED]

=== CONFIDENCE SCORE: ${assessment.confidence_score.toFixed(2)} (Threshold: ${CONFIDENCE_THRESHOLD}) ===

${rejectedActionContext}

=== ISSUES DETECTED ===
${issuesText}

=== OPTIMIZATION SUGGESTIONS ===
${suggestionsText}

=== ALIGNMENT ASSESSMENT ===
${assessment.user_intent_alignment}

=== TABLES INVOLVED ===
${(assessment.tables_involved || []).join(', ') || 'Unknown'}

=== RISK LEVEL ===
${assessment.risk_level} (Complexity: ${assessment.complexity_score}/10)

CRITICAL INSTRUCTIONS:
1. Analyze the issues above and understand why the query was rejected.
2. Generate a NEW, IMPROVED query that addresses ALL the listed issues.
3. Do NOT submit the same query - it WILL be rejected again.
4. Focus on the optimization suggestions provided.
`;

        console.warn(`Refinement Feedback:\n${refinementMessage}`);

        const { HumanMessage } = await import("@langchain/core/messages");
        const refinementMsg = new HumanMessage({ content: refinementMessage });

        return {
            current_step: {
                ...currentStep,
                status: "denied",
                policy_decision: {
                    approved: false,
                    reason: `Confidence score ${assessment.confidence_score.toFixed(2)} is below ${CONFIDENCE_THRESHOLD} threshold. Triggering replanning.`,
                    refinement_feedback: refinementMessage,
                    issues: assessment.performance_issues,
                    suggestions: assessment.optimization_suggestions || []
                }
            } as DatabaseStep,
            messages: [...state.messages, refinementMsg],
            execution_log: [...state.execution_log, `[SCOPE GATE] Rejected with confidence ${assessment.confidence_score.toFixed(2)}. Triggering REPLANNING with feedback.`]
        };
    }

    const validator = new PolicyValidator();
    const decision = validator.validateAction(
        { tool: currentStep.tool_name, parameters: currentStep.tool_parameters },
        state.user_context || { roles: ["admin"] },
        currentStep.scope_assessment || undefined
    );

    return {
        current_step: {
            ...currentStep,
            status: decision.approved ? "approved" : "denied",
            policy_decision: { approved: decision.approved, reason: decision.reason }
        } as DatabaseStep,
        execution_log: [...state.execution_log, `Policy: ${decision.reason}`]
    };
}

export async function executorNode(state: DatabaseSubState): Promise<Partial<DatabaseSubState>> {
    const currentStep = state.current_step;
    if (!currentStep || currentStep.status !== "approved") return {};

    let result: any = null;
    let status: DatabaseStep["status"] = "completed";

    try {
        const toolName = currentStep.tool_name;
        const params = currentStep.tool_parameters;

        if (toolName === "execute_sql") {
            const response = await fetch('/api/execute-sql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: params.query, config: state.config })
            });
            result = await response.json();
        } else if (toolName === "get_schema") {
            const response = await fetch('/api/get-schema', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: state.config })
            });
            result = await response.json();
        } else {
            result = { error: `Unknown tool ${toolName}` };
            status = "failed";
        }

        if (result && result.error) {
            status = "failed";
        }
    } catch (e: any) {
        result = { error: e.message };
        status = "failed";
    }

    return {
        current_step: null,
        completed_steps: [...state.completed_steps, { ...currentStep, status, result }],
        execution_log: [...state.execution_log, status === "failed" ? `[ERROR] ${result?.error || 'Unknown error'}` : `Executed ${currentStep.tool_name}`]
    };
}

export async function finalizerNode(state: DatabaseSubState): Promise<Partial<DatabaseSubState>> {
    const completed = state.completed_steps;
    const lastStep = completed.length > 0 ? completed[completed.length - 1] : null;

    if (state.database_summary) return {};

    const currentStep = state.current_step;
    if (currentStep && currentStep.status === "denied") {
        return {
            database_summary: {
                summary_text: `Blocked: ${currentStep.policy_decision?.reason}`,
                actions_taken: state.completed_steps.map(s => s.description),
                status: "blocked"
            }
        };
    }

    // Extract result data from the last completed step
    // Handle different result formats from different tools
    let data = undefined;
    let row_count = undefined;
    let summary_text = "Workflow ended.";

    if (lastStep && lastStep.status === "completed" && lastStep.result) {
        const result = lastStep.result;

        // Handle execute_sql results
        if (result.success && result.data) {
            data = result.data;
            row_count = result.row_count;
            summary_text = `Query executed successfully. ${row_count || result.data?.length || 0} rows returned.`;
        }
        // Handle get_schema results - the schema data itself IS the result
        else if (lastStep.tool_name === "get_schema") {
            // Schema could be in result.schema, result.data, or result directly
            if (result.schema) {
                // Format schema data as an array for table display
                data = Object.entries(result.schema).map(([table, columns]) => ({
                    table_name: table,
                    columns: Array.isArray(columns) ? columns.join(', ') : JSON.stringify(columns)
                }));
                summary_text = `Database schema displayed successfully. Found ${Object.keys(result.schema).length} tables.`;
            } else if (result.data) {
                data = result.data;
                summary_text = "Database schema displayed successfully.";
            } else if (typeof result === 'object' && !result.error) {
                // The result itself might be the schema object
                data = Object.entries(result).filter(([k]) => k !== 'success' && k !== 'error').map(([table, columns]) => ({
                    table_name: table,
                    columns: Array.isArray(columns) ? columns.join(', ') : JSON.stringify(columns)
                }));
                if (data.length > 0) {
                    summary_text = `Database schema displayed successfully. Found ${data.length} tables.`;
                } else {
                    // Just pass the raw result
                    data = result;
                    summary_text = "Database schema retrieved.";
                }
            }
        }
        // Handle any other successful result that has data
        else if (result.data) {
            data = result.data;
            row_count = result.row_count || (Array.isArray(result.data) ? result.data.length : undefined);
            summary_text = `Last action: ${lastStep.description}. Task complete.`;
        }
    }

    return {
        database_summary: {
            summary_text: currentStep?.description || summary_text,
            actions_taken: state.completed_steps.map(s => s.description),
            status: lastStep?.status === "failed" ? "failed" : "success",
            data,
            row_count
        }
    };
}
