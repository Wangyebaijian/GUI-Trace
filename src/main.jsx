import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDown,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Clock3,
  Command,
  Cpu,
  Download,
  Expand,
  Eye,
  FileText,
  Fingerprint,
  FolderOpen,
  Frame,
  GitBranch,
  Layers,
  Loader2,
  Maximize2,
  Monitor,
  MousePointer2,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  ScanLine,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import "./styles.css";

const INITIAL = {
  status: "idle",
  mode: "demo",
  task: "",
  step: 0,
  totalSteps: 0,
  elapsedMs: 0,
  phase: "",
  message: "等待启动任务",
  frames: [],
  memory: { keys: [] },
  logs: [],
  result: null,
};
const DEFAULT_TASK =
  "创建“曙光发布会”计划，最初设在 2026-11-18 09:30、演示室 A，预算 6800 元。保存供应商提供的恢复口令。随后处理场地冲突：改至 11 月 19 日 14:00、演示室 B，邀请提醒提前 24 小时；将预算改成 5200 元并删除过期草稿。再根据第二次通知把日期恢复到 11 月 18 日但保留 14:00 和演示室 B，撤销错误提醒，按新日期重建。最后从早期记忆恢复原预算和恢复口令，保持最新场地和时间，生成最终摘要并核验全过程。";
const DEFAULT_DESKTOP_TASK =
  "请打开本机计算器，计算 128 × 64，确认结果后打开系统设置，进入外观页面查看当前设置。不要修改设置。";
const PHASES = [
  ["01", "建立原始约束", "锁定最初的预算与口令"],
  ["02", "第一次时间冲突", "变更日期、场地和提醒"],
  ["03", "覆盖与删除", "删除草稿并撤销旧提醒"],
  ["04", "长依赖恢复", "回溯早期原始证据"],
  ["05", "最终核验", "依据最新约束完成验收"],
];
const STATUS = {
  idle: "准备就绪",
  running: "正在执行",
  paused: "任务已暂停",
  completed: "执行完成",
  stopped: "任务已停止",
  error: "执行异常",
};
const bytes = (n) =>
  !n
    ? "0 B"
    : n > 1048576
      ? `${(n / 1048576).toFixed(1)} MB`
      : `${Math.round(n / 1024)} KB`;
const number = (n) =>
  n ? new Intl.NumberFormat("en-US").format(Math.round(n)) : "—";
const duration = (n) => {
  const s = Math.floor((n || 0) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
async function api(path, body) {
  const r = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await r.json();
  } catch {
    data = { error: `服务返回 ${r.status}` };
  }
  if (!r.ok) throw new Error(data.error || data.message || "操作失败");
  return data;
}
function Logo() {
  return (
    <div className="logo-mark">
      <span />
      <span />
      <span />
      <span />
      <i />
    </div>
  );
}
function IconButton({ children, title, onClick, disabled, className = "" }) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function EmptyViewport() {
  return (
    <div className="empty-viewport">
      <div className="grid-floor" />
      <div className="orbital orbital-one" />
      <div className="orbital orbital-two" />
      <div className="vision-core">
        <ScanLine size={36} />
        <span>TRACE ENGINE</span>
        <small>等待第一帧真实观测</small>
      </div>
      <div className="floating-node node-left">
        <Frame size={16} />
        <span>原始观测</span>
        <i />
      </div>
      <div className="floating-node node-right">
        <Fingerprint size={16} />
        <span>关键证据</span>
        <i />
      </div>
      <div className="floating-node node-bottom">
        <Layers size={16} />
        <span>视觉记忆画布</span>
        <i />
      </div>
      <div className="empty-viewport-caption">
        <span className="tiny-line" />
        从瞬间的画面，到持续的记忆
        <span className="tiny-line" />
      </div>
    </div>
  );
}
function TaskStages({ state, mode }) {
  const phases =
    mode === "desktop"
      ? [
          ["01", "观察当前界面", "实时采集本机屏幕"],
          ["02", "读取视觉记忆", "关键原图与压缩历史画布"],
          ["03", "生成下一步操作", "视觉模型根据任务决策"],
          ["04", "执行与复核", "持续观察操作后的状态"],
        ]
      : PHASES;
  const p = state.phase;
  const finished = state.status === "completed";
  const namedIndex = phases.findIndex((x) => x[1] === p);
  const phaseIndex =
    typeof p === "number"
      ? p
      : namedIndex >= 0
        ? namedIndex
        : Math.min(
            4,
            Math.floor((state.step / Math.max(1, state.totalSteps)) * 5),
          );
  return (
    <div className="phase-list">
      {phases.map(([n, name, desc], i) => (
        <div
          key={n}
          className={`phase-row ${mode === "demo" && !finished && state.step > 0 && i === phaseIndex ? "active" : ""} ${mode === "demo" && state.step > 0 && (finished || i < phaseIndex) ? "past" : ""}`}
        >
          <div className="phase-index">
            {mode === "demo" &&
            state.step > 0 &&
            (finished || i < phaseIndex) ? (
              <Check size={13} />
            ) : (
              n
            )}
          </div>
          <div>
            <b>{name}</b>
            <small>{desc}</small>
          </div>
          {mode === "demo" &&
            !finished &&
            state.step > 0 &&
            i === phaseIndex && <span className="phase-beacon" />}
        </div>
      ))}
    </div>
  );
}
function MemoryIngestion({ frames, keys, memory, running }) {
  const frame = frames.at(-2);
  const kept = frame && keys.some((k) => k.id === frame.id);
  return (
    <div
      className={`ingestion ${frame ? "has-ingestion" : ""}`}
      key={frame?.id || "waiting"}
    >
      <div className="ingestion-heading">
        <span className="ingestion-pulse" /> ONLINE MEMORY ROUTING{" "}
        <span>{frame ? (running ? "实时分流" : "最近分流") : "等待观测"}</span>
      </div>
      <div className="ingestion-routing">
        <div className="ingestion-source">
          <Frame size={16} />
          <b>{frame?.id || "F—"}</b>
          <small>历史节点</small>
        </div>
        <div className={`route-lines ${kept ? "route-key" : "route-atlas"}`}>
          <span className="route-main" />
          <span className="route-branch top" />
          <span className="route-branch bottom" />
          {frame && <i className="route-particle" />}
        </div>
        <div className="ingestion-targets">
          <div
            className={`route-target key-target ${frame && kept ? "chosen" : ""}`}
          >
            <Fingerprint size={12} />
            <span>关键原图</span>
            <b>{keys.length}</b>
          </div>
          <div
            className={`route-target atlas-target ${frame && !kept ? "chosen" : ""}`}
          >
            <Layers size={12} />
            <span>压缩画布</span>
            <b>{memory.compressedCount || 0}</b>
          </div>
        </div>
      </div>
      {frame ? (
        <div className="ingestion-verdict">
          <span>{frame.id}</span>
          {kept ? "保留原始分辨率，供后续回溯" : "按时间顺序合入视觉画布"}
        </div>
      ) : (
        <div className="ingestion-verdict">当前帧独立保留 · 历史帧在线分流</div>
      )}
    </div>
  );
}
function SettingsModal({ onClose, onError }) {
  const [config, setConfig] = useState({ baseURL: "", model: "", apiKey: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api("/api/settings")
      .then((d) => {
        setConfig({ ...d, apiKey: "" });
        setLoading(false);
      })
      .catch((e) => {
        onError(e.message);
        setLoading(false);
      });
  }, []);
  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/settings", {
        baseURL: config.baseURL.trim(),
        model: config.model.trim(),
        apiKey: config.apiKey.trim(),
      });
      setSaved(true);
      setTimeout(onClose, 650);
    } catch (e) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="模型接口设置"
        className="modal settings-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">CONNECTION SETTINGS</span>
            <h2>连接视觉执行模型</h2>
          </div>
          <IconButton title="关闭设置" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </div>
        <p className="modal-description">
          本机长时序演示无需密钥。自由任务模式使用这里配置的视觉模型，读取截图并生成操作。接口需兼容
          Chat Completions，模型需支持图片输入。
        </p>
        {loading ? (
          <div className="modal-loading">
            <Loader2 className="spin" />
            读取配置…
          </div>
        ) : (
          <form onSubmit={submit}>
            <label>
              API BASE URL
              <input
                value={config.baseURL || ""}
                onChange={(e) =>
                  setConfig({ ...config, baseURL: e.target.value })
                }
                type="url"
                autoComplete="off"
                placeholder="https://your-provider.example/v1"
                required
              />
            </label>
            <label>
              MODEL
              <input
                value={config.model || ""}
                onChange={(e) =>
                  setConfig({ ...config, model: e.target.value })
                }
                placeholder="视觉模型名称"
                required
              />
            </label>
            <label>
              API KEY{" "}
              <span>
                {config.hasApiKey
                  ? "已有密钥，留空保留"
                  : "密钥仅提交到本机服务"}
              </span>
              <input
                type="password"
                autoComplete="off"
                value={config.apiKey}
                onChange={(e) =>
                  setConfig({ ...config, apiKey: e.target.value })
                }
                placeholder={
                  config.hasApiKey ? "••••••••（已配置）" : "输入接口密钥"
                }
              />
            </label>
            {config.permissions && (
              <div className="permission-summary">
                <div>
                  <Monitor size={14} />
                  <span>屏幕录制</span>
                  <b
                    className={
                      config.permissions.screenRecording ? "ready" : "pending"
                    }
                  >
                    {config.permissions.screenRecording ? "已授权" : "待授权"}
                  </b>
                </div>
                <div>
                  <MousePointer2 size={14} />
                  <span>辅助功能</span>
                  <b
                    className={
                      config.permissions.accessibility ? "ready" : "pending"
                    }
                  >
                    {config.permissions.accessibility ? "已授权" : "待授权"}
                  </b>
                </div>
                {(!config.permissions.screenRecording ||
                  !config.permissions.accessibility) && (
                  <p>
                    在 macOS 系统设置 →
                    隐私与安全性中，为启动服务的应用开启相应权限。
                  </p>
                )}
              </div>
            )}
            <div className="settings-note">
              <ShieldCheck size={16} />
              密钥仅保存在本机服务内存，重启服务后需重新填写。使用远程模型时，当前截图会发送至你配置的服务。
            </div>
            <button className="primary-button" disabled={saving}>
              {saved ? (
                <Check size={17} />
              ) : saving ? (
                <Loader2 className="spin" size={17} />
              ) : (
                <CheckCheck size={17} />
              )}{" "}
              {saved ? "配置已保存" : "保存连接配置"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
function ImageModal({ frame, onClose }) {
  return (
    <div className="modal-backdrop image-backdrop" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="截图详情"
        className="modal image-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="image-modal-bar">
          <span>{frame.title || "截图详情"}</span>
          <IconButton title="关闭图片" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        <img src={frame.url} alt={frame.title || "完整截图"} />
      </section>
    </div>
  );
}

function ComparisonSummary({ comparison, onDetails }) {
  const results = comparison.results || [];
  return (
    <section className="comparison-panel">
      <div className="comparison-title">
        <GitBranch size={17} />
        <div>
          <b>记忆对比实验</b>
          <span>受控记忆消融 · 相同动作 · 同一随机口令</span>
        </div>
        <button onClick={onDetails}>
          逐项验收对照 <ArrowUpRight size={13} />
        </button>
      </div>
      <div className="comparison-cards">
        {["tracelite", "recent5"].map((policy) => {
          const result = results.find((r) => r.policy === policy);
          const running =
            comparison.status === "running" && comparison.phase === policy;
          const count = result?.checks?.filter((c) => c.passed).length || 0;
          return (
            <div
              key={policy}
              className={`comparison-card ${policy} ${running ? "is-running" : ""}`}
            >
              <div className="comparison-card-name">
                {policy === "tracelite" ? (
                  <Fingerprint size={13} />
                ) : (
                  <Clock3 size={13} />
                )}
                <b>{policy === "tracelite" ? "GUI-Tracelite" : "Recent5"}</b>
                <span>
                  {running ? "正在执行" : result ? "已完成" : "等待执行"}
                </span>
              </div>
              <div className="comparison-card-result">
                <strong>
                  {result ? `${count}/${result.checks?.length || 0}` : "—"}
                  <small>约束通过</small>
                </strong>
                <span
                  className={
                    result?.recovery?.found === true
                      ? "recalled"
                      : result?.recovery?.found === false
                        ? "forgotten"
                        : ""
                  }
                >
                  {result?.recovery?.found === true ? (
                    <CheckCircle2 size={13} />
                  ) : result?.recovery?.found === false ? (
                    <X size={13} />
                  ) : (
                    <Circle size={12} />
                  )}{" "}
                  {result?.recovery?.found === true
                    ? "早期证据已恢复"
                    : result?.recovery?.found === false
                      ? "早期证据未恢复"
                      : "等待恢复检查"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
function ComparisonModal({ comparison, onClose }) {
  const results = comparison.results || [];
  const policies = ["tracelite", "recent5"];
  const names = [
    ...new Set(results.flatMap((r) => (r.checks || []).map((c) => c.name))),
  ];
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal comparison-modal"
        role="dialog"
        aria-modal="true"
        aria-label="记忆对比实验结果"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">CONTROLLED MEMORY ABLATION</span>
            <h2>同一任务，不同的记忆方式</h2>
          </div>
          <IconButton title="关闭对比结果" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </div>
        <div className="comparison-method-note">
          <GitBranch size={16} />
          <div>
            <b>受控记忆消融 · 相同动作 · 同一随机口令</b>
            <p>
              两组执行相同 GUI
              动作。恢复阶段只读取各自保留的观察记录，最终结果由实际界面状态核验。此对比不代表视觉模型自主任务的成功率。
            </p>
          </div>
        </div>
        <div className="comparison-detail-cards">
          {policies.map((policy) => {
            const r = results.find((r) => r.policy === policy);
            const running =
              comparison.status === "running" && comparison.phase === policy;
            return (
              <article
                key={policy}
                className={`comparison-detail-card ${policy}`}
              >
                <span className="eyebrow">
                  {policy === "tracelite"
                    ? "SELECTIVE VISUAL MEMORY"
                    : "RECENCY BASELINE"}
                </span>
                <h3>{policy === "tracelite" ? "GUI-Tracelite" : "Recent5"}</h3>
                <p>
                  {policy === "tracelite"
                    ? "3 张关键原图 + 1 张历史画布 + 当前帧"
                    : "最近 5 帧（含当前），旧观察随窗口滚出"}
                </p>
                <div
                  className={`comparison-verdict ${r?.passed === true ? "passed" : r?.passed === false ? "failed" : ""}`}
                >
                  {r?.passed === true ? (
                    <CheckCircle2 size={16} />
                  ) : r?.passed === false ? (
                    <CircleDot size={16} />
                  ) : running ? (
                    <Loader2 size={16} className="spin" />
                  ) : (
                    <Clock3 size={16} />
                  )}
                  <b>
                    {r?.passed === true
                      ? "全部约束通过"
                      : r?.passed === false
                        ? "存在未通过的约束"
                        : running
                          ? "正在执行真实 GUI 任务"
                          : "等待本组执行"}
                  </b>
                </div>
                <dl>
                  <div>
                    <dt>恢复早期证据</dt>
                    <dd
                      className={
                        r?.recovery?.found === false ? "forgotten" : ""
                      }
                    >
                      {r?.recovery?.found === true
                        ? `已恢复${r.recovery.source ? " · " + r.recovery.source : ""}`
                        : r?.recovery?.found === false
                          ? "未能恢复"
                          : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>真实执行时间</dt>
                    <dd>{r ? duration(r.elapsedMs) : "—"}</dd>
                  </div>
                  <div>
                    <dt>保留图像大小</dt>
                    <dd>{r ? bytes(r.compressedBytes) : "—"}</dd>
                  </div>
                  <div>
                    <dt>图像词元估算</dt>
                    <dd>{r ? number(r.estimatedCompressedTokens) : "—"}</dd>
                  </div>
                </dl>
                {r?.recovery?.availableFrames?.length > 0 && (
                  <div className="recovery-detail">
                    检索时可用帧：{r.recovery.availableFrames.join(" · ")}
                  </div>
                )}
                {r?.recovery?.reason && (
                  <div className="recovery-detail">{r.recovery.reason}</div>
                )}
              </article>
            );
          })}
        </div>
        <div className="comparison-check-table">
          <div className="comparison-check-heading">
            <span>最终验收条件</span>
            <b>GUI-Tracelite</b>
            <b>Recent5</b>
          </div>
          {names.length ? (
            names.map((name) => (
              <div className="comparison-check-row" key={name}>
                <b>{name}</b>
                {policies.map((policy) => {
                  const c = results
                    .find((r) => r.policy === policy)
                    ?.checks?.find((c) => c.name === name);
                  return (
                    <div
                      key={policy}
                      className={
                        c
                          ? c.passed
                            ? "check-passed"
                            : "check-failed"
                          : "check-pending"
                      }
                    >
                      {c ? (
                        c.passed ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          <X size={14} />
                        )
                      ) : (
                        <Clock3 size={14} />
                      )}
                      <span>
                        {c ? (c.passed ? "通过" : "未通过") : "等待运行"}
                        {c?.detail && <small>{c.detail}</small>}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))
          ) : (
            <div className="comparison-check-empty">
              <Loader2
                size={18}
                className={comparison.status === "running" ? "spin" : ""}
              />
              首组完成后，将逐项展示真实验收结果
            </div>
          )}
        </div>
        <div className="comparison-modal-footer">
          <span>结果来自当前这一次实验，不作跨任务泛化。</span>
          <a href="/api/export" download>
            <Download size={14} />
            导出完整实验记录
          </a>
        </div>
      </section>
    </div>
  );
}
function RecentMemoryVisual({ frames, retained, memory, onImage }) {
  const anchor = frames.find((f) => f.events?.includes("anchor")) || frames[0];
  const anchorRetained = anchor && retained.some((f) => f.id === anchor.id);
  const dropped =
    memory.droppedCount ?? Math.max(0, frames.length - retained.length);
  return (
    <>
      <div className="memory-heading recent-heading">
        <h2>
          只记住最近。
          <br />
          <span>更早的会怎样？</span>
        </h2>
        <p>Recent5 · 最近 5 帧（含当前）</p>
      </div>
      <div className="recent-window-panel">
        <div className="recent-window-heading">
          <Clock3 size={13} />
          <b>滑动观察窗口</b>
          <span>
            {retained.length} / {memory.windowSize || 5}
          </span>
        </div>
        <div className="recent-frame-rail">
          {retained.length
            ? retained.map((f) => (
                <button
                  onClick={() => onImage(f)}
                  key={f.id}
                  className={f.id === memory.currentId ? "current" : ""}
                  title={f.title || f.id}
                >
                  <img src={f.url} alt={f.id} />
                  <span>{f.id}</span>
                  {f.id === memory.currentId && <i />}
                </button>
              ))
            : Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="recent-frame-empty">
                  —
                </div>
              ))}
        </div>
        <div className="recent-window-caption">
          <span>旧观察</span>
          <ArrowRight size={13} />
          <span>当前观察</span>
        </div>
        <div className="recent-drop-count">
          <Trash2 size={13} />
          <span>已从记忆窗口移出</span>
          <b>
            {dropped}
            <small>帧</small>
          </b>
        </div>
      </div>
      <div
        className={`anchor-evidence ${anchor && !anchorRetained ? "evicted" : ""}`}
      >
        <div className="anchor-evidence-label">
          <Fingerprint size={13} />
          <b>早期恢复锚点</b>
          <span>
            {anchor ? (anchorRetained ? "仍在窗口" : "已离开窗口") : "等待出现"}
          </span>
        </div>
        {anchor ? (
          <div className="anchor-evidence-body">
            <button onClick={() => onImage(anchor)} title="查看早期截图留档">
              <img src={anchor.url} alt="早期锚点留档" />
              {!anchorRetained && <span>已移出</span>}
            </button>
            <div>
              <b>
                {anchor.id} · {anchor.title}
              </b>
              <p>
                {anchorRetained
                  ? "该观察目前仍会提供给恢复步骤。"
                  : "完整轨迹仍留档，但该观察已不再提供给恢复步骤。"}
              </p>
            </div>
          </div>
        ) : (
          <p className="anchor-empty">运行后跟踪初始约束是否仍在记忆中。</p>
        )}
      </div>
      <div className="recent-budget-note">
        <Layers size={13} />
        两组均使用最多 5 张输入图像
      </div>
    </>
  );
}
function RecentMemoryList({ retained, currentId, onSelect }) {
  return (
    <>
      <div className="keyframe-title">
        <Clock3 size={15} />
        <b>窗口内原图</b>
        <span>{String(retained.length).padStart(2, "0")}</span>
      </div>
      <div className="policy-note">
        最近 5 帧（含当前）· 审计记录 ≠ 决策记忆
      </div>
      <div className="keyframe-list recent-memory-list">
        {retained.length ? (
          retained.map((f) => (
            <article className="keyframe-card" key={f.id}>
              <button className="keyframe-photo" onClick={() => onSelect(f)}>
                <img src={f.url} alt={`窗口原图${f.step}`} />
                <span>{f.id}</span>
              </button>
              <div className="keyframe-copy">
                <b>{f.title || f.action}</b>
                <div className="recent-list-meta">
                  <span>{f.id === currentId ? "当前观察" : "窗口内历史"}</span>
                  <small>STEP {String(f.step).padStart(2, "0")}</small>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-keys">
            <Clock3 size={23} />
            <div>等待观察进入窗口</div>
          </div>
        )}
      </div>
    </>
  );
}

function App() {
  const [presentation, setPresentation] = useState(
    () => new URL(window.location.href).searchParams.get("present") === "1",
  );
  const [state, setState] = useState(INITIAL);
  const [connected, setConnected] = useState(false);
  const [desktopTask, setDesktopTask] = useState(DEFAULT_DESKTOP_TASK);
  const [mode, setMode] = useState("demo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const [comparisonDetails, setComparisonDetails] = useState(false);
  const [image, setImage] = useState(null);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState("screen");
  const [now, setNow] = useState(Date.now());
  const [details, setDetails] = useState(true);
  const logEnd = useRef(null);
  const timelineStrip = useRef(null);
  const lastReceived = useRef(Date.now());
  const [runTask, setRunTask] = useState("");
  useEffect(() => {
    let alive = true;
    const receive = (d) => {
      if (!alive) return;
      lastReceived.current = Date.now();
      setState({
        ...INITIAL,
        ...d,
        memory: { keys: [], ...d.memory },
        frames: d.frames || [],
        logs: d.logs || [],
      });
      if (["running", "paused"].includes(d.status)) setMode(d.mode || "demo");
      if (d.task) setRunTask(d.task);
    };
    api("/api/state")
      .then(receive)
      .catch((e) => setError(e.message));
    const es = new EventSource("/api/events");
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        receive(JSON.parse(e.data));
        setConnected(true);
      } catch {}
    };
    es.onerror = () => setConnected(false);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      es.close();
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state.logs.length]);
  useEffect(() => {
    const close = (e) => {
      if (e.key === "Escape") {
        setImage(null);
        setSettings(false);
        setComparisonDetails(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  useEffect(() => {
    if (!selected && timelineStrip.current)
      timelineStrip.current.scrollTo({
        left: timelineStrip.current.scrollWidth,
        behavior: "smooth",
      });
  }, [state.frames.length, selected]);
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 8000);
    return () => clearTimeout(t);
  }, [error]);
  const frames = state.frames;
  const current = selected
    ? frames.find((f) => f.id === selected) || frames.at(-1)
    : frames.at(-1);
  const keys = frames.filter(
    (f) => (state.memory.keys || []).includes(f.id) || f.key,
  );
  const elapsed =
    (state.elapsedMs || 0) +
    (state.status === "running" ? now - lastReceived.current : 0);
  const active =
    ["running", "paused"].includes(state.status) ||
    state.comparison?.status === "running";
  const isRecent =
    state.policy === "recent5" || state.memory.policy === "recent5";
  const retained = frames.filter(
    (f) =>
      (state.memory.recent || []).includes(f.id) ||
      f.id === state.memory.currentId,
  );
  const timelineMemory = isRecent ? retained : keys;
  const ratio = state.totalSteps
    ? Math.min(100, (state.step / state.totalSteps) * 100)
    : 0;
  const savings = state.memory.savings
    ? state.memory.savings <= 1
      ? state.memory.savings * 100
      : state.memory.savings
    : 0;
  async function perform(path, body) {
    setBusy(true);
    try {
      const result = await api(path, body);
      if (result.status) setState((s) => ({ ...s, ...result }));
      return result;
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    setSelected(null);
    await perform("/api/run", {
      task: mode === "demo" ? DEFAULT_TASK : desktopTask,
      mode,
      pace: 1,
    });
  }
  function togglePresentation() {
    const next = !presentation;
    setPresentation(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("present", "1");
    else url.searchParams.delete("present");
    window.history.replaceState({}, "", url);
  }
  return (
    <div className={`app-shell ${presentation ? "presentation-mode" : ""}`}>
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <header className="topbar">
        <a className="brand" href="/" aria-label="UI-Trace-Effeciency 首页">
          <Logo />
          <div>
            <strong>
              UI-Trace-Effeciency<span className="brand-period">.</span>
            </strong>
            <span className="brand-sub">
              VISUAL MEMORY · TEMPORAL INTELLIGENCE
            </span>
          </div>
        </a>
        <div className="topbar-center">
          <span className="workspace-badge">
            <span /> LOCAL WORKSPACE
          </span>
          <div className="header-divider" />
          <span className="method-badge">
            {isRecent ? "Recent5" : "GUI-Tracelite"}{" "}
            <span>{isRecent ? "BASELINE" : "ENGINE"}</span>
          </span>
        </div>
        <div className="topbar-right">
          <span className={`connection ${connected ? "connected" : ""}`}>
            <i />
            {connected ? "服务已连接" : "连接中"}
          </span>
          <button
            className={`presentation-toggle ${presentation ? "enabled" : ""}`}
            onClick={togglePresentation}
            aria-pressed={presentation}
            title={
              presentation
                ? "退出展演模式"
                : "展演模式：完整展示画面、时间线和记忆"
            }
          >
            <Expand size={14} />
            <span>{presentation ? "退出展演" : "展演模式"}</span>
          </button>
          <IconButton
            title="模型接口设置"
            disabled={active}
            onClick={() => setSettings(true)}
          >
            <Settings2 size={19} />
          </IconButton>
          <a className="export-button" href="/api/export" download>
            <Download size={15} />
            <span>导出记录</span>
          </a>
        </div>
      </header>
      <div className="workspace-top">
        <div>
          <span className="eyebrow">
            <span className="slash">/</span> MEMORY OBSERVATORY
          </span>
          <h1>
            让历史，成为下一步的依据<span>。</span>
          </h1>
          <p>关键帧保真 · 冗余轨迹压缩 · 长时序依赖回溯</p>
        </div>
        <div className="session-id">
          <span>EXECUTION SESSION</span>
          <b>{state.runId || "LOCAL / READY"}</b>
          <div>
            <Monitor size={13} />
            <span>在你的电脑上运行</span>
          </div>
        </div>
      </div>
      <main className="workspace-grid">
        <aside className="mission-column">
          <section className="panel mission-panel">
            <div className="panel-label">
              <Command size={15} />
              <span>任务指令</span>
              <span className="label-number">01</span>
            </div>
            <div className="mode-toggle">
              <button
                className={mode === "demo" ? "selected" : ""}
                disabled={active}
                onClick={() => setMode("demo")}
              >
                <Play size={13} />
                长时序演示
              </button>
              <button
                className={mode === "desktop" ? "selected" : ""}
                disabled={active}
                onClick={() => setMode("desktop")}
              >
                <Monitor size={13} />
                自由任务
              </button>
            </div>
            <div className="mission-tag">
              <span className="orange-dot" />
              {mode === "demo"
                ? "TEMPORAL CONFLICT / 长程依赖"
                : "DESKTOP CONTROL / 本机执行"}
            </div>
            <textarea
              className="task-input"
              aria-label="任务指令"
              value={
                active
                  ? runTask || (mode === "demo" ? DEFAULT_TASK : desktopTask)
                  : mode === "demo"
                    ? DEFAULT_TASK
                    : desktopTask
              }
              readOnly={mode === "demo"}
              disabled={active}
              onChange={(e) => setDesktopTask(e.target.value)}
              spellCheck={false}
            />
            <div className="task-footnote">
              <Clock3 size={13} />
              {mode === "demo"
                ? "约 2–3 分钟 · 固定演示任务"
                : "模型自主执行 · 需要配置视觉模型"}
            </div>
            <div className="run-controls">
              {!active ? (
                <button
                  className="primary-button start-button"
                  disabled={busy || (mode === "desktop" && !desktopTask.trim())}
                  onClick={start}
                >
                  {busy ? (
                    <Loader2 size={17} className="spin" />
                  ) : (
                    <Play size={16} fill="currentColor" />
                  )}
                  <span>
                    {state.status === "idle" ? "启动任务" : "重新运行"}
                  </span>
                  <ArrowUpRight size={17} />
                </button>
              ) : (
                <>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() =>
                      perform("/api/control", {
                        action: state.status === "paused" ? "resume" : "pause",
                      })
                    }
                  >
                    {state.status === "paused" ? (
                      <Play size={16} />
                    ) : (
                      <Pause size={16} />
                    )}{" "}
                    {state.status === "paused" ? "继续执行" : "暂停执行"}
                  </button>
                  <button
                    className="stop-button"
                    disabled={busy}
                    title="停止任务"
                    onClick={() => perform("/api/control", { action: "stop" })}
                  >
                    <Square size={16} />
                  </button>
                </>
              )}
            </div>
            {mode === "demo" && (
              <button
                className="compare-launch-button"
                disabled={busy || active}
                onClick={() => {
                  setSelected(null);
                  perform("/api/compare", { pace: 1 });
                }}
              >
                <GitBranch size={16} />
                <div>
                  <b>
                    {state.comparison?.status === "running"
                      ? "记忆对比实验进行中"
                      : "记忆对比实验"}
                  </b>
                  <span>GUI-Tracelite × Recent5 · 约 5 分钟</span>
                </div>
                <ArrowUpRight size={15} />
              </button>
            )}
            {!active && state.status !== "idle" && (
              <button
                className="reset-button"
                disabled={busy}
                onClick={() => {
                  setSelected(null);
                  perform("/api/control", { action: "reset" });
                }}
              >
                <RotateCcw size={12} />
                清空当前会话
              </button>
            )}
            <div className="mode-note">
              {mode === "demo"
                ? isRecent
                  ? "动作预编排 · 最近5帧 · 受控记忆消融"
                  : "动作预编排 · 真实截图 · 在线记忆压缩"
                : "执行将作用于本机；请先在设置中连接可用模型。"}
            </div>
          </section>
          <section className="panel workflow-panel">
            <div className="panel-label">
              <GitBranch size={15} />
              <span>{mode === "demo" ? "时序任务链" : "视觉执行闭环"}</span>
              <span className="mini-tag">
                {mode === "demo" ? "5 PHASES" : "4 STAGES"}
              </span>
            </div>
            <TaskStages state={state} mode={mode} />
            <div className="dependency-note">
              <GitBranch size={15} />
              <div>
                {isRecent ? "滑动窗口边界" : "跨阶段依赖"}
                <small>
                  {isRecent
                    ? "早期信息随新观察滚出记忆窗口"
                    : "前序证据不会因后续修改而消失"}
                </small>
              </div>
              <ArrowUpRight size={14} />
            </div>
          </section>
          <section className="quick-panel">
            <div className="quick-title">
              本机快速操作 <span>QUICK ACTIONS</span>
            </div>
            <div className="quick-actions">
              {[
                ["Finder", FolderOpen, "访达"],
                ["Calculator", Plus, "计算器"],
                ["TextEdit", FileText, "文本编辑"],
                ["System Settings", Settings2, "系统设置"],
              ].map(([app, Icon, label]) => (
                <button
                  key={app}
                  disabled={busy || active}
                  title={`打开${label}`}
                  onClick={() => perform("/api/open", { app })}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>
        <div className="execution-column">
          <section className="metrics-grid">
            <div className="metric">
              <div>
                <Activity size={14} />
                执行步数
              </div>
              <strong>
                {String(state.step || 0).padStart(2, "0")}
                <small>/ {state.totalSteps || "—"}</small>
              </strong>
              <span>REPLAYABLE ACTIONS</span>
            </div>
            <div className="metric">
              <div>
                <Clock3 size={14} />
                {state.comparison ? "本组运行时间" : "真实运行时间"}
              </div>
              <strong>{duration(elapsed)}</strong>
              <span>WALL-CLOCK TIME</span>
            </div>
            <div className="metric accent-metric">
              <div>
                <Zap size={14} />
                {isRecent ? "窗口存储减少" : "图像存储压缩"}
              </div>
              <strong>
                {frames.length ? savings.toFixed(1) : "—"}
                <small>%</small>
              </strong>
              <span>基于实际图像字节</span>
            </div>
          </section>
          <section className="panel viewport-panel">
            <div className="viewport-toolbar">
              <div className="view-tabs">
                <button
                  className={view === "screen" ? "selected" : ""}
                  onClick={() => setView("screen")}
                >
                  <Monitor size={14} />
                  实时画面
                </button>
                <button
                  className={view === "events" ? "selected" : ""}
                  onClick={() => setView("events")}
                >
                  <Terminal size={14} />
                  执行日志<span className="log-count">{state.logs.length}</span>
                </button>
              </div>
              <div className="viewport-tools">
                <span className={`status-dot ${state.status}`} />
                <span>{STATUS[state.status] || state.status}</span>
                <IconButton
                  title="放大当前截图"
                  disabled={!current}
                  onClick={() => setImage(current)}
                >
                  <Maximize2 size={15} />
                </IconButton>
              </div>
            </div>
            {view === "screen" ? (
              <div className={`screen-area ${current ? "has-frame" : ""}`}>
                {current ? (
                  <>
                    <img
                      className="live-screen"
                      src={current.url}
                      alt={`第${current.step}步：${current.title || current.action}`}
                      onClick={() => setImage(current)}
                    />
                    <div className="screen-corner top-left" />
                    <div className="screen-corner bottom-right" />
                    {state.status === "running" && !selected && (
                      <div className="scanning-line" />
                    )}
                    <div className="screen-meta">
                      <span>
                        <i
                          className={selected ? "historical-dot" : "live-dot"}
                        />
                        {selected
                          ? "HISTORY FRAME"
                          : state.status === "running"
                            ? "LIVE OBSERVATION"
                            : "LATEST OBSERVATION"}
                      </span>
                      <b>STEP {String(current.step || 0).padStart(2, "0")}</b>
                    </div>
                    {selected && (
                      <button
                        className="back-live"
                        onClick={() => setSelected(null)}
                      >
                        <Radio size={13} />
                        回到实时
                      </button>
                    )}
                  </>
                ) : (
                  <EmptyViewport />
                )}
              </div>
            ) : (
              <div className="execution-logs">
                {!state.logs.length ? (
                  <div className="empty-logs">
                    <Terminal size={24} />
                    <p>动作执行后，日志将实时出现在这里</p>
                  </div>
                ) : (
                  state.logs.map((log, i) => (
                    <div key={i} className={`log-entry ${log.type}`}>
                      <time>
                        {typeof log.time === "string"
                          ? log.time.slice(11, 19) || log.time
                          : new Date(log.time || Date.now()).toLocaleTimeString(
                              "zh-CN",
                              { hour12: false },
                            )}
                      </time>
                      <span className="log-type">
                        {log.type === "error"
                          ? "ERR"
                          : log.type === "memory"
                            ? "MEM"
                            : log.type === "action"
                              ? "ACT"
                              : "SYS"}
                      </span>
                      <p>{log.text}</p>
                    </div>
                  ))
                )}
                <div ref={logEnd} />
              </div>
            )}
            <div className="current-action">
              <div className="action-icon">
                {state.status === "running" ? (
                  <Loader2 size={18} className="spin" />
                ) : state.status === "completed" ? (
                  <CheckCheck size={18} />
                ) : (
                  <MousePointer2 size={18} />
                )}
              </div>
              <div>
                <span>{selected ? "HISTORICAL ACTION" : "CURRENT ACTION"}</span>
                <p>
                  {selected
                    ? current?.action || current?.title
                    : state.message || "启动任务后，实时查看每一步操作与观察"}
                </p>
              </div>
              <span className="action-step">
                {state.step > 0
                  ? `#${String(selected ? current?.step : state.step).padStart(3, "0")}`
                  : "STANDBY"}
              </span>
            </div>
            <div className="progress-track">
              <div style={{ width: `${ratio}%` }} />
            </div>
          </section>
          <section className="panel timeline-panel">
            <div className="panel-label">
              <GitBranch size={15} />
              <span>视觉轨迹时间线</span>
              <div className="timeline-legend">
                <span>
                  <i className="key-dot" />
                  {isRecent ? "窗口内原图" : "关键节点"}
                </span>
                <span>
                  <i />
                  {isRecent ? "已离开窗口" : "画布节点"}
                </span>
              </div>
              <span className="label-number">{frames.length} FRAMES</span>
            </div>
            <div className="timeline-scroll" ref={timelineStrip}>
              {!frames.length ? (
                <div className="empty-timeline">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div className="timeline-ghost" key={i}>
                      <span>{String(i).padStart(2, "0")}</span>
                      <Frame size={21} />
                      <i />
                    </div>
                  ))}
                  <div className="timeline-empty-text">完整轨迹将在此展开</div>
                </div>
              ) : (
                frames.map((f) => {
                  const key = timelineMemory.some((k) => k.id === f.id);
                  return (
                    <button
                      key={f.id}
                      className={`timeline-frame ${key ? "is-key" : ""} ${current?.id === f.id ? "is-selected" : ""}`}
                      onClick={() => {
                        setSelected(f.id);
                        setView("screen");
                      }}
                      title={f.title || f.action}
                    >
                      <div className="timeline-image">
                        <img src={f.url} alt={`步骤 ${f.step}`} />
                        {key && (
                          <span className="frame-key">
                            {isRecent ? (
                              <Clock3 size={10} />
                            ) : (
                              <Fingerprint size={10} />
                            )}
                          </span>
                        )}
                      </div>
                      <div className="timeline-frame-bottom">
                        <b>{String(f.step).padStart(2, "0")}</b>
                        <span>{f.title || f.action || "观测"}</span>
                      </div>
                      <i className="timeline-pin" />
                    </button>
                  );
                })
              )}
            </div>
          </section>
          {state.comparison && (
            <ComparisonSummary
              comparison={state.comparison}
              onDetails={() => setComparisonDetails(true)}
            />
          )}
          {state.result && !state.comparison && (
            <section
              className={`result-panel ${state.result.passed === null ? "unverified" : state.result.passed ? "passed" : "failed"}`}
            >
              <div className="result-title">
                {state.result.passed ? (
                  <CheckCircle2 size={20} />
                ) : (
                  <CircleDot size={20} />
                )}
                <div>
                  <b>
                    {state.result.passed === null
                      ? "模型报告完成 · 结果待核对"
                      : state.result.passed
                        ? "长时序任务验收通过"
                        : "任务已结束 · 查看检查结果"}
                  </b>
                  <span>{state.result.note || "基于最终成果的检查结果"}</span>
                </div>
                <a href="/api/export" download>
                  <Download size={15} />
                  完整记录
                </a>
              </div>
              <div className="result-checks">
                {state.result.checks?.map((c, i) => (
                  <div key={i}>
                    <span className={c.passed ? "pass" : "fail"}>
                      {c.passed ? <Check size={12} /> : <X size={12} />}
                    </span>
                    <b>{c.name}</b>
                    <small>{c.detail}</small>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
        <aside className="memory-column">
          <section
            className={`panel memory-panel ${isRecent ? "recent-policy" : ""}`}
          >
            <div className="panel-label">
              <Layers size={16} />
              <span>{isRecent ? "Recent5 观察窗口" : "动态视觉记忆"}</span>
              <span className="engine-chip">
                {state.status === "running"
                  ? "LIVE"
                  : frames.length
                    ? "STORED"
                    : "READY"}
              </span>
            </div>
            {isRecent ? (
              <RecentMemoryVisual
                frames={frames}
                retained={retained}
                memory={state.memory}
                onImage={setImage}
              />
            ) : (
              <>
                <div className="memory-heading">
                  <h2>
                    少一些像素。
                    <br />
                    <span>留下关键。</span>
                  </h2>
                  <p>关键原图保留，其余历史压入一张画布</p>
                </div>
                <MemoryIngestion
                  frames={frames}
                  keys={keys}
                  memory={state.memory}
                  running={state.status === "running"}
                />
                <div className="canvas-toolbar">
                  <span>
                    <Frame size={12} /> COMPRESSED CANVAS
                  </span>
                  <span>{state.memory.compressedCount || 0} 帧</span>
                </div>
                <div
                  className="canvas-wrap"
                  key={state.memory.canvasUrl || "empty"}
                >
                  {state.memory.canvasUrl ? (
                    <>
                      <img
                        src={state.memory.canvasUrl}
                        alt="动态压缩历史画布"
                        onClick={() =>
                          setImage({
                            url: state.memory.canvasUrl,
                            title: "视觉记忆压缩画布",
                          })
                        }
                      />
                      <IconButton
                        title="查看完整压缩画布"
                        onClick={() =>
                          setImage({
                            url: state.memory.canvasUrl,
                            title: "视觉记忆压缩画布",
                          })
                        }
                      >
                        <Expand size={14} />
                      </IconButton>
                      <span className="canvas-label">
                        {state.memory.canvasWidth || 1536} ×{" "}
                        {state.memory.canvasHeight || 864} · VISUAL ATLAS
                      </span>
                    </>
                  ) : (
                    <div className="empty-canvas">
                      <div className="canvas-grid">
                        {Array.from({ length: 12 }, (_, i) => (
                          <div key={i}>
                            {i === 4 ? <ScanLine size={16} /> : <span />}
                          </div>
                        ))}
                      </div>
                      <span>观测帧进入后，画布将动态生成</span>
                    </div>
                  )}
                </div>
                <div className="memory-flow">
                  <span>{state.memory.compressedCount || 0} 张非关键历史</span>
                  <ArrowRight size={14} />
                  <span>
                    <b>{state.memory.canvasUrl ? 1 : 0}</b> 张记忆画布
                  </span>
                </div>
              </>
            )}
            {state.recovery && (
              <div
                className={`recovery-probe ${state.recovery.found === false ? "missed" : "found"}`}
              >
                <div>
                  {state.recovery.found === false ? (
                    <CircleDot size={14} />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  <b>
                    {state.recovery.found === false
                      ? "早期唯一口令未命中"
                      : "早期唯一口令已恢复"}
                  </b>
                </div>
                <p>
                  {state.recovery.found === false
                    ? "检索时可用帧：" +
                      (state.recovery.availableFrames || []).join(" · ")
                    : "命中保留观察：" + (state.recovery.source || "—")}
                </p>
                {state.recovery.found === false && (
                  <small>预算可从任务指令恢复；随机口令不在指令中。</small>
                )}
              </div>
            )}
            <div className="byte-comparison">
              <div>
                <span>完整历史</span>
                <b>{bytes(state.memory.originalBytes)}</b>
              </div>
              <div className="compression-bars">
                <span style={{ width: frames.length ? "100%" : "12%" }} />
                <span
                  style={{
                    width: frames.length
                      ? `${Math.max(4, 100 - savings)}%`
                      : "4%",
                  }}
                />
              </div>
              <div>
                <span>当前视觉记忆</span>
                <b className="teal">{bytes(state.memory.compressedBytes)}</b>
              </div>
            </div>
            <div className="token-estimate">
              <span>
                图像词元预算 <small>估算</small>
              </span>
              <b>
                {number(state.memory.estimatedOriginalTokens)}
                <ArrowRight size={11} />
                <em>{number(state.memory.estimatedCompressedTokens)}</em>
              </b>
            </div>
            <div className="memory-divider" />
            {isRecent ? (
              <RecentMemoryList
                retained={retained}
                currentId={state.memory.currentId}
                onSelect={(f) => {
                  setSelected(f.id);
                  setView("screen");
                }}
              />
            ) : (
              <>
                <div className="keyframe-title">
                  <Fingerprint size={15} />
                  <b>关键节点原图</b>
                  <span>{keys.length.toString().padStart(2, "0")}</span>
                  <IconButton
                    title={details ? "收起选取依据" : "展开选取依据"}
                    onClick={() => setDetails(!details)}
                  >
                    <ChevronDown
                      size={14}
                      className={details ? "" : "rotated"}
                    />
                  </IconButton>
                </div>
                <div className="policy-note">
                  在线规则评分 · 原始锚点优先 · 阶段多样性
                </div>
                <div className="keyframe-list">
                  {keys.length ? (
                    keys.map((f) => (
                      <article className="keyframe-card" key={f.id}>
                        <button
                          className="keyframe-photo"
                          onClick={() => {
                            setSelected(f.id);
                            setView("screen");
                          }}
                        >
                          <img src={f.url} alt={`关键截图${f.step}`} />
                          <span>K{String(f.step).padStart(2, "0")}</span>
                        </button>
                        <div className="keyframe-copy">
                          <b>{f.title || `关键证据 · 步骤 ${f.step}`}</b>
                          <div className="key-score">
                            <span>重要度</span>
                            <i>
                              <em
                                style={{
                                  width: `${Math.min(100, Number(f.score || 0) <= 1 ? f.score * 100 : f.score)}%`,
                                }}
                              />
                            </i>
                            <strong>
                              {typeof f.score === "number"
                                ? f.score <= 1
                                  ? f.score.toFixed(2)
                                  : f.score.toFixed(0)
                                : "—"}
                            </strong>
                          </div>
                          {details && (
                            <p>
                              {Array.isArray(f.reasons)
                                ? f.reasons.join(" · ")
                                : f.reasons || "保留供后续决策核验"}
                            </p>
                          )}
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="empty-keys">
                      <Fingerprint size={23} />
                      <div>
                        等待关键证据
                        <small>
                          在线启发式评分：关联性、状态变化与时序冲突
                        </small>
                      </div>
                    </div>
                  )}
                </div>{" "}
              </>
            )}
          </section>
          <div className="memory-footer">
            <div>
              <ShieldCheck size={14} />
              <span>
                {isRecent
                  ? "窗口边界可追溯 · 最终状态独立核验"
                  : "可解释选取 · 原始截图可追溯"}
              </span>
            </div>
            <span>
              {isRecent
                ? "RECENT5 / ABLATION BASELINE"
                : "GUI-TRACELITE / MEMORY V1"}
            </span>
          </div>
        </aside>
      </main>
      <footer className="page-footer">
        <span>
          <span className="footer-dot" />
          LOCAL EXECUTION · REAL OBSERVATIONS
        </span>
        <p>保留决策证据，而不只是保留最近发生的事。</p>
        <span>
          UI-TRACE-EFFECIENCY <small>2026</small>
        </span>
      </footer>
      {error && (
        <div className="error-toast" role="alert">
          <CircleDot size={18} />
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="关闭错误提示">
            <X size={16} />
          </button>
        </div>
      )}
      {settings && (
        <SettingsModal onClose={() => setSettings(false)} onError={setError} />
      )}{" "}
      {comparisonDetails && state.comparison && (
        <ComparisonModal
          comparison={state.comparison}
          onClose={() => setComparisonDetails(false)}
        />
      )}
      {image && <ImageModal frame={image} onClose={() => setImage(null)} />}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
