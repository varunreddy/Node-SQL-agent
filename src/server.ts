import express from 'express';
import cors from 'cors';
import { buildDatabaseGraph } from './agent/components/database/graph';
import { HumanMessage } from "@langchain/core/messages";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
    const { query, config } = req.body;

    if (!query) {
        return res.status(400).json({ error: "Query is required" });
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const graph = buildDatabaseGraph();

    const inputs = {
        messages: [new HumanMessage(query)],
        execution_log: [],
        completed_steps: [],
        step_count: 0,
        max_steps: 10,
        recommended_tools: [],
        config: config || {} // Pass configuration from frontend
    };

    try {
        const stream = await graph.stream(inputs, { streamMode: "values" });

        for await (const chunk of stream) {
            // Chunk is the full state at each step (because streamMode="values")
            // specific updates might be better processed via "updates" mode, but "values" is easier to debug

            const eventData: any = {};

            if (chunk.database_summary) {
                eventData.type = "result";
                eventData.data = chunk.database_summary;
                res.write(`data: ${JSON.stringify(eventData)}\n\n`);
                // If we have a summary, we are likely done, but let the loop finish naturaly? 
                // graph.stream usually ends after END node.
            } else if (chunk.current_step) {
                // Determine if we are "Thinking" or have "SQL"
                // If step is pending, we are thinking/planning
                const step = chunk.current_step;

                if (step.tool_name === "execute_sql" && step.tool_parameters.query) {
                    // Send SQL update
                    res.write(`data: ${JSON.stringify({
                        type: "sql_generated",
                        sql: step.tool_parameters.query,
                        status: step.status,
                        step_id: chunk.step_count
                    })}\n\n`);
                }

                // Also send general "thinking" state
                res.write(`data: ${JSON.stringify({
                    type: "thinking",
                    step: step.description,
                    log: chunk.execution_log.slice(-1)[0]
                })}\n\n`);
            } else {
                // Initial state or planning
                res.write(`data: ${JSON.stringify({
                    type: "thinking",
                    step: "Planning execution path...",
                    log: "Analyzing request..."
                })}\n\n`);
            }
        }

        res.write(`event: end\ndata: {}\n\n`);
    } catch (error: any) {
        console.error("Streaming error:", error);
        res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
    } finally {
        res.end();
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`API Endpoint: http://localhost:${PORT}/api/chat`);
});
