import express from 'express';
import cors from 'cors';
import path from 'path';
import { buildDatabaseGraph } from './agent/components/database/graph';
import { HumanMessage } from "@langchain/core/messages";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// API Endpoint
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
            const eventData: any = {};

            if (chunk.database_summary) {
                eventData.type = "result";
                eventData.data = chunk.database_summary;
                res.write(`data: ${JSON.stringify(eventData)}\n\n`);
            } else if (chunk.current_step) {
                const step = chunk.current_step;

                if (step.tool_name === "execute_sql" && step.tool_parameters.query) {
                    res.write(`data: ${JSON.stringify({
                        type: "sql_generated",
                        sql: step.tool_parameters.query,
                        status: step.status,
                        step_id: chunk.step_count
                    })}\n\n`);
                }

                res.write(`data: ${JSON.stringify({
                    type: "thinking",
                    step: step.description,
                    log: chunk.execution_log.slice(-1)[0]
                })}\n\n`);
            } else {
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

// Serve static files from the React app dist folder
const clientDistPath = path.join(process.cwd(), 'client', 'dist');
app.use(express.static(clientDistPath));

// Catch-all route to serve the React app
app.get(/^(?!\/api).*/, (req, res) => {
    // Only serve index.html if it's not an API call
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(clientDistPath, 'index.html'));
    } else {
        res.status(404).json({ error: "API route not found" });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API Endpoint: http://localhost:${PORT}/api/chat`);
});

