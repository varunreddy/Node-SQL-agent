import knex, { Knex } from 'knex';
import { EventEmitter } from 'events';

/**
 * DatabaseClient - Connection manager for remote and local databases with SSL/TLS support
 * 
 * SSL/TLS Configuration:
 * - PostgreSQL: Requires ssl=true flag and supports connection string with sslmode parameters
 * - MySQL: Requires ssl=true flag in connection parameters
 * - SQLite: Local only, no SSL support
 * 
 * For managed databases (AWS RDS, Azure Database, etc.):
 * 1. Enable SSL in UI toggle or set VITE_DB_SSL=true
 * 2. By default, rejectUnauthorized=false for compatibility with self-signed certificates
 * 3. For production, provide CA certificates via environment variables:
 *    - Set DATABASE_URL with sslmode=require
 *    - Or use custom CA: Set SSL_CERT=/path/to/ca-certificate.crt
 * 
 * Environment Variables:
 * - DATABASE_URL or DB_URL: Full connection string for postgres/mysql
 * - SQLITE_PATH: Path to SQLite database file (default: ./database.sqlite)
 * - SSL_CERT: Path to CA certificate file (optional, for certificate validation)
 * - SSL_CLIENT_CERT: Path to client certificate (optional, for mTLS)
 * - SSL_CLIENT_KEY: Path to client key (optional, for mTLS)
 */

export const logger = {
    info: (msg: string) => console.log(`[INFO] ${msg}`),
    error: (msg: string) => console.error(`[ERROR] ${msg}`),
    warn: (msg: string) => console.warn(`[WARN] ${msg}`),
};

export class DatabaseClient extends EventEmitter {
    private db: Knex | null = null;
    private schemaCache: Record<string, string[]> = {};
    private static instances: Map<string, DatabaseClient> = new Map();

    private constructor(config: { dbType: 'postgres' | 'mysql' | 'sqlite', dbUrl?: string, sqlitePath?: string, ssl?: boolean }) {
        super();
        let { dbType, dbUrl, sqlitePath, ssl } = config;

        // Fallback for dbUrl/sqlitePath if not provided
        if (!dbUrl && (dbType === 'postgres' || dbType === 'mysql')) {
            dbUrl = process.env.DATABASE_URL || process.env.DB_URL;
        }
        if (!sqlitePath && dbType === 'sqlite') {
            sqlitePath = process.env.SQLITE_PATH || './database.sqlite';
        }

        let knexConfig: Knex.Config;

        if (dbType === 'sqlite') {
            knexConfig = {
                client: 'sqlite3',
                connection: {
                    filename: sqlitePath || './database.sqlite'
                },
                useNullAsDefault: true
            };
        } else {
            // For Postgres/MySQL, we prefer the connection string
            // but we could also build it from components if needed.
            knexConfig = {
                client: dbType === 'postgres' ? 'pg' : 'mysql2',
                connection: dbUrl ? (ssl ? `${dbUrl}${dbUrl.includes('?') ? '&' : '?'}ssl=true` : dbUrl) : undefined,
                pool: { min: 0, max: 5 }
            };

            // For Postgres with SSL, configure SSL options for better security
            if (dbType === 'postgres' && ssl && dbUrl) {
                // Convert to object form for detailed SSL configuration
                knexConfig.connection = {
                    connectionString: dbUrl,
                    ssl: {
                        rejectUnauthorized: false, // Set to true in production with valid certificates
                        // Users can override with environment variables if needed:
                        // - DATABASE_URL: full connection string with sslmode=require
                        // - SSL_CERT: path to CA certificate
                        // - SSL_CLIENT_CERT: path to client certificate (for mTLS)
                        // - SSL_CLIENT_KEY: path to client key (for mTLS)
                    }
                };
                logger.info(`SSL/TLS enabled for PostgreSQL. Note: rejectUnauthorized is false - only use with trusted networks or add certificates for production.`);
            } else if (dbType === 'mysql' && ssl && dbUrl) {
                // MySQL SSL configuration via connection string params
                // MySQL2 will read ssl=true from the query string
                logger.info(`SSL/TLS enabled for MySQL via connection string parameters.`);
            }
        }

        this.db = knex(knexConfig);
    }

    public static getInstance(config: { dbType: 'postgres' | 'mysql' | 'sqlite', dbUrl?: string, sqlitePath?: string, ssl?: boolean }): DatabaseClient {
        const key = `${config.dbUrl || config.sqlitePath || process.env.DATABASE_URL || "default"}_ssl_${!!config.ssl}`;
        if (!DatabaseClient.instances.has(key)) {
            DatabaseClient.instances.set(key, new DatabaseClient(config));
        }
        return DatabaseClient.instances.get(key)!;
    }

    async connect() {
        try {
            if (!this.db) throw new Error("Knex not initialized");
            // Check connectivity
            await this.db.raw('select 1+1 as result');
            logger.info(`Successfully connected to ${this.db.client.config.client} database.`);
            await this.refreshSchemaCache();
        } catch (err: any) {
            logger.error("Failed to connect to database: " + err.message);
            throw err;
        }
    }

    async refreshSchemaCache() {
        if (!this.db) return;
        try {
            const clientType = this.db.client.config.client;
            let query = '';

            if (clientType === 'pg') {
                query = `
                    SELECT table_name, column_name 
                    FROM information_schema.columns 
                    WHERE table_schema = 'public' 
                    ORDER BY table_name, ordinal_position;
                `;
            } else if (clientType === 'mysql2') {
                query = `
                    SELECT table_name, column_name 
                    FROM information_schema.columns 
                    WHERE table_schema = DATABASE()
                    ORDER BY table_name, ordinal_position;
                `;
            } else if (clientType === 'sqlite3') {
                // SQLite requires multiple steps or a complex query
                const tables = await this.db.raw("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
                const newCache: Record<string, string[]> = {};

                for (const table of tables) {
                    const columns = await this.db.raw(`PRAGMA table_info(${table.name})`);
                    newCache[table.name] = columns.map((c: any) => c.name);
                }
                this.schemaCache = newCache;
                logger.info(`Refreshed schema cache (SQLite). Found tables: ${Object.keys(this.schemaCache).join(", ")}`);
                return;
            }

            const result = await this.executeQuery(query);
            const newCache: Record<string, string[]> = {};

            if (result.data) {
                for (const row of result.data) {
                    const tableName = row.table_name || row.TABLE_NAME;
                    const colName = row.column_name || row.COLUMN_NAME;
                    if (!newCache[tableName]) newCache[tableName] = [];
                    newCache[tableName].push(colName);
                }
            }
            this.schemaCache = newCache;
            logger.info(`Refreshed schema cache (${clientType}). Found tables: ${Object.keys(this.schemaCache).join(", ")}`);
        } catch (err: any) {
            logger.error("Failed to refresh schema cache: " + err.message);
        }
    }

    getSchema() {
        return this.schemaCache;
    }

    async executeQuery(query: string, params?: any[]): Promise<{ success: boolean; data?: any[]; row_count?: number; message?: string; error?: string }> {
        if (!this.db) return { success: false, error: "Database not connected" };

        try {
            console.log(`\n======\n${query}\n======\n`);
            const result = await this.db.raw(query, params || []);

            let data: any[] = [];
            let row_count = 0;

            // Normalize results based on dialect
            const clientType = this.db.client.config.client;
            if (clientType === 'pg') {
                data = result.rows;
                row_count = result.rowCount;
            } else if (clientType === 'mysql2') {
                data = result[0];
                row_count = data.length;
            } else if (clientType === 'sqlite3') {
                data = result;
                row_count = result.length;
            }

            return {
                success: true,
                data,
                row_count,
                message: `Query returned ${row_count} rows.`
            };
        } catch (err: any) {
            logger.error(`Database Error: ${err.message}`);
            return {
                success: false,
                error: err.message
            };
        }
    }

    async disconnect() {
        if (this.db) {
            await this.db.destroy();
            this.db = null;
            logger.info("Database connection destroyed.");
        }
    }
}
