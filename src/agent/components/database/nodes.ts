import { getLLM, invokeLLM } from "../../core/llmFactory";
import { DatabaseSubState, DatabaseStep, DatabaseSummary, ScopeAssessment } from "./types";
import { DatabaseClient, logger } from "./databaseClient";
import { ScopeAssessmentSchema, NextStepDecisionSchema, NextStepDecision } from "./schema";
import { z } from "zod";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import * as fs from 'fs';
import * as path from 'path';

// --- Policy Validator ---

export interface PolicyDecision {
    approved: boolean;
    decision_type: "allowed" | "denied" | "requires_approval";
    reason: string;
}

export class PolicyValidator {
    validateAction(action: { tool: string, parameters: any }, context: any, scope?: ScopeAssessment): PolicyDecision {
        const toolName = action.tool;

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
    try {
        const registryPath = path.join(process.cwd(), "src/agent/core/tools/registry/database_tools.json");
        if (fs.existsSync(registryPath)) {
            const content = fs.readFileSync(registryPath, 'utf-8');
            const data = JSON.parse(content);
            return data.tools || [];
        }
    } catch (e) {
        logger.warn(`Failed to load database tools registry: ${e}`);
    }
    // Fallback if file missing (though we just created it)
    return [];
}

import { AgentConfig } from "./types";

async function reflectOnQuery(
    toolName: string,
    toolParams: any,
    userRequest: string,
    plannerOutput: any,
    history: any[],
    config?: AgentConfig
): Promise<ScopeAssessment> {
    // ... (rest of reflectOnQuery is same, I will keep it in next chunk or assume it's there)
    // Actually I should replace the whole file content to be safe or use chunks carefully.
    // I will just add the class and imports in this chunk at the top.

    // Quick circuit breaker for schema reading
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

    // Construct description logic similar to Python
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

    // Prepare Planner Context
    let plannerContext = "";
    if (plannerOutput) {
        plannerContext = `
        PLANNER CONSTRAINTS (MUST SATISFY):
        - Operation: ${plannerOutput.operation}
        - Entities: ${plannerOutput.entities}
        - Measure: ${plannerOutput.measure}
        - Filter/Constraint: ${plannerOutput.constraint}
        - Interpretation Note: ${plannerOutput.interpretation_note}
        
        Example Check:
        If interpretation_note says "Interpreting skew as z-score", verify the SQL actually calculates (val - avg) / stddev.
        If operation='per_entity_argmax', query MUST use a Window Function (ROW_NUMBER) or correlated subquery.
        `;
    }

    // Prepare History Context
    let historyContext = "";
    if (history && history.length > 0) {
        historyContext = `
        RECENT EXECUTION HISTORY (PREVIOUS 2 STEPS):
        ${JSON.stringify(history, null, 2)}
        
        CRITICAL REVIEWS:
        - If the previous step failed (status='failed'), does this new action FIX the error?
        - If the previous step was a bad query, is this one better?
        - If the agent is repeating the same mistake, lower the Confidence Score.
        `;
    }

    const llm = getLLM({ jsonMode: true, config: config?.llmConfig });

    const prompt = `
    You are an Expert Database Administrator (DBA) and Query Optimizer.
    
    User Request: "${userRequest}"
    ${plannerContext}
    ${historyContext}
    
    Proposed Action (Tool: ${toolName}):
    ${description}
    
    Analyze this action deeply.
    
    1. **Risk & Destructiveness**: Is it changing data? Is it dropping tables?
    2. **Performance & Quality**:
       - Are there unbounded joins?
       - Cartesian products (comma-joins without WHERE)?
       - \`SELECT *\` on massive tables?
       - Redundant sorting?
       - **Postgres Specific**: \`ROUND()\` requires \`NUMERIC\` types. If using window functions like \`CUME_DIST()\` or \`PERCENT_RANK()\` (which return double precision), you MUST cast to numeric before rounding: \`ROUND(CAST(... AS NUMERIC), 2)\`.
       - **Math Safety**: Check for integer division (e.g. \`count/total\` where both are ints). Check for potential division by zero (use \`NULLIF\`).
       - **Cost Exemption**: If Planner operation is \`sequential_analysis\` or \`statistical_analysis\`, scans/Window Functions are NECESSARY. Do NOT flag them as "Performance Issues" unless they are visibly redundant.
    3. **Intent Alignment**: Does this query actually answer what the user asked? 
    4. **Planner Verification**: 
       - If constraints exist, does the SQL satisfy them? 
       - Score from 0.0 (Irrelevant) to 1.0 (Perfect Match). 
       - Create a checklist of requirements.
    
    Determine:
    - Summary: Brief description.
    - Risk Level: Low (reads), Medium (writes), High (DDL/Destructive).
    - Op Type: read/write/ddl/schema.
    - Complexity: 1 (Simple) to 10 (Very Complex).
    - Performance Issues: List any.
    - Optimization Suggestions: List any.
    - Alignment: Critique the logic vs the user prompt.
    - Confidence: 0.0-1.0 (Semantic Correctness Score). 
       * CRITICAL: If the SQL satisfies planner constraints (e.g. valid 'per_entity_argmax'), Confidence MUST be > 0.9, EVEN IF Complexity is High/10.
       * Do not penalize score for "performance" or "complexity". Only penalize for wrong logic.
    - Checklist: { "requirement": true/false }
    
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

        // --- PROGRAMMATIC OVERRIDE ---
        if (data.requirements_checklist && typeof data.requirements_checklist === 'object') {
            const values = Object.values(data.requirements_checklist);
            if (values.length > 0 && values.every(v => v === true)) {
                logger.info("Reflector Overriding Confidence: Planning constraints met. Boosting to 0.96.");
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
    if (state.planner_output) return {}; // Run once

    const userRequest = state.messages[0].content as string;
    const llm = getLLM({ jsonMode: true, config: state.config?.llmConfig });

    const prompt = `
    You are a SQL Query Planner. Your job is to analyze the SEMANTICS of a user request to determine the correct architectural approach for SQL generation.
    
    User Request: "${userRequest}"
    
    You must detect architectural patterns:
    
    1. **"Per-Entity Argmax"**:
       - Signs: "Show top X users and their favorite category", "most common error for each service"
       - Set \`operation\`: "per_entity_argmax"
       - Set \`constraint\`: "Requires Window Functions (ROW_NUMBER) or correlated subqueries."
       
    2. **"Statistical Analysis"**:
       - Signs: "skew", "distribution", "variance", "deviation", "correlation", "z-score", "percentile"
       - Set \`operation\`: "statistical_analysis"
       - Set \`constraint\`: "Use canonical statistical functions (STDDEV, AVG OVER(), PERCENT_RANK)."
       - **CRITICAL**: Detect ambiguity. If user says "skew of revenue", they might mean "skewness over time" or "deviation from mean".
       - Set \`interpretation_note\`: Explicitly state your interpretation, e.g., "Interpreting 'skew' as deviation from the mean (z-score) across the dataset."

    3. **"Sequential/Temporal Analysis"**:
       - Signs: "stopped", "churned", "first", "last", "after", "before", "sequence", "then"
       - Set \`operation\`: "sequential_analysis"
       - Set \`constraint\`: "MUST use Window Functions."
       
    4. **"Trend/Acceleration Analysis"**:
       - Signs: "accelerated", "increasing", "declining", "worsened", "improved", "growth"
       - Set \`operation\`: "sequential_analysis" (it is a subtype of sequence)
       - **Detect Trend Strength** (\`trend_mode\`):
         - \`any_occurrence\`: "Did it happen at least once?" (Weakest)
         - \`net_positive\`: "Did it increase more than it decreased?" (Standard default for 'growth'/'acceleration')
         - \`monotonic\`: "Did it ALWAYS increase?" (Strictest, e.g. "consistently increasing")
       - Set \`trend_mode\` accordingly. Default to \`net_positive\` if ambiguous to avoid weak results.
       - Set \`interpretation_note\`: "Interpreting 'acceleration' as net positive trend (more up-months than down-months)."

    5. **Standard**:
       - Simple filtering, simple aggregation, or global ordering.
       - Set \`operation\`: "standard"
    
    Return ONLY a valid JSON object.
    {
        "entities": "...",
        "measure": "...",
        "secondary_attribute": "...",
        "operation": "standard" | "per_entity_argmax" | "statistical_analysis" | "sequential_analysis",
        "trend_mode": "any_occurrence" | "net_positive" | "monotonic" | null,
        "constraint": "...",
        "reasoning": "...",
        "interpretation_note": "..."
    }
    `;

    const response = await invokeLLM(llm, prompt);
    let plan = {};
    try {
        plan = JSON.parse(response);
    } catch (e) {
        plan = { error: "Failed to parse plan", operation: "standard" };
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
    const plannerOutput = state.planner_output;

    // Get tools - Match Python Logic
    let recommendedTools = state.recommended_tools || [];
    if (recommendedTools.length === 0) {
        recommendedTools = getDatabaseTools();
        // If registry also empty (shouldn't happen), optional fallback or empty list
        if (recommendedTools.length === 0) {
            // Minimal fallback only if file read failed entirely
            recommendedTools = [
                { "name": "execute_sql", "description": "Execute raw SQL", "parameters": { "type": "object", "properties": { "query": { "type": "string" } }, "required": ["query"] } },
                { "name": "get_schema", "description": "Get schema", "parameters": { "type": "object", "properties": {}, "required": [] } }
            ];
        }
    }

    // Prepare history with truncation logic similar to Python
    const history = completedSteps.map(s => {
        let resultPreview = s.result;
        // Truncate large result sets
        if (resultPreview && typeof resultPreview === 'object' && Array.isArray(resultPreview.data)) {
            if (resultPreview.data.length > 5) {
                resultPreview = {
                    ...resultPreview,
                    data: resultPreview.data.slice(0, 5),
                    note: `... ${resultPreview.data.length - 5} more rows truncated ...`
                };
            }
        }
        return {
            tool: s.tool_name,
            params: s.tool_parameters,
            status: s.status,
            scope_feedback: s.scope_assessment,
            result: resultPreview
        };
    });

    // OPTIMIZATION: Sliding Window
    const recentHistory = history.slice(-3);

    const llm = getLLM({ jsonMode: true, config: state.config?.llmConfig });

    const prompt = `
    You are a Database Management Engine.
    User Request: ${userRequest}
    
    Available Tools:
    ${JSON.stringify(recommendedTools, null, 2)}
    
    Execution History (Last 3 Steps):
    ${JSON.stringify(recentHistory, null, 2)}
    
    Strategies:
    1. **Schema First**: If you don't know the exact table/column names, call \`get_schema\` first.
    2. **Lookups**: If the user asks for "Pop", "Rock", or "Jane", do NOT guess identifiers. SELECT from \`genres\`, \`users\`, etc., to find the ID first.
    3. **Complex Joins**: For queries like "Top artists by genre", you likely need to join \`artists\` -> \`albums\` -> \`tracks\` -> \`genres\`. Check the schema for Foreign Keys (e.g., \`ArtistId\`, \`AlbumId\`, \`GenreId\`).
    4. **Empty Results**: If a valid SQL query returns 0 rows, do NOT assume it's an error. Trust your SQL. If the data isn't there (e.g., "Films before 2005" when all films are 2006), just say "No results found" and finish. Do NOT retry endlessly.
    5. **Error Recovery**: If a step failed (status='failed'), analyze the error message. Check for common issues like \`UndefinedColumn\` (did you use an alias that doesn't exist?) or syntax errors. Do not retry the exact same query. Adjust your SQL based on the error.
    6. **Scope Feedback**: If \`Confidence Score\` is < 0.9, look at \`performance_issues\` and \`user_intent_alignment\` in the ASSESSMENT. Fix the specific problems mentioned. For example, if it says 'Cartesian product', add a WHERE clause.
    7. **Math Safety**:
       - **Integer Division**: In Postgres, \`1/2\` = \`0\`. CAST at least one operand: \`CAST(col AS NUMERIC) / 2\`.
       - **Division by Zero**: Use \`NULLIF(denominator, 0)\` to avoid errors: \`numerator / NULLIF(denominator, 0)\`.
       - **Rounding**: \`ROUND()\` requires numeric types. Cast float results before rounding: \`ROUND(CAST(val AS NUMERIC), 2)\`.
    8. **Statistical Analysis**:
       - If Planner says 'statistical_analysis', usage of Window Functions is almost guaranteed.
       - **Z-Score**: \`(value - AVG(value) OVER()) / NULLIF(STDDEV(value) OVER(), 0)\`
       - **Percentile**: \`PERCENT_RANK() OVER (ORDER BY value)\`
       - **Interpretation**: Refer to the Planner's \`interpretation_note\` to ensure you are calculation the right metric (e.g. deviation vs skewness).
    9. **Sequential/Lifecycle Analysis** (e.g. "Stopped after 3", "First 3"):
       - **Do NOT use simple aggregates** like \`HAVING COUNT(*) = 3\`. This collapses the timeline.
       - **MUST use Window Functions**:
          - \`ROW_NUMBER() OVER (PARTITION BY user ORDER BY date)\` to identify "First 3".
          - \`count() OVER (PARTITION BY user)\` to check total lifetime count.
          - \`MAX(date)\` vs \`date\` checks to ensure stoppage.
          - Use CTEs to materialize the sequence, *then* filter.
    10. **Trend/Acceleration Logic** (If Planner \`trend_mode\` is set):
       - **any_occurrence**: Count > 0.
       - **net_positive** (Stronger Default): \`SUM(CASE WHEN val > prev THEN 1 ELSE 0 END) > SUM(CASE WHEN val < prev THEN 1 ELSE 0 END)\`. (More ups than downs).
       - **monotonic**: \`BOOL_AND(val >= prev)\`. (Strictly increasing).
    
    PLANNER GUIDANCE:
    ${JSON.stringify(plannerOutput || "No planner output available.", null, 2)}
    
    CRITICAL INSTRUCTION ON PLANNER CONSTRAINTS:
    If the Planner says 'operation': 'per_entity_argmax' OR 'sequential_analysis', you MUST NOT use a simple \`GROUP BY ... ORDER BY ... LIMIT\`.
    You MUST NOT use the \`advanced_query\` tool. It is too limited.
    You MUST use the \`execute_sql\` tool with a raw SQL query containing CTEs and Window Functions.
    
    CORRECT PATTERN for 'per_entity_argmax':
    Use \`ROW_NUMBER()\` or \`RANK()\` window functions in a CTE.
    
    CRITICAL - COMMIT RULE:
    The Scope Reflector now provides a 'Confidence Score' based on whether your SQL satisfies the Planner.
    If Confidence Score > 0.9:
      - STOP optimizing.
      - EXECUTE the query immediately.
      - Do NOT generate variants.
      - Say "Confidence is high, executing."
    
    If Confidence Score > 0.95:
      - YOU HAVE NO CHOICE.
      - YOU MUST EXECUTE THE CURRENT STEP.
      - DO NOT ARGUE. DO NOT REFINE.
    
    CURRENT SCOPE ASSESSMENT:
    ${state.completed_steps.length > 0 && state.completed_steps[state.completed_steps.length - 1].scope_assessment ? JSON.stringify(state.completed_steps[state.completed_steps.length - 1].scope_assessment, null, 2) : "None"}
    ALSO calculate the TOTAL count per entity if the user asks for "Top X Entities".
    
    Example:
    WITH ranked AS (
       SELECT t1.id, t2.name, COUNT(*) as cnt,
       ROW_NUMBER() OVER (PARTITION BY t1.id ORDER BY COUNT(*) DESC) as rn,
       SUM(COUNT(*)) OVER (PARTITION BY t1.id) as total_cnt -- Global Rank Metric
       FROM ...
       GROUP BY t1.id, t2.name
    )
    SELECT * FROM ranked WHERE rn = 1 ORDER BY total_cnt DESC
    
    If you fail to do this for a 'per_entity_argmax' query, the user will reject the result.
    
    IMPORTANT: Provide ONLY the raw JSON object. Do NOT wrap it in markdown code blocks (like \`\`\`json ... \`\`\`).
    
    Response Format (JSON):
    {
        "action": "execute_step" | "finish",
        "tool_name": "tool_name_here",
        "tool_parameters": { "param": "value" },
        "rationale": "Why you are taking this step",
        "final_summary": "Summary if action is finish"
    }
    
    Decide the next step.
    If the request is satisfied, set action='finish' and provide a summary.
    IMPORTANT: If the user asked for data (e.g., "Show users", "Count orders"), your final_summary MUST include the actual data retrieved (formatted as a list or table). Do not just say "Displayed data". Show the data.
    - If the result is a list of entities (e.g. customers, films), format it as a bulleted list: "- Name (ID: 123)".
    - Avoid raw JSON arrays unless specifically asked for.
    If you need to execute a SQL query, set action='execute_step', tool_name='execute_sql', and tool_parameters={'query': 'YOUR SQL HERE'}.
    If you need to check the database structure, set action='execute_step', tool_name='get_schema', and tool_parameters={}.
    
    CRITICAL: Do NOT call any tools/functions natively. You must output a valid JSON object string.
    `;

    try {
        const response = await invokeLLM(llm, prompt);
        let decision = JSON.parse(response) as NextStepDecision;

        // Basic validation/fallback
        if (!decision.action) decision.action = "finish";

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

        // Return updated state AND the loaded tools so next iteration has them
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

    // Extract History for Context (Sliding Window of 3)
    const completedSteps = state.completed_steps || [];
    const history = completedSteps.map(s => {
        let resultPreview = s.result;
        if (resultPreview && typeof resultPreview === 'object' && Array.isArray(resultPreview.data)) {
            if (resultPreview.data.length > 5) {
                resultPreview = {
                    ...resultPreview,
                    data: resultPreview.data.slice(0, 5),
                    note: `... ${resultPreview.data.length - 5} more rows truncated for brevity ...`
                };
            }
        }
        return {
            tool: s.tool_name,
            params: s.tool_parameters,
            status: s.status,
            scope_feedback: s.scope_assessment,
            result: resultPreview
        };
    });
    const recentHistory = history.slice(-3);

    const assessment = await reflectOnQuery(
        currentStep.tool_name,
        currentStep.tool_parameters,
        state.messages[0].content as string,
        state.planner_output,
        recentHistory,
        state.config
    );

    const updatedStep = { ...currentStep, scope_assessment: assessment };

    return {
        current_step: updatedStep,
        execution_log: [...state.execution_log, `[SCOPE] ${assessment.summary} (Conf: ${assessment.confidence_score})`]
    };
}

export async function policyNode(state: DatabaseSubState): Promise<Partial<DatabaseSubState>> {
    const currentStep = state.current_step;
    const userContext = state.user_context;
    // Default context if missing (e.g. CLI usage)
    const context = userContext || { user_id: "cli_user", roles: ["admin"] };

    if (!currentStep) return {};

    const validator = new PolicyValidator();
    const decision = validator.validateAction(
        { tool: currentStep.tool_name, parameters: currentStep.tool_parameters },
        context,
        currentStep.scope_assessment || undefined
    );

    const updatedStep = {
        ...currentStep,
        status: decision.approved ? "approved" : ("denied" as any), // Type cast if needed
        policy_decision: { approved: decision.approved, reason: decision.reason }
    } as DatabaseStep;

    return {
        current_step: updatedStep,
        execution_log: [...state.execution_log, `Policy: ${decision.decision_type} - ${decision.reason}`]
    };
}

export async function executorNode(state: DatabaseSubState): Promise<Partial<DatabaseSubState>> {
    const currentStep = state.current_step;
    if (!currentStep || currentStep.status !== "approved") return {};

    const client = DatabaseClient.getInstance(state.config?.dbUrl);

    let result: any = null;
    let status: DatabaseStep["status"] = "completed";

    try {
        const toolName = currentStep.tool_name;
        const params = currentStep.tool_parameters;

        if (toolName === "execute_sql") {
            const query = params.query;
            if (!query) throw new Error("Missing 'query' parameter for execute_sql");
            result = await client.executeQuery(query);
        } else if (toolName === "get_schema") {
            await client.connect();
            result = client.getSchema();
        } else if (toolName === "list_tables") {
            // Deprioritize usage but keep for backward compat if LLM insists
            await client.connect();
            const schema = client.getSchema();
            result = { tables: Object.keys(schema) };
        } else if (["create_table", "insert_record", "read_data", "update_record", "delete_record", "advanced_query"].includes(toolName)) {
            // Stub for tools not yet fully implemented in Node.js executor
            // Ideally we'd map these to SQL manually, but for now we error gracefully so Decider knows
            result = { error: `Tool '${toolName}' is defined in registry but not yet implemented in Node.js executor. Please use 'execute_sql' instead.` };
            status = "failed";
        } else {
            result = { error: `Unknown tool ${toolName}` };
            status = "failed";
        }
    } catch (e: any) {
        result = { error: e.message };
        status = "failed";
    }

    const completedStep: DatabaseStep = {
        ...currentStep,
        status: status,
        result: result
    };

    return {
        current_step: null,
        completed_steps: [...state.completed_steps, completedStep],
        execution_log: [...state.execution_log, `Executed ${currentStep.tool_name}`]
    };
}

export async function finalizerNode(state: DatabaseSubState): Promise<Partial<DatabaseSubState>> {
    if (state.database_summary) return {};

    // Check for denial being the cause of finish
    const currentStep = state.current_step;
    if (currentStep && currentStep.status === "denied") {
        const reason = currentStep.policy_decision?.reason || "Denied";
        return {
            database_summary: {
                summary_text: `Action blocked by policy: ${reason}`,
                actions_taken: state.completed_steps.map(s => s.description),
                status: "blocked"
            }
        };
    }

    return {
        database_summary: {
            summary_text: "Workflow ended unexpectedly.",
            actions_taken: state.completed_steps.map(s => s.description),
            status: "partial"
        }
    };
}
