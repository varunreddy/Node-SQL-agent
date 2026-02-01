import { StateGraph, END, Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import type { DatabaseStep, DatabaseSummary } from "./types";
import {
    plannerNode,
    databaseDecider,
    scopeReflectorNode,
    policyNode,
    executorNode,
    finalizerNode
} from "./nodes";

// --- State Definition ---

const GraphState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    user_context: Annotation<any>({
        reducer: (x, y) => y ?? x,
        default: () => undefined,
    }),
    planner_output: Annotation<any>({
        reducer: (x, y) => y ?? x,
        default: () => undefined,
    }),
    current_step: Annotation<DatabaseStep | null>({
        reducer: (x, y) => y ?? x,
        default: () => null,
    }),
    execution_log: Annotation<string[]>({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    completed_steps: Annotation<DatabaseStep[]>({
        reducer: (x, y) => y ?? x, // Logic kept as separate nodes handle full list update or we can change to concat
        default: () => [],
    }),
    database_summary: Annotation<DatabaseSummary | null>({
        reducer: (x, y) => y ?? x,
        default: () => null,
    }),
    step_count: Annotation<number>({
        reducer: (x, y) => y ?? x,
        default: () => 0,
    }),
    max_steps: Annotation<number>({
        reducer: (x, y) => y ?? x,
        default: () => 10,
    }),
    recommended_tools: Annotation<any[]>({
        reducer: (x, y) => y ?? x,
        default: () => [],
    }),
    config: Annotation<any>({
        reducer: (x, y) => y ?? x,
        default: () => undefined,
    })
});

// --- Conditions ---

function routeDecider(state: typeof GraphState.State) {
    if (state.current_step) {
        return "scope_reflector";
    }
    return "finalizer";
}

function routePolicy(state: typeof GraphState.State) {
    /**
     * Route based on policy decision:
     * - "approved" -> execute immediately
     * - "denied" due to low confidence -> back to DECIDER for replanning
     * - "denied" due to policy violation -> finalizer (hard stop)
     */
    const currentStep = state.current_step;
    if (!currentStep) {
        return "finalizer";
    }
    
    if (currentStep.status === "approved") {
        return "executor";
    }
    
    // Denied - check reason
    const policyDecision = currentStep.policy_decision;
    const reason = policyDecision?.reason || "";
    
    // If denied due to confidence (low confidence threshold), trigger REPLANNING
    if (reason.includes("Confidence score") || reason.toLowerCase().includes("confidence")) {
        console.log("[POLICY ROUTER] Confidence-based rejection -> Routing back to DECIDER for REPLANNING");
        return "decider";
    }
    
    // Other policy violations = hard stop
    return "finalizer";
}

function routeExecutor(state: typeof GraphState.State) {
    if (state.database_summary) {
        return "finalizer";
    }
    return "decider";
}

// --- Graph ---

export function buildDatabaseGraph() {
    const workflow = new StateGraph(GraphState)
        .addNode("planner", plannerNode)
        .addNode("decider", databaseDecider)
        .addNode("scope_reflector", scopeReflectorNode)
        .addNode("policy", policyNode)
        .addNode("executor", executorNode)
        .addNode("finalizer", finalizerNode)
        .setEntryPoint("planner");

    workflow.addEdge("planner", "decider");

    workflow.addConditionalEdges(
        "decider",
        routeDecider,
        { scope_reflector: "scope_reflector", finalizer: "finalizer" }
    );

    workflow.addEdge("scope_reflector", "policy");

    workflow.addConditionalEdges(
        "policy",
        routePolicy,
        { executor: "executor", decider: "decider", finalizer: "finalizer" }
    );

    workflow.addConditionalEdges(
        "executor",
        routeExecutor,
        { decider: "decider", finalizer: "finalizer" }
    );

    workflow.addEdge("finalizer", END);

    return workflow.compile();
}

import { HumanMessage } from "@langchain/core/messages";
// ... imports ...

export async function runDatabaseAgent(userRequest: string) {
    const graph = buildDatabaseGraph();
    const result = await graph.invoke({
        messages: [new HumanMessage(userRequest)],
        execution_log: [],
        completed_steps: [],
        step_count: 0,
        max_steps: 10,
        recommended_tools: []
    });

    // Result is typed broadly, checking output
    return result.database_summary;
}
