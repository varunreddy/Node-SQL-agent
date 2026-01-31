import { useState } from 'react'
import {
  Database, Send, Terminal, CheckCircle2,
  Loader2, History, ChevronLeft, ChevronRight,
  Server, Lock, User, Globe, Hash, Save, Check, FileCode
} from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import clsx from 'clsx'

interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'gemini';
  apiKey: string;
  baseUrl: string;
  modelName: string;
}

interface Config {
  dbType: 'postgres' | 'mysql' | 'sqlite';
  dbHost: string;
  dbPort: string;
  dbName: string;
  dbUser: string;
  dbPass: string;
  sqlitePath: string;
  llmConfig: LLMConfig;
}

interface Message {
  type: 'thinking' | 'sql_generated' | 'result' | 'error';
  data?: any;
  sql?: string;
  step?: string;
  log?: string;
}

export default function App() {
  const [activeConfig, setActiveConfig] = useState<Config>(() => {
    const saved = localStorage.getItem('sql-agent-config-v3');
    return saved ? JSON.parse(saved) : {
      dbType: 'postgres',
      dbHost: '',
      dbPort: '5432',
      dbName: '',
      dbUser: '',
      dbPass: '',
      sqlitePath: './database.sqlite',
      llmConfig: {
        provider: 'openai',
        apiKey: '',
        baseUrl: 'https://api.groq.com/openai/v1',
        modelName: 'llama-3.1-70b-versatile'
      }
    };
  });

  const [stagedConfig, setStagedConfig] = useState<Config>(activeConfig);
  const [dbSaveStatus, setDbSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [llmSaveStatus, setLlmSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [prompt, setPrompt] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [status, setStatus] = useState<'idle' | 'thinking' | 'success' | 'error'>('idle');
  const [activeSql, setActiveSql] = useState('');
  const [results, setResults] = useState<any>(null);
  const [currentThought, setCurrentThought] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const handleSaveDb = () => {
    setDbSaveStatus('saving');
    const newConfig = { ...activeConfig, ...stagedConfig };
    setActiveConfig(newConfig);
    localStorage.setItem('sql-agent-config-v3', JSON.stringify(newConfig));
    setTimeout(() => {
      setDbSaveStatus('saved');
      setTimeout(() => setDbSaveStatus('idle'), 2000);
    }, 500);
  };

  const handleSaveLlm = () => {
    setLlmSaveStatus('saving');
    const newConfig = { ...activeConfig, ...stagedConfig };
    setActiveConfig(newConfig);
    localStorage.setItem('sql-agent-config-v3', JSON.stringify(newConfig));
    setTimeout(() => {
      setLlmSaveStatus('saved');
      setTimeout(() => setLlmSaveStatus('idle'), 2000);
    }, 500);
  };

  const buildDbUrl = (c: Config) => {
    if (c.dbType === 'sqlite') return c.sqlitePath;
    if (!c.dbHost || !c.dbUser) return '';
    const prefix = c.dbType === 'postgres' ? 'postgres://' : 'mysql://';
    return `${prefix}${c.dbUser}:${c.dbPass}@${c.dbHost}:${c.dbPort}/${c.dbName}`;
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) return;

    const dbUrl = buildDbUrl(stagedConfig);
    if (!dbUrl && stagedConfig.dbType !== 'sqlite') {
      setStatus('error');
      setCurrentThought('Database configuration is incomplete or not saved.');
      return;
    }

    setIsThinking(true);
    setStatus('thinking');
    setActiveSql('');
    setResults(null);
    setCurrentThought('Initializing agent...');

    try {
      const payload = {
        query: prompt,
        config: {
          ...stagedConfig,
          dbType: stagedConfig.dbType,
          dbUrl,
          sqlitePath: stagedConfig.sqlitePath
        }
      };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const message = JSON.parse(line.slice(6)) as Message;
              handleMessage(message);
            } catch (e) {
              console.error('Error parsing SSE message', e);
            }
          }
        }
      }
    } catch (error: any) {
      setStatus('error');
      setCurrentThought('Error: ' + error.message);
    } finally {
      setIsThinking(false);
    }
  };

  const handleMessage = (msg: Message) => {
    switch (msg.type) {
      case 'thinking':
        setCurrentThought(msg.step || '');
        break;
      case 'sql_generated':
        setActiveSql(msg.sql || '');
        break;
      case 'result':
        setResults(msg.data);
        setStatus('success');
        setCurrentThought('Task completed successfully.');
        break;
      case 'error':
        setStatus('error');
        setCurrentThought(msg.data?.message || 'Execution failed');
        break;
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-primary/30 relative">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-border/50 bg-slate-950/80 backdrop-blur-md z-30">
        <div className="flex items-center space-x-2">
          <Database className="w-5 h-5 text-primary" />
          <span className="font-bold text-sm vibrant-text">SQL Agent</span>
        </div>
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 bg-primary/10 rounded-lg border border-primary/20 text-primary active:scale-95 transition-transform"
        >
          <History className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity animate-in fade-in duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Configuration */}
      <aside
        className={clsx(
          "glass border-r flex flex-col transition-all duration-300 ease-in-out z-50",
          "fixed inset-y-0 left-0 md:relative md:translate-x-0 h-full",
          isSidebarOpen ? "w-[280px] md:w-80 p-6 translate-x-0" : "-translate-x-full md:translate-x-0 md:w-16 md:p-4"
        )}
      >
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="hidden md:flex absolute -right-3 top-10 w-6 h-6 bg-primary rounded-full items-center justify-center text-white border-2 border-background shadow-lg hover:scale-110 transition-transform z-50"
        >
          {isSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <div className={clsx("flex items-center space-x-3 mb-8 transition-opacity", !isSidebarOpen && "opacity-0 invisible")}>
          <div className="p-2 bg-gradient-to-br from-primary to-accent rounded-lg shadow-lg shadow-primary/20">
            <Database className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight vibrant-text">SQL Agent</h1>
        </div>

        {!isSidebarOpen && (
          <div className="flex flex-col items-center space-y-6 mt-10 text-muted-foreground">
            <Server className="w-6 h-6 hover:text-primary transition-colors cursor-pointer" onClick={() => setIsSidebarOpen(true)} />
            <Globe className="w-6 h-6 hover:text-accent transition-colors cursor-pointer" onClick={() => setIsSidebarOpen(true)} />
          </div>
        )}

        <div className={clsx("space-y-6 overflow-y-auto pr-2 custom-scrollbar pb-10", !isSidebarOpen && "hidden")}>
          <section className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-500">
            <div className="flex items-center justify-between text-primary pr-2">
              <div className="flex items-center space-x-2">
                <Server className="w-4 h-4" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-primary/80">Database Setup</h2>
              </div>
              <button
                onClick={handleSaveDb}
                className={clsx(
                  "p-1.5 rounded-md transition-all flex items-center space-x-1 outline-none",
                  dbSaveStatus === 'saved' ? "bg-emerald-500/20 text-emerald-500" : "bg-primary/10 text-primary hover:bg-primary/20"
                )}
              >
                {dbSaveStatus === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : dbSaveStatus === 'saved' ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                <span className="text-[10px] font-bold uppercase">{dbSaveStatus === 'saved' ? 'Saved' : 'Save'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase ml-1 flex items-center"><Hash className="w-3 h-3 mr-1" /> Engine</label>
                <select
                  value={stagedConfig.dbType}
                  onChange={(e) => setStagedConfig({ ...stagedConfig, dbType: e.target.value as any })}
                  className="w-full bg-slate-950/50 border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all cursor-pointer"
                >
                  <option value="postgres" className="bg-slate-950 text-white">PostgreSQL</option>
                  <option value="mysql" className="bg-slate-950 text-white">MySQL</option>
                  <option value="sqlite" className="bg-slate-950 text-white">SQLite</option>
                </select>
              </div>

              {stagedConfig.dbType === 'sqlite' ? (
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground uppercase ml-1 flex items-center"><FileCode className="w-3 h-3 mr-1" /> DB Path</label>
                  <input
                    type="text"
                    value={stagedConfig.sqlitePath}
                    onChange={(e) => setStagedConfig({ ...stagedConfig, sqlitePath: e.target.value })}
                    className="w-full bg-secondary/30 border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 transition-all font-mono"
                    placeholder="./database.sqlite"
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground uppercase ml-1 flex items-center"><Globe className="w-3 h-3 mr-1" /> Host</label>
                    <input
                      type="text"
                      value={stagedConfig.dbHost}
                      onChange={(e) => setStagedConfig({ ...stagedConfig, dbHost: e.target.value })}
                      className="w-full bg-secondary/30 border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                      placeholder="localhost"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1 col-span-1">
                      <label className="text-[10px] text-muted-foreground uppercase ml-1 flex items-center"><Hash className="w-3 h-3 mr-1" /> Port</label>
                      <input
                        type="text"
                        value={stagedConfig.dbPort}
                        onChange={(e) => setStagedConfig({ ...stagedConfig, dbPort: e.target.value })}
                        className="w-full bg-secondary/30 border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 transition-all font-mono"
                      />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <label className="text-[10px] text-muted-foreground uppercase ml-1 flex items-center"><Database className="w-3 h-3 mr-1" /> Database</label>
                      <input
                        type="text"
                        value={stagedConfig.dbName}
                        onChange={(e) => setStagedConfig({ ...stagedConfig, dbName: e.target.value })}
                        className="w-full bg-secondary/30 border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 transition-all"
                        placeholder="postgres"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground uppercase ml-1 flex items-center"><User className="w-3 h-3 mr-1" /> Username</label>
                    <input
                      type="text"
                      value={stagedConfig.dbUser}
                      onChange={(e) => setStagedConfig({ ...stagedConfig, dbUser: e.target.value })}
                      className="w-full bg-secondary/30 border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground uppercase ml-1 flex items-center"><Lock className="w-3 h-3 mr-1" /> Password</label>
                    <input
                      type="password"
                      value={stagedConfig.dbPass}
                      onChange={(e) => setStagedConfig({ ...stagedConfig, dbPass: e.target.value })}
                      className="w-full bg-secondary/30 border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 transition-all"
                    />
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="space-y-4 pt-2 animate-in fade-in slide-in-from-left-4 duration-500 delay-150">
            <div className="flex items-center justify-between text-accent pr-2">
              <div className="flex items-center space-x-2">
                <Globe className="w-4 h-4" />
                <h2 className="text-xs font-bold uppercase tracking-widest">LLM Provider</h2>
              </div>
              <button
                onClick={handleSaveLlm}
                className={clsx(
                  "p-1.5 rounded-md transition-all flex items-center space-x-1 outline-none",
                  llmSaveStatus === 'saved' ? "bg-emerald-500/20 text-emerald-500" : "bg-accent/10 text-accent hover:bg-accent/20"
                )}
              >
                {llmSaveStatus === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : llmSaveStatus === 'saved' ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                <span className="text-[10px] font-bold uppercase">{llmSaveStatus === 'saved' ? 'Saved' : 'Save'}</span>
              </button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase ml-1 font-bold">Provider</label>
                <select
                  value={stagedConfig.llmConfig.provider}
                  onChange={(e) => setStagedConfig({
                    ...stagedConfig,
                    llmConfig: { ...stagedConfig.llmConfig, provider: e.target.value as any }
                  })}
                  className="w-full bg-slate-950/50 border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-accent/50 transition-all cursor-pointer"
                >
                  <option value="openai" className="bg-slate-950 text-white">OpenAI (Compatible)</option>
                  <option value="anthropic" className="bg-slate-950 text-white">Anthropic (Claude)</option>
                  <option value="gemini" className="bg-slate-950 text-white">Gemini (Google)</option>
                </select>
              </div>

              {stagedConfig.llmConfig.provider === 'openai' && (
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground uppercase ml-1 font-bold">Base URL</label>
                  <input
                    type="text"
                    value={stagedConfig.llmConfig.baseUrl}
                    onChange={(e) => setStagedConfig({
                      ...stagedConfig,
                      llmConfig: { ...stagedConfig.llmConfig, baseUrl: e.target.value }
                    })}
                    className="w-full bg-secondary/30 border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-accent/50 transition-all"
                    placeholder="https://api.groq.com/openai/v1"
                  />
                </div>
              )}
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase ml-1 font-bold">API Key</label>
                <input
                  type="password"
                  value={stagedConfig.llmConfig.apiKey}
                  onChange={(e) => setStagedConfig({
                    ...stagedConfig,
                    llmConfig: { ...stagedConfig.llmConfig, apiKey: e.target.value }
                  })}
                  className="w-full bg-secondary/30 border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-accent/50 transition-all"
                  placeholder="sk-..."
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase ml-1 font-bold">Model Name</label>
                <input
                  type="text"
                  value={stagedConfig.llmConfig.modelName}
                  onChange={(e) => setStagedConfig({
                    ...stagedConfig,
                    llmConfig: { ...stagedConfig.llmConfig, modelName: e.target.value }
                  })}
                  className="w-full bg-secondary/30 border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-accent/50 transition-all font-mono"
                />
              </div>
            </div>
          </section>
        </div>

        <div className={clsx("mt-auto pt-6 border-t border-border/50 transition-opacity", !isSidebarOpen && "opacity-0 invisible")}>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
            <span className="font-bold uppercase tracking-tighter">System Engine Status</span>
            <div className="flex items-center space-x-2">
              <div className={clsx(
                "w-2 h-2 rounded-full",
                status === 'idle' ? 'bg-muted' :
                  status === 'thinking' ? 'bg-primary animate-pulse shadow-[0_0_8px_rgba(139,92,246,0.5)]' :
                    status === 'success' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                      'bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]'
              )} />
              <span className="capitalize font-mono font-bold tracking-tight">{status}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area - Responsive Split */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 blur-[120px] pointer-events-none rounded-full" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-accent/5 blur-[120px] pointer-events-none rounded-full" />

        {/* Column 1: Prompt & Results */}
        <div className="w-full md:w-2/5 flex flex-col border-b md:border-b-0 md:border-r border-border/50 bg-black/10 backdrop-blur-sm z-10 overflow-hidden h-[60%] md:h-full">
          {/* Top: Prompt */}
          <div className="h-1/2 p-4 md:p-8 flex flex-col space-y-4 border-b border-border/50 overflow-hidden">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-primary/10 rounded-lg border border-primary/20">
                <Terminal className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-bold tracking-tight uppercase border-b-2 border-primary/50 pb-0.5">Prompt</span>
            </div>
            <div className="flex-1 flex flex-col relative group">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full h-full bg-secondary/10 border border-border/50 rounded-2xl p-4 md:p-6 text-sm resize-none focus:ring-2 focus:ring-primary/30 outline-none transition-all placeholder:text-muted-foreground/30 shadow-2xl glass-card leading-relaxed font-medium"
                placeholder="Ask your query..."
              />
              <button
                onClick={handleSubmit}
                disabled={isThinking || !prompt.trim()}
                className="absolute bottom-4 right-4 p-3 bg-gradient-to-br from-primary to-indigo-600 hover:scale-105 rounded-xl shadow-xl transition-all active:scale-95 group-hover:glow"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {/* Bottom: Analytical Results */}
          <div className="h-1/2 flex flex-col overflow-hidden group">
            <div className="px-4 md:px-8 py-3 md:py-4 border-b border-border/50 flex items-center space-x-3 bg-black/20">
              <div className="p-1.5 bg-accent/10 rounded-md">
                <History className="w-4 h-4 text-accent" />
              </div>
              <span className="text-xs font-bold tracking-widest uppercase text-accent">Analytical Results</span>
            </div>
            <div className="flex-1 overflow-auto p-4 md:p-6 custom-scrollbar bg-black/5">
              {results ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  {results.summary_text && (
                    <div className="p-4 bg-primary/10 border-l-4 border-primary rounded-r-xl text-[13px] font-medium leading-relaxed shadow-lg">
                      {results.summary_text}
                    </div>
                  )}
                  {results.data && Array.isArray(results.data) && results.data.length > 0 ? (
                    <div className="border rounded-xl overflow-hidden glass shadow-2xl relative">
                      <table className="w-full text-left text-[12px] border-collapse">
                        <thead>
                          <tr className="bg-primary/10 border-b border-border/50">
                            {Object.keys(results.data[0]).map(key => (
                              <th key={key} className="px-4 py-3 font-bold text-primary/80 uppercase text-[9px] tracking-widest">{key}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/10">
                          {results.data.map((row: any, i: number) => (
                            <tr key={i} className="hover:bg-primary/5 transition-colors group">
                              {Object.values(row).map((val: any, j: number) => (
                                <td key={j} className="px-4 py-3 font-mono text-[11px] text-foreground/70 group-hover:text-foreground transition-colors">
                                  {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : results.data ? (
                    <div className="p-4 bg-black/40 border border-border/50 rounded-2xl font-mono text-[11px] overflow-auto shadow-inner">
                      <pre className="text-accent/80 font-bold leading-relaxed">{JSON.stringify(results.data, null, 2)}</pre>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground/10 space-y-4">
                  <Database className="w-12 h-12 transition-transform hover:scale-110 duration-500 opacity-20" />
                  <p className="text-[11px] font-bold tracking-widest uppercase opacity-20 italic">Results data will be populated here</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Column 2: SQL Reasoning & Workspace */}
        <div className="flex-1 flex flex-col bg-transparent relative overflow-hidden z-10 h-[40%] md:h-full">
          <div className="px-4 md:px-8 py-3 md:py-4 border-b border-border/50 flex items-center justify-start space-x-4 md:space-x-6 bg-black/20">
            <div className="flex items-center space-x-3 shrink-0">
              {status === 'thinking' ? (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              ) : status === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <Terminal className="w-4 h-4 text-muted-foreground" />
              )}
              <span className={clsx(
                "text-xs font-bold tracking-widest uppercase",
                status === 'thinking' ? "text-primary italic" : status === 'success' ? "text-emerald-500" : "text-muted-foreground"
              )}>
                Agent Reasoning & SQL
              </span>
            </div>
            <div className="text-[10px] md:text-[11px] text-primary/80 font-mono font-bold truncate max-w-[150px] md:max-w-[500px] px-3 py-1 bg-primary/10 rounded-full border border-primary/20 shrink min-w-0">
              {currentThought || "Awaiting instructions..."}
            </div>
          </div>

          <div className="flex-1 bg-black/10 p-4 md:p-8 relative group overflow-hidden">
            {activeSql ? (
              <div className="animate-in fade-in zoom-in-95 duration-500 h-full overflow-auto custom-scrollbar glass-card rounded-2xl border border-border/30 p-2">
                <SyntaxHighlighter
                  language="sql"
                  style={vscDarkPlus}
                  customStyle={{
                    background: 'transparent',
                    padding: '1.5rem',
                    margin: 0,
                    fontSize: '14px',
                    fontFamily: '"Fira Code", monospace',
                    height: '100%',
                    lineHeight: '1.6',
                  }}
                  wrapLines={true}
                >
                  {activeSql}
                </SyntaxHighlighter>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground/10 space-y-4">
                <Terminal className="w-20 h-20 animate-float opacity-20" />
                <p className="text-sm font-bold tracking-widest uppercase opacity-20 italic">Generated SQL reasoning will appear in this workspace</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
