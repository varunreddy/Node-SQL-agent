import { Pool, PoolClient, QueryResult } from 'pg';
import { EventEmitter } from 'events';

export const logger = {
    info: (msg: string) => console.log(`[INFO] ${msg}`),
    error: (msg: string) => console.error(`[ERROR] ${msg}`),
    warn: (msg: string) => console.warn(`[WARN] ${msg}`),
};

export class DatabaseClient extends EventEmitter {
    private pool: Pool;
    private client: PoolClient | null = null;
    private inTransaction: boolean = false;
    private schemaCache: Record<string, string[]> = {};

    private static instances: Map<string, DatabaseClient> = new Map();

    private constructor(connectionString?: string) {
        super();
        // Default to a dummy connection string or env variable if not provided
        const connStr = connectionString || process.env.DATABASE_URL || "postgres://user:password@localhost:5432/postgres";

        this.pool = new Pool({
            connectionString: connStr,
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        this.pool.on('error', (err) => {
            logger.error('Unexpected error on idle client: ' + err.message);
        });
    }

    public static getInstance(connectionString?: string): DatabaseClient {
        const key = connectionString || process.env.DATABASE_URL || "default";
        if (!DatabaseClient.instances.has(key)) {
            DatabaseClient.instances.set(key, new DatabaseClient(connectionString));
        }
        return DatabaseClient.instances.get(key)!;
    }

    async connect() {
        // Basic connectivity check
        try {
            const client = await this.pool.connect();
            client.release();
            logger.info("Successfully connected to database pool.");
            await this.refreshSchemaCache();
        } catch (err: any) {
            logger.error("Failed to connect to database: " + err.message);
        }
    }

    async refreshSchemaCache() {
        try {
            const query = `
        SELECT table_name, column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        ORDER BY table_name, ordinal_position;
      `;
            const result = await this.executeQuery(query);

            const newCache: Record<string, string[]> = {};
            if (result.data) {
                for (const row of result.data) {
                    const tableName = row.table_name;
                    const colName = row.column_name;
                    if (!newCache[tableName]) {
                        newCache[tableName] = [];
                    }
                    newCache[tableName].push(colName);
                }
            }
            this.schemaCache = newCache;
            logger.info(`Refreshed schema cache. Found tables: ${Object.keys(this.schemaCache).join(", ")}`);
        } catch (err: any) {
            logger.error("Failed to refresh schema cache: " + err.message);
        }
    }

    getSchema() {
        return this.schemaCache;
    }

    async executeQuery(query: string, params?: any[]): Promise<{ success: boolean; data?: any[]; rowCount?: number; message?: string; error?: string }> {
        const start = Date.now();
        let client = this.client;
        let release = false;

        try {
            if (!client) {
                client = await this.pool.connect();
                release = true;
            }

            console.log(`\n======\n${query}\n======\n`);

            const result: QueryResult = await client.query(query, params);

            const duration = Date.now() - start;
            // logger.info(`Query executed in ${duration}ms`);

            return {
                success: true,
                data: result.rows,
                rowCount: result.rowCount || 0,
                message: `Query returned ${result.rowCount} rows.`
            };

        } catch (err: any) {
            logger.error(`Database Error: ${err.message}`);
            return {
                success: false,
                error: err.message
            };
        } finally {
            if (release && client) {
                client.release();
            }
        }
    }

    async beginTransaction() {
        if (this.inTransaction) {
            throw new Error("Transaction already in progress");
        }
        this.client = await this.pool.connect();
        await this.client.query('BEGIN');
        this.inTransaction = true;
        logger.info("Transaction started.");
        return { success: true, message: "Transaction started." };
    }

    async commitTransaction() {
        if (!this.inTransaction || !this.client) {
            throw new Error("No active transaction to commit");
        }
        try {
            await this.client.query('COMMIT');
            logger.info("Transaction committed.");
            return { success: true, message: "Transaction committed." };
        } finally {
            this.client.release();
            this.client = null;
            this.inTransaction = false;
        }
    }

    async rollbackTransaction() {
        if (!this.inTransaction || !this.client) {
            throw new Error("No active transaction to rollback");
        }
        try {
            await this.client.query('ROLLBACK');
            logger.info("Transaction rolled back.");
            return { success: true, message: "Transaction rolled back." };
        } finally {
            this.client.release();
            this.client = null;
            this.inTransaction = false;
        }
    }
}
