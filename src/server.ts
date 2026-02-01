import express from 'express';
import cors from 'cors';
import path from 'path';
import { DatabaseClient } from './agent/components/database/databaseClient';
import * as dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());



app.post('/api/execute-sql', async (req, res) => {
    const { query, config } = req.body;
    if (!query) return res.status(400).json({ error: "Query is required" });

    try {
        const client = DatabaseClient.getInstance({
            dbType: config?.dbType || 'postgres',
            dbUrl: config?.dbUrl,
            sqlitePath: config?.sqlitePath,
            ssl: config?.ssl || false
        });
        const result = await client.executeQuery(query);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/get-schema', async (req, res) => {
    const { config } = req.body;
    try {
        const client = DatabaseClient.getInstance({
            dbType: config?.dbType || 'postgres',
            dbUrl: config?.dbUrl,
            sqlitePath: config?.sqlitePath,
            ssl: config?.ssl || false
        });
        await client.connect();
        const schema = client.getSchema();
        res.json(schema);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
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

