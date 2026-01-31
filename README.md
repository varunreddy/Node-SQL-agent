# SQL Agent (Node.js/TypeScript)

A powerful, multi-database and multi-LLM SQL assistant built with Node.js, Express, and React. It uses LangGraph.js to orchestrate agents that reason about your database, generate optimized SQL, and provide analytical summaries.

## 🚀 Features
- **Multi-Database Support**: Powered by **Knex.js**, the agent supports **PostgreSQL, MySQL, and SQLite**.
- **Multi-LLM Provider Support**: Native integration for **OpenAI (Compatible)**, **Anthropic (Claude)**, and **Google (Gemini)**.
- **Dialect-Aware Reasoning**: The AI understands the specific syntax and capabilities of your selected database engine.
- **Vibrant UI**: Modern dark theme with glassmorphism and real-time reasoning feedback.
- **Dynamic Config**: Configure connection details and LLM providers directly in the UI.
- **Smart Agent**: Multi-step reasoning for complex natural language queries.
- **Syntax Highlighting**: Real-time SQL preview with syntax highlighting.

## 🛠️ Installation

### 1. Clone the repository
```bash
git clone https://github.com/varunreddy/Node-SQL-agent.git
cd Node-SQL-agent
```

### 2. Install Dependencies
Install dependencies for both the backend and frontend:
```bash
npm install
cd client && npm install
cd ..
```

### 3. Environment Setup
Create a `.env` file in the root directory:
```bash
touch .env
```
(Optional) You can pre-fill it with your LLM API keys:
```env
# Provider Specific Keys
GROQ_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
GOOGLE_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

## 🖥️ Usage

### 1. Start the Development Server
Run the following command from the root directory to start both the backend and frontend concurrently:
```bash
npm run dev
```
The UI will be available at `http://localhost:5173`.

### 2. Configure Database & LLM
- Open the sidebar in the UI.
- **Database Engine**: Select your engine (**PostgreSQL**, **MySQL**, or **SQLite**).
- **Connection Details**:
  - For **PostgreSQL/MySQL**: Enter Host, Port, User, Password, and Database name.
  - For **SQLite**: Simply provide the local file path to your `.sqlite` or `.db` file.
- **LLM Provider**: Select your provider (**OpenAI**, **Anthropic**, or **Gemini**).
  - **OpenAI (Compatible)**: Supports any OpenAI-compatible API (e.g., Groq, OpenRouter, Mistral, Ollama). Requires a **Base URL**.
  - **Anthropic/Gemini**: Native integration. No Base URL required.
- Click **Save** on each section to persist the settings.

### 3. Ask Questions
Type your query in the prompt input and click **Send**. The agent will visualize its reasoning and return the results in a table or JSON format.

## 📜 License
MIT
