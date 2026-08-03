import { useMemo, useRef, useState } from "react";
import { parseDocx } from "../lib/docxParser";
import { chunkBlocks } from "../lib/chunker";
import { OpenAICompatibleClient, type ChatMessage } from "../lib/openaiCompatibleClient";
import { dedupeFindings, validateFinding } from "../lib/resultValidation";
import { mockFindings, mockProfile, defaultBrief, firstQuestion, secondQuestion, formatCheckLabels } from "../lib/mockAgent";
import { CHECK_LABELS, COMPLETENESS_PROMPT, PROFILER_PROMPT, buildBriefContext } from "../prompts";
import { findingSchema } from "../schemas";
import type { AgentQuestion, AgentState, Finding, ModelConfig, ProofreadBrief, ProofreadJob, DocumentData, Phase } from "../types";

const initialState: AgentState = {
  phase: "idle", document: null, profile: null, brief: null, messages: [],
  questionsAsked: 0, jobs: [], findings: [], selectedFindingId: null, error: null,
  connected: false, demoMode: true,
};

const uid = (prefix: string) => prefix + "-" + Math.random().toString(36).slice(2, 9);
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const defaultConfig: ModelConfig = {
  baseUrl: "https://api.deepseek.com",
  apiKey: "",
  model: "deepseek-v4-pro",
  temperature: 0.2,
  maxTokens: 4096,
};

function phaseLabel(phase: Phase) {
  return {
    idle: "等待上传", parsing: "本地解析中", profiling: "文稿诊断中", interviewing: "主动追问中",
    awaiting_confirmation: "等待确认", running: "校对执行中", reviewing: "复核融合中",
    completed: "本轮完成", error: "需要处理",
  }[phase];
}

function formatBytes(value: number) {
  return value < 1024 * 1024 ? Math.round(value / 1024) + " KB" : (value / 1024 / 1024).toFixed(1) + " MB";
}

function assistantMessage(content: string, phase?: Phase) {
  return { id: uid("msg"), role: "assistant" as const, content, createdAt: Date.now(), phase };
}

export default function App() {
  const [state, setState] = useState<AgentState>(initialState);
  const [config, setConfig] = useState<ModelConfig>(defaultConfig);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customAnswer, setCustomAnswer] = useState("");
  const [followup, setFollowup] = useState("");
  const [activeTab, setActiveTab] = useState<"document" | "conversation" | "plan">("conversation");
  const fileRef = useRef<HTMLInputElement>(null);
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const chunks = useMemo(() => state.document ? chunkBlocks(state.document.blocks) : [], [state.document]);
  const pendingQuestion = [...state.messages].reverse().find((message) => message.question)?.question;
  const currentJob = state.jobs.find((job) => job.status === "running");
  const activeFinding = state.findings.find((finding) => finding.id === state.selectedFindingId);

  const addMessage = (message: ReturnType<typeof assistantMessage> | { id: string; role: "user"; content: string; createdAt: number }) => {
    setState((prev) => ({ ...prev, messages: [...prev.messages, message] }));
  };

  const profileDocument = async (document: DocumentData) => {
    setState((prev) => ({ ...prev, phase: "profiling" }));
    let profile = mockProfile(document);
    let usedMock = true;
    if (config.apiKey && !state.demoMode) {
      try {
        const client = new OpenAICompatibleClient(config);
        const raw = await client.chat([
          { role: "system", content: PROFILER_PROMPT },
          { role: "user", content: document.rawText.slice(0, 14000) },
        ], { json: true });
        const parsed = JSON.parse(raw) as { summary?: string; signals?: string[]; entities?: string[] };
        profile = {
          summary: parsed.summary || profile.summary,
          signals: parsed.signals || profile.signals,
          entities: parsed.entities || profile.entities,
        };
        usedMock = false;
      } catch (error) {
        setState((prev) => ({ ...prev, error: "模型诊断失败，已切换为演示模式：" + (error instanceof Error ? error.message : "未知错误") }));
      }
    }
    const questionMessage = {
      ...assistantMessage(profile.summary + "我会先确认几个会影响校对策略的边界，再开始执行。", "interviewing"),
      question: firstQuestion,
    };
    setState((prev) => ({
      ...prev, phase: "interviewing", document, profile, brief: defaultBrief,
      messages: [...prev.messages, questionMessage], questionsAsked: 1, demoMode: usedMock ? true : prev.demoMode,
    }));
  };

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setState((prev) => ({ ...prev, phase: "error", error: "目前只支持 .docx 文件。" }));
      return;
    }
    setState({ ...initialState, phase: "parsing", demoMode: config.apiKey ? state.demoMode : true, messages: [assistantMessage("文档已收到，我正在本地读取段落和标题结构……", "parsing")] });
    try {
      const document = await parseDocx(file);
      if (!document.blocks.length) throw new Error("没有解析到可校对的文字段落。");
      await profileDocument(document);
    } catch (error) {
      setState((prev) => ({ ...prev, phase: "error", error: error instanceof Error ? error.message : "文档解析失败" }));
    }
  };

  const answerQuestion = (question: AgentQuestion, value: string) => {
    const answer = value.trim();
    if (!answer) return;
    const displayAnswer = question.options.find((option) => option.value === answer)?.label ?? answer;
    addMessage({ id: uid("msg"), role: "user", content: displayAnswer, createdAt: Date.now() });
    setState((prev) => {
      const brief: ProofreadBrief = { ...(prev.brief ?? defaultBrief) };
      if (question.id === "polish-boundary" && ["off", "minimal", "suggestive"].includes(answer)) brief.polishing = answer as ProofreadBrief["polishing"];
      if (question.id === "consistency-scope") {
        brief.consistencyTargets = answer === "all" ? ["人名", "称谓", "时间线", "核心术语"] : answer === "names" ? ["人名"] : [];
        if (answer === "none") brief.checks = brief.checks.filter((item) => item !== "consistency");
      }
      return { ...prev, brief, messages: prev.messages.map((message) => message.question?.id === question.id ? { ...message, question: undefined } : message) };
    });
    if (question.id === firstQuestion.id) {
      const message = { ...assistantMessage("明白。我还注意到书稿存在需要跨段落判断的人物/称谓线索。", "interviewing"), question: secondQuestion };
      setState((prev) => ({ ...prev, messages: [...prev.messages, message], questionsAsked: 2 }));
    } else {
      setState((prev) => ({
        ...prev, phase: "awaiting_confirmation",
        messages: [...prev.messages, assistantMessage("校对边界已经明确。我已把本轮范围、检查项和风格约束整理成右侧方案，请确认后开始。", "awaiting_confirmation")],
      }));
    }
    setCustomAnswer("");
  };

  const updateJob = (jobId: string, patch: Partial<ProofreadJob>) => {
    setState((prev) => ({ ...prev, jobs: prev.jobs.map((job) => job.id === jobId ? { ...job, ...patch } : job) }));
  };

  const runRealChunk = async (client: OpenAICompatibleClient, document: DocumentData, blockIds: string[], brief: ProofreadBrief) => {
    const text = blockIds.map((id) => document.blocks.find((block) => block.id === id)?.text ?? "").join("\n");
    const prompt = "brief:\n" + buildBriefContext(brief) + "\n\n原文分片:\n" + text +
      "\n\n请只输出 JSON 数组 findings。没有问题就输出 []。每条必须是 {id,blockId,sentence,oldText,newText,type,reason,confidence,route,status,sources}，不要输出 markdown。";
    const raw = await client.chat([{ role: "system", content: COMPLETENESS_PROMPT }, { role: "user", content: prompt }], { json: true });
    const data = JSON.parse(raw) as unknown;
    const items = Array.isArray(data) ? data : (data && typeof data === "object" && "findings" in data ? (data as { findings: unknown[] }).findings : []);
    return (items as unknown[]).flatMap((item) => {
      try {
        const parsed = findingSchema.parse(item) as Finding;
        const valid = validateFinding(parsed, document);
        return valid ? [valid] : [];
      } catch { return []; }
    });
  };

  const startRun = async () => {
    const document = state.document;
    const brief = state.brief ?? defaultBrief;
    if (!document) return;
    const proofJobs: ProofreadJob[] = [
      { id: "job-index", label: "建立全书实体与一致性索引", kind: "index", status: "queued" },
      ...chunks.map((chunk) => ({ id: chunk.id, label: "检查 " + (chunk.chapterPath.join(" / ") || chunk.id), kind: "proofread" as const, status: "queued" as const, progress: 0, blockIds: chunk.blockIds })),
      ...(brief.checks.includes("risk") ? [{ id: "job-risk", label: "检查内容导向风险", kind: "risk" as const, status: "queued" as const }] : []),
      { id: "job-supervise", label: "监督复核、去重并分流", kind: "supervise", status: "queued" },
    ];
    setState((prev) => ({ ...prev, phase: "running", jobs: proofJobs, findings: [], error: null, messages: [...prev.messages, assistantMessage("方案已确认。我先建立全局索引，再分片检查，最后统一复核。", "running")] }));
    let nextFindings: Finding[] = [];
    const update = (jobId: string, patch: Partial<ProofreadJob>) => setState((prev) => ({ ...prev, jobs: prev.jobs.map((job) => job.id === jobId ? { ...job, ...patch } : job) }));
    update("job-index", { status: "running", progress: 15 });
    await wait(state.demoMode ? 500 : 100);
    update("job-index", { status: "succeeded", progress: 100 });
    const client = !state.demoMode && config.apiKey ? new OpenAICompatibleClient(config) : null;
    for (const chunk of chunks) {
      update(chunk.id, { status: "running", progress: 10 });
      try {
        const found = client ? await runRealChunk(client, document, chunk.blockIds, brief) : mockFindings({ ...document, blocks: document.blocks.filter((block) => chunk.blockIds.includes(block.id)) }, brief);
        nextFindings = dedupeFindings([...nextFindings, ...found]);
        setState((prev) => ({ ...prev, findings: nextFindings }));
        update(chunk.id, { status: "succeeded", progress: 100 });
      } catch (error) {
        update(chunk.id, { status: "failed", progress: 100, error: error instanceof Error ? error.message : "分片失败" });
      }
      await wait(state.demoMode ? 180 : 30);
    }
    const riskJob = proofJobs.find((job) => job.kind === "risk");
    if (riskJob) {
      update(riskJob.id, { status: "running", progress: 30 });
      await wait(state.demoMode ? 450 : 100);
      update(riskJob.id, { status: "succeeded", progress: 100 });
    }
    update("job-supervise", { status: "running", progress: 20 });
    await wait(state.demoMode ? 600 : 150);
    nextFindings = dedupeFindings(nextFindings);
    setState((prev) => ({ ...prev, phase: "completed", findings: nextFindings, messages: [...prev.messages, assistantMessage("本轮校对已完成，共保留 " + nextFindings.length + " 条结果。你可以点击右侧问题定位原文，或继续告诉我下一项专项要求。", "completed")] }));
    update("job-supervise", { status: "succeeded", progress: 100 });
  };

  const handleFollowup = () => {
    const text = followup.trim();
    if (!text) return;
    addMessage({ id: uid("msg"), role: "user", content: text, createdAt: Date.now() });
    const nextBrief = { ...(state.brief ?? defaultBrief) };
    if (/不要|忽略|取消/.test(text) && /润色/.test(text)) nextBrief.polishing = "off";
    if (/人名|称谓/.test(text)) nextBrief.consistencyTargets = ["人名", "称谓"];
    if (/风险|政务|导向/.test(text) && !nextBrief.checks.includes("risk")) nextBrief.checks = [...nextBrief.checks, "risk"];
    setState((prev) => ({ ...prev, brief: nextBrief, phase: "awaiting_confirmation", messages: [...prev.messages, assistantMessage("收到。我已将这条要求转成定向复查方案：" + text + "。请确认后再次执行，已有结果会保留并去重。", "awaiting_confirmation")] }));
    setFollowup("");
  };

  const selectFinding = (finding: Finding) => {
    setState((prev) => ({ ...prev, selectedFindingId: finding.id }));
    window.setTimeout(() => blockRefs.current[finding.blockId]?.scrollIntoView({ behavior: "smooth", block: "center" }), 10);
  };

  const changeFindingStatus = (id: string, status: Finding["status"]) => {
    setState((prev) => ({ ...prev, findings: prev.findings.map((finding) => finding.id === id ? { ...finding, status } : finding) }));
  };

  const downloadResults = () => {
    const blob = new Blob([JSON.stringify({ document: state.document?.name, brief: state.brief, findings: state.findings }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = "proofread-results.json"; link.click(); URL.revokeObjectURL(link.href);
  };

  const testConnection = async () => {
    if (!config.apiKey) return setState((prev) => ({ ...prev, error: "请先输入 API Key。" }));
    try {
      await new OpenAICompatibleClient(config).testConnection();
      setState((prev) => ({ ...prev, connected: true, demoMode: false, error: null }));
    } catch (error) {
      setState((prev) => ({ ...prev, connected: false, error: error instanceof Error ? error.message : "连接失败" }));
    }
  };

  const clearKey = () => {
    setConfig((prev) => ({ ...prev, apiKey: "" }));
    setState((prev) => ({ ...prev, connected: false, demoMode: true }));
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark">校</div><div><strong>校对王 <span>Agent</span></strong><small>中文书稿智能校对 · 内部演示</small></div></div>
        <div className="topbar-status"><span className="status-dot" data-on={state.connected || state.demoMode} />{state.demoMode ? "演示模式" : state.connected ? "DeepSeek 已连接" : "未连接模型"}<button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="打开设置">⚙</button></div>
      </header>
      <main className="workspace">
        <aside className="left-column">
          <section className="panel upload-panel">
            <div className="panel-heading"><span>文档</span><span className="eyebrow">LOCAL</span></div>
            {!state.document ? (
              <button className="dropzone" onClick={() => fileRef.current?.click()}>
                <span className="upload-icon">↑</span><strong>上传中文书稿</strong><span>支持 .docx，文件在浏览器本地解析</span>
                <em>点击选择文件</em>
              </button>
            ) : (
              <div className="file-card"><div className="file-icon">DOCX</div><div className="file-meta"><strong>{state.document.name}</strong><span>{formatBytes(state.document.size)} · {state.document.blocks.length} 段</span><span>{state.document.rawText.length.toLocaleString()} 字</span></div><button className="text-button" onClick={() => fileRef.current?.click()}>更换</button></div>
            )}
            <input ref={fileRef} type="file" accept=".docx" hidden onChange={(event) => event.target.files?.[0] && void handleFile(event.target.files[0])} />
          </section>
          <section className="panel document-panel">
            <div className="panel-heading"><span>原文预览</span>{state.document && <span className="muted">{state.document.blocks.length} 段</span>}</div>
            <div className="document-scroll">
              {state.document ? state.document.blocks.map((block) => (
                <div className={"document-block " + (block.kind === "heading" ? "is-heading " : "") + (activeFinding?.blockId === block.id ? "is-highlighted" : "")} key={block.id} ref={(node) => { blockRefs.current[block.id] = node; }}>
                  <span className="block-index">{block.id.replace("block-", "").padStart(2, "0")}</span><p>{block.text}</p>
                </div>
              )) : <div className="empty-state"><span>⌁</span><p>上传文档后，原文段落会在这里出现。</p></div>}
            </div>
          </section>
        </aside>
        <section className="center-column">
          <div className="mobile-tabs"><button className={activeTab === "document" ? "active" : ""} onClick={() => setActiveTab("document")}>文档</button><button className={activeTab === "conversation" ? "active" : ""} onClick={() => setActiveTab("conversation")}>对话</button><button className={activeTab === "plan" ? "active" : ""} onClick={() => setActiveTab("plan")}>方案</button></div>
          <section className="panel conversation-panel">
            <div className="conversation-head"><div><span className="eyebrow">WORK SESSION</span><h1>和校对 Agent 一起工作</h1></div><span className="phase-pill">{phaseLabel(state.phase)}</span></div>
            <div className="conversation-scroll">
              {state.messages.map((message) => <div className={"message-row " + message.role} key={message.id}><div className="avatar">{message.role === "user" ? "我" : "校"}</div><div className="message-bubble"><div className="message-content">{message.content}</div>{message.question && pendingQuestion?.id === message.question.id && <QuestionCard question={message.question} customAnswer={customAnswer} setCustomAnswer={setCustomAnswer} onAnswer={answerQuestion} />}</div></div>)}
              {state.phase === "idle" && <div className="welcome-card"><span className="welcome-orb">✦</span><h2>先让我读懂这份稿子</h2><p>上传文件后，我会先判断文稿特征，再主动询问真正影响校对结果的几个边界。</p><button className="primary-button" onClick={() => fileRef.current?.click()}>上传 DOCX <span>→</span></button></div>}
              {state.phase === "parsing" && <div className="thinking"><span className="pulse" />正在读取段落结构</div>}
            </div>
            <div className="conversation-composer"><input value={followup} onChange={(event) => setFollowup(event.target.value)} onKeyDown={(event) => event.key === "Enter" && handleFollowup()} placeholder={state.phase === "completed" || state.phase === "awaiting_confirmation" ? "告诉我下一项要求，例如：再查人名统一" : "上传文档后，这里可以继续和 Agent 对话"} disabled={!state.document} /><button onClick={handleFollowup} disabled={!state.document || !followup.trim()}>发送</button></div>
          </section>
        </section>
        <aside className="right-column">
          <BriefPanel brief={state.brief} phase={state.phase} onStart={startRun} />
          <ProgressPanel jobs={state.jobs} currentJob={currentJob} phase={state.phase} />
          <FindingsPanel findings={state.findings} selectedId={state.selectedFindingId} onSelect={selectFinding} onStatus={changeFindingStatus} onDownload={downloadResults} />
        </aside>
      </main>
      {state.error && <div className="toast error-toast"><span>!</span>{state.error}<button onClick={() => setState((prev) => ({ ...prev, error: null }))}>×</button></div>}
      {settingsOpen && <SettingsModal config={config} setConfig={setConfig} onClose={() => setSettingsOpen(false)} onTest={testConnection} onClear={clearKey} />}
      <footer className="disclaimer">内部产品演示 · 文稿内容会发送至你配置的模型服务商 · 不用于生产环境</footer>
    </div>
  );
}

function QuestionCard({ question, customAnswer, setCustomAnswer, onAnswer }: { question: AgentQuestion; customAnswer: string; setCustomAnswer: (value: string) => void; onAnswer: (question: AgentQuestion, value: string) => void }) {
  return <div className="question-card"><div className="question-label">需要你确认</div><strong>{question.prompt}</strong>{question.rationale && <p>{question.rationale}</p>}<div className="option-grid">{question.options.map((option) => <button key={option.value} onClick={() => onAnswer(question, option.value)}><span>{option.label}</span>{option.hint && <small>{option.hint}</small>}</button>)}</div>{question.allowCustom && <div className="custom-answer"><input value={customAnswer} onChange={(event) => setCustomAnswer(event.target.value)} placeholder="也可以直接告诉我你的要求" onKeyDown={(event) => event.key === "Enter" && onAnswer(question, customAnswer)} /><button onClick={() => onAnswer(question, customAnswer)}>确认</button></div>}</div>;
}

function BriefPanel({ brief, phase, onStart }: { brief: ProofreadBrief | null; phase: Phase; onStart: () => void }) {
  const canStart = phase === "awaiting_confirmation" || phase === "completed";
  return <section className="panel brief-panel"><div className="panel-heading"><span>本轮校对方案</span><span className={"plan-state " + (canStart ? "ready" : "")}>{canStart ? "待确认" : brief ? "生成中" : "等待文档"}</span></div>{brief ? <><div className="brief-title"><span className="brief-icon">✦</span><div><strong>{brief.documentType}</strong><span>{brief.register}</span></div></div><div className="brief-list"><div><span>润色边界</span><strong>{brief.polishing === "off" ? "只纠硬错" : brief.polishing === "minimal" ? "允许最小润色" : "附带改写建议"}</strong></div><div><span>对话风格</span><strong>{brief.preserveDialogueVoice ? "保留口语与人物口吻" : "按书面规范处理"}</strong></div><div><span>检查项目</span><strong>{formatCheckLabels(brief.checks)}</strong></div><div><span>一致性索引</span><strong>{brief.consistencyTargets.length ? brief.consistencyTargets.join("、") : "暂不建立"}</strong></div></div>{canStart && <button className="primary-button full" onClick={onStart}>{phase === "completed" ? "按新要求再次执行" : "确认方案并开始"} <span>→</span></button>}</> : <div className="empty-state compact"><span>◎</span><p>Agent 读完文档后，这里会出现一份可编辑的方案。</p></div>}</section>;
}

function ProgressPanel({ jobs, currentJob, phase }: { jobs: ProofreadJob[]; currentJob?: ProofreadJob; phase: Phase }) {
  if (!jobs.length) return null;
  const done = jobs.filter((job) => job.status === "succeeded").length;
  return <section className="panel progress-panel"><div className="panel-heading"><span>任务进度</span><span className="muted">{done}/{jobs.length}</span></div><div className="progress-track"><span style={{ width: (done / jobs.length) * 100 + "%" }} /></div>{currentJob && <div className="active-job"><span className="pulse small" /><div><strong>{currentJob.label}</strong><span>{currentJob.progress ?? 0}% · Agent 正在工作</span></div></div>}<div className="job-list">{jobs.slice(0, 6).map((job) => <div key={job.id} className={"job-line " + job.status}><span>{job.status === "succeeded" ? "✓" : job.status === "failed" ? "!" : job.status === "running" ? "•" : "○"}</span><span>{job.label}</span></div>)}{jobs.length > 6 && <div className="more-jobs">还有 {jobs.length - 6} 个分片任务…</div>}</div></section>;
}

function FindingsPanel({ findings, selectedId, onSelect, onStatus, onDownload }: { findings: Finding[]; selectedId: string | null; onSelect: (finding: Finding) => void; onStatus: (id: string, status: Finding["status"]) => void; onDownload: () => void }) {
  if (!findings.length) return null;
  const hard = findings.filter((finding) => finding.type !== "建议润色").length;
  return <section className="panel findings-panel"><div className="panel-heading"><span>校对结果</span><button className="text-button" onClick={onDownload}>导出 JSON</button></div><div className="finding-summary"><strong>{findings.length}</strong><span>条结果</span><em>{hard} 条硬错 · {findings.length - hard} 条建议</em></div><div className="finding-list">{findings.map((finding) => <div key={finding.id} className={"finding-card " + (selectedId === finding.id ? "selected " : "") + finding.status} role="button" tabIndex={0} onClick={() => onSelect(finding)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(finding); }}><div><span className={"finding-dot " + (finding.confidence === "high" ? "high" : "doubt")} />{finding.type}<small>{finding.route === "web" ? "建议联网核验" : finding.confidence === "high" ? "高置信" : "存疑"}</small></div><p>“{finding.oldText}” → “{finding.newText}”</p><footer onClick={(event) => event.stopPropagation()}><button onClick={() => onStatus(finding.id, "accepted")}>接受</button><button onClick={() => onStatus(finding.id, "ignored")}>忽略</button></footer></div>)}</div></section>;
}

function SettingsModal({ config, setConfig, onClose, onTest, onClear }: { config: ModelConfig; setConfig: React.Dispatch<React.SetStateAction<ModelConfig>>; onClose: () => void; onTest: () => void; onClear: () => void }) {
  return <div className="modal-backdrop" onClick={onClose}><div className="settings-modal" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow">MODEL SETTINGS</span><h2>连接模型</h2></div><button onClick={onClose}>×</button></div><p className="modal-note">Key 只保存在当前页面内存，刷新即清除。不要把 Key 写入仓库或构建变量。</p><label>Base URL<input value={config.baseUrl} onChange={(event) => setConfig((prev) => ({ ...prev, baseUrl: event.target.value }))} /></label><label>Model<input value={config.model} onChange={(event) => setConfig((prev) => ({ ...prev, model: event.target.value }))} /></label><label>API Key<input type="password" value={config.apiKey} onChange={(event) => setConfig((prev) => ({ ...prev, apiKey: event.target.value }))} placeholder="sk-..." /></label><label>Temperature<input type="number" min="0" max="2" step="0.1" value={config.temperature} onChange={(event) => setConfig((prev) => ({ ...prev, temperature: Number(event.target.value) }))} /></label><div className="settings-actions"><button className="secondary-button" onClick={onClear}>清除 Key</button><button className="secondary-button" onClick={onTest}>测试连接</button><button className="primary-button" onClick={onClose}>保存</button></div></div></div>;
}
