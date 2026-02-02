# SQL Agent (Node.js/TypeScript)

A powerful, multi-database and multi-LLM SQL assistant built with **Node.js**, **Express**, and **React**. It uses **LangGraph.js** to orchestrate intelligent agents that reason about your database schema, generate optimized SQL queries, and provide analytical summaries—all through a sleek, modern UI.

![SQL Agent](https://img.shields.io/badge/SQL-Agent-8B5CF6?style=for-the-badge&logo=postgresql&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![LangGraph](https://img.shields.io/badge/LangGraph.js-1.1-FF6B6B?style=for-the-badge)

---

## 🌟 Features

### Multi-Database Support
Powered by **Knex.js**, the agent seamlessly supports multiple database engines:
- **PostgreSQL** - Full support with SSL/TLS for secure remote connections
- **MySQL** - Complete MySQL 8+ compatibility
- **SQLite** - Local file-based databases for development and testing

### Multi-LLM Provider Integration
Native integration with leading AI providers:
- **OpenAI (Compatible)** - Works with OpenAI and any OpenAI-compatible API (Groq, OpenRouter, Ollama, Mistral, etc.)
- **Anthropic Claude** - Direct integration with Claude models
- **Google Gemini** - Native Google Generative AI support

### Intelligent Agent Pipeline
The agent uses a sophisticated multi-step reasoning pipeline built with LangGraph.js:

```
┌─────────┐    ┌─────────┐    ┌────────────────┐    ┌────────┐    ┌──────────┐    ┌───────────┐
│ Planner │───▶│ Decider │───▶│ Scope Reflector│───▶│ Policy │───▶│ Executor │───▶│ Finalizer │
└─────────┘    └─────────┘    └────────────────┘    └────────┘    └──────────┘    └───────────┘
```

1. **Planner** - Analyzes user intent and creates a query strategy
2. **Decider** - Determines the next best action based on context
3. **Scope Reflector** - Evaluates query scope, complexity, and risk
4. **Policy** - Validates actions against security policies (confidence thresholds, destructive operation guards)
5. **Executor** - Safely executes approved SQL queries
6. **Finalizer** - Compiles results and generates human-readable summaries

### Modern UI Experience
- **Dark Theme with Glassmorphism** - Vibrant, professional design
- **Real-time Reasoning Visualization** - Watch the agent think step-by-step
- **SQL Syntax Highlighting** - Prism-based code highlighting
- **Query Status Tracking** - Visual indicators for pending, approved, denied, and executed queries
- **Responsive Design** - Works seamlessly on desktop and mobile
- **Configuration Persistence** - Settings saved to localStorage

---

## 🏗️ Architecture

```
SQL-agent-node/
├── src/                          # Backend source code
│   ├── server.ts                 # Express server with API endpoints
│   └── agent/                    # Agent logic
│       ├── core/
│       │   └── llmFactory.ts     # Multi-provider LLM initialization
│       └── components/
│           └── database/
│               ├── graph.ts      # LangGraph state machine
│               ├── nodes.ts      # Agent node implementations
│               ├── types.ts      # TypeScript interfaces
│               ├── schema.ts     # Zod validation schemas
│               └── databaseClient.ts # Knex.js database client
├── client/                       # React frontend (Vite)
│   └── src/
│       ├── App.tsx               # Main application component
│       ├── agent/                # Client-side agent (browser execution)
│       └── index.css             # Tailwind CSS styles
├── package.json                  # Root dependencies (server)
├── vercel.json                   # Vercel deployment config
└── .env                          # Environment variables (create this)
```

---

## 🛠️ Installation

### Prerequisites
- **Node.js** v18+ (v20 recommended)
- **npm** v9+ or **yarn**
- A database (PostgreSQL, MySQL, or SQLite)
- An LLM API key (OpenAI, Anthropic, Google, or compatible provider)

### 1. Clone the Repository
```bash
git clone https://github.com/varunreddy/Node-SQL-agent.git
cd Node-SQL-agent
```

### 2. Install Dependencies
Install dependencies for both the backend and frontend:
```bash
# Install root (server) dependencies
npm install

# Install client dependencies
cd client && npm install && cd ..
```

### 3. Environment Setup
Create a `.env` file in the root directory:
```bash
touch .env
```

Add your API keys and optional configurations:
```env
# ===== LLM Provider Keys =====
# At least one is required
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
GOOGLE_API_KEY=your-google-api-key
GROQ_API_KEY=your-groq-api-key

# ===== Optional: Custom OpenAI-compatible endpoint =====
OPENAI_BASE_URL=https://api.openai.com/v1

# ===== Optional: Default Model Settings =====
MODEL_NAME=gpt-4o
TEMPERATURE=0

# ===== Optional: Database Defaults =====
# These can also be configured in the UI
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
SQLITE_PATH=./database.sqlite
```

---

## 🖥️ Usage

### Development Mode
Start both the backend server and frontend dev server concurrently:
```bash
npm run dev
```

This runs:
- **Backend**: `http://localhost:3001` (Express API server)
- **Frontend**: `http://localhost:5173` (Vite dev server with HMR)

### Production Build
```bash
# Build both server and client
npm run build

# Start production server
npm start
# or with environment flag
NODE_ENV=production node dist/server.js
```

The production server serves both the API and the static frontend from `client/dist/`.

---

## ⚙️ Configuration

### Database Configuration (via UI)

1. Open the sidebar by clicking the toggle button
2. Select the **Database** tab
3. Choose your database engine:

#### PostgreSQL / MySQL
| Field | Description |
|-------|-------------|
| **Host** | Database server hostname (e.g., `localhost`, `db.example.com`) |
| **Port** | Connection port (PostgreSQL: 5432, MySQL: 3306) |
| **Database** | Database name |
| **Username** | Database user |
| **Password** | User password |
| **Enable SSL/TLS** | Toggle for secure remote connections (required for most cloud databases) |

#### SQLite
| Field | Description |
|-------|-------------|
| **DB Path** | Local file path (e.g., `./database.sqlite`, `/data/mydb.db`) |

> **💡 Tip**: Click **Save** after configuring to persist settings.

### LLM Configuration (via UI)

1. Select the **LLM Setup** tab in the sidebar
2. Configure your AI provider:

| Field | Description |
|-------|-------------|
| **Provider** | Select: OpenAI (Compatible), Anthropic, or Google Gemini |
| **Base URL** | API endpoint (for OpenAI-compatible only). Use shortcuts for Groq, OpenRouter, Moonshot, Ollama |
| **API Key** | Your provider's API key |
| **Model Name** | Model identifier (e.g., `gpt-4o`, `claude-3-5-sonnet-20240620`, `gemini-1.5-pro`) |
| **Max Tokens** | Maximum response length |
| **Temperature** | Creativity level (0 = focused, 1 = creative) |

#### Provider-Specific Notes

| Provider | Base URL | Example Models |
|----------|----------|----------------|
| **OpenAI** | `https://api.openai.com/v1` (default) | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo` |
| **Groq** | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile`, `mixtral-8x7b-32768` |
| **OpenRouter** | `https://openrouter.ai/api/v1` | `openai/gpt-4o`, `anthropic/claude-3.5-sonnet` |
| **Ollama** | `http://localhost:11434/v1` | `llama3`, `mistral`, `codellama` |
| **Anthropic** | Native (no URL needed) | `claude-3-5-sonnet-20240620`, `claude-3-opus-20240229` |
| **Google Gemini** | Native (no URL needed) | `gemini-1.5-pro`, `gemini-1.5-flash` |

---

## 🔐 SSL/TLS for Remote Databases

For secure connections to cloud databases (AWS RDS, Azure Database, Neon, Supabase, etc.):

1. **Enable SSL Toggle** in the Database configuration panel
2. The client uses `rejectUnauthorized: false` by default for compatibility with self-signed certificates

For production with certificate validation:
```env
# Option 1: Use sslmode in connection string
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require

# Option 2: Provide CA certificate
SSL_CERT=/path/to/ca-certificate.crt
SSL_CLIENT_CERT=/path/to/client-cert.crt  # For mTLS
SSL_CLIENT_KEY=/path/to/client-key.key    # For mTLS
```

---

## 📋 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/execute-sql` | POST | Execute a SQL query |
| `/api/get-schema` | POST | Retrieve database schema |

### Example: Execute SQL
```bash
curl -X POST http://localhost:3001/api/execute-sql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT * FROM users LIMIT 10",
    "config": {
      "dbType": "postgres",
      "dbUrl": "postgresql://user:pass@localhost:5432/mydb",
      "ssl": true
    }
  }'
```

---

## 🚀 Deployment

### Vercel (Recommended)
The project includes a `vercel.json` configuration for seamless deployment:

1. Push your code to GitHub
2. Import the repository in [Vercel](https://vercel.com)
3. Add environment variables in Vercel dashboard
4. Deploy!

Vercel will automatically:
- Run `npm run build` (compiles TypeScript + builds React)
- Start `npm start` (Node.js serverless function)
- Serve static files from `client/dist/`

### Docker (Coming Soon)
```dockerfile
# Dockerfile example
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

---

## 🧠 How the Agent Works

### Query Flow Example

**User Input**: *"Show me the top 5 customers by total order value"*

1. **Planner** analyzes the request:
   ```json
   {
     "entities": "customers, orders",
     "measure": "total order value",
     "operation": "per_entity_argmax",
     "constraint": "top 5"
   }
   ```

2. **Decider** determines the SQL tool should be used with a JOIN query

3. **Scope Reflector** evaluates:
   - Confidence Score: 0.85 (high)
   - Complexity: Medium
   - Risk Level: Low (read-only)

4. **Policy** approves the query (confidence ≥ 0.7, non-destructive)

5. **Executor** runs:
   ```sql
   SELECT c.customer_name, SUM(o.amount) as total_value
   FROM customers c
   JOIN orders o ON c.id = o.customer_id
   GROUP BY c.id, c.customer_name
   ORDER BY total_value DESC
   LIMIT 5;
   ```

6. **Finalizer** returns formatted results with summary

### Policy Enforcement
The agent includes built-in safety policies:

- **Confidence Threshold**: Queries below 0.7 confidence are rejected and trigger replanning
- **Destructive Operation Guard**: `DELETE`, `DROP`, `TRUNCATE` require explicit user context permissions
- **Schema Awareness**: Validates table/column existence before execution
- **Query Complexity Limits**: Large cross-joins and unbounded selects are flagged

---

## 🛡️ Security Considerations

1. **API Keys**: Never commit `.env` files. Use environment variables in production.
2. **SQL Injection**: The agent uses parameterized queries via Knex.js.
3. **SSL/TLS**: Always enable for remote database connections.
4. **CORS**: Configured for local development; restrict in production.
5. **Rate Limiting**: Consider adding rate limiting for production deployments.

---

## 🧪 Development

### Project Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev servers (backend + frontend concurrently) |
| `npm run dev:server` | Start backend only (with tsx hot-reload) |
| `npm run dev:client` | Start frontend only (Vite dev server) |
| `npm run build` | Build for production |
| `npm start` | Run production server |
| `npm run lint` | Run ESLint (in client/) |

### Tech Stack

**Backend**:
- [Express.js](https://expressjs.com/) - Web server
- [LangGraph.js](https://github.com/langchain-ai/langgraph) - Agent orchestration
- [LangChain.js](https://js.langchain.com/) - LLM integrations
- [Knex.js](https://knexjs.org/) - SQL query builder
- [Zod](https://zod.dev/) - Schema validation
- TypeScript

**Frontend**:
- [React 19](https://react.dev/) - UI framework
- [Vite](https://vitejs.dev/) - Build tool
- [Tailwind CSS 4](https://tailwindcss.com/) - Styling
- [Lucide React](https://lucide.dev/) - Icons
- [React Syntax Highlighter](https://github.com/react-syntax-highlighter/react-syntax-highlighter) - Code highlighting

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📜 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [LangChain](https://github.com/langchain-ai/langchainjs) for the excellent LLM framework
- [LangGraph](https://github.com/langchain-ai/langgraph) for agent orchestration
- [Knex.js](https://knexjs.org/) for the versatile query builder
- The open-source community for inspiration and tools

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/varunreddy">Varun Reddy</a>
</p>
