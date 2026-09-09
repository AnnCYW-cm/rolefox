const navItems = [
  { icon: "⌂", label: "今日概览", active: true },
  { icon: "⌕", label: "岗位雷达" },
  { icon: "✓", label: "校准与异常", badge: "3" },
  { icon: "↗", label: "投递看板" },
  { icon: "◷", label: "面试日程" },
];

const jobs = [
  {
    score: 92,
    title: "Product Manager, Automation",
    company: "Atlas Labs（示例）",
    meta: "新加坡 · 混合办公 · SGD 9K–13K/月",
    reason: "工作流产品经验匹配，核心条件均已满足",
    tag: "符合自动规则",
    tone: "strong",
  },
  {
    score: 86,
    title: "Product Operations Lead",
    company: "Northstar（示例）",
    meta: "全球远程 · USD 90K–120K/年",
    reason: "跨团队交付经验匹配，工作时区尚未被当前规则覆盖",
    tag: "规则例外",
    tone: "review",
  },
  {
    score: 79,
    title: "Product Strategy Manager",
    company: "Acme Systems（示例）",
    meta: "德国柏林 · 混合办公 · EUR 75K–95K/年",
    reason: "产品策略经验匹配，语言要求仍需核实",
    tag: "信息不足",
    tone: "muted",
  },
];

const funnel = [
  { label: "已发现", value: 24, color: "var(--forest)" },
  { label: "高匹配", value: 7, color: "var(--orange)" },
  { label: "需处理", value: 3, color: "var(--amber)" },
  { label: "已投递", value: 0, color: "var(--sage)" },
];

function MiniSparkline() {
  return (
    <svg viewBox="0 0 86 32" role="img" aria-label="最近七天趋势">
      <path d="M2 25C12 24 15 17 25 19s13 6 22 0 13-15 20-10 10 1 17-6" />
      <circle cx="84" cy="3" r="2.5" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            🦊
          </span>
          <span>
            <strong>RoleFox</strong>
            <small>开源求职 Autopilot</small>
          </span>
        </div>

        <nav aria-label="主要导航">
          <p className="nav-heading">工作台</p>
          {navItems.map((item) => (
            <button
              className={`nav-item ${item.active ? "active" : ""}`}
              disabled
              key={item.label}
              title="M0 静态原型"
              type="button"
            >
              <span className="nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
              {item.badge ? <em>{item.badge}</em> : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="automation-card">
            <div className="automation-topline">
              <span className="status-dot" />
              安全规则预览
            </div>
            <strong>L2 · 校准期逐次确认</strong>
            <span>校准后 L3 · 规则内自动，异常才打扰</span>
          </div>
          <button
            className="settings-button"
            disabled
            title="M0 静态原型"
            type="button"
          >
            <span aria-hidden="true">⚙</span> 设置与规则
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">M0 通用演示 · 面试前 Autopilot</p>
            <h1>设定目标，等面试通知</h1>
            <p className="subtitle">
              完成校准后，RoleFox 将按你的规则筛选、定制、投递和沟通；只有约到面试或遇到规则例外时才打扰你。
            </p>
          </div>
          <div className="header-actions">
            <span className="demo-pill">通用演示</span>
            <button
              className="icon-button"
              aria-label="通知功能规划中"
              disabled
              title="M0 静态原型"
              type="button"
            >
              ♢
              <span />
            </button>
            <div className="avatar">RF</div>
          </div>
        </header>

        <div className="safety-banner">
          <div className="shield" aria-hidden="true">
            ✓
          </div>
          <div>
            <strong>静态产品原型 · Dry-run</strong>
            <span>以下是合成工作流预览，当前没有后台扫描、投递或回复。</span>
          </div>
          <button disabled title="M0 静态原型" type="button">
            规则配置 · 规划中
          </button>
        </div>

        <section className="stat-grid" aria-label="今日求职数据">
          <article className="stat-card featured">
            <div className="stat-topline">
              <span>示例新岗位</span>
              <span className="stat-icon">⌕</span>
            </div>
            <div className="stat-value">24</div>
            <div className="stat-detail">
              <span>来自 4 个模拟渠道</span>
              <MiniSparkline />
            </div>
          </article>
          <article className="stat-card">
            <div className="stat-topline">
              <span>示例高匹配</span>
              <span className="stat-icon orange">✦</span>
            </div>
            <div className="stat-value">7</div>
            <div className="stat-detail positive">↗ 比昨日多 2 个</div>
          </article>
          <article className="stat-card">
            <div className="stat-topline">
              <span>示例需处理</span>
              <span className="stat-icon amber">✓</span>
            </div>
            <div className="stat-value">3</div>
            <div className="stat-detail">校准项与规则例外</div>
          </article>
          <article className="stat-card">
            <div className="stat-topline">
              <span>示例面试</span>
              <span className="stat-icon green">◷</span>
            </div>
            <div className="stat-value">1</div>
            <div className="stat-detail interview-detail">
              <span>周四 14:00</span>
              <strong>还有 2 天</strong>
            </div>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel job-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Autopilot 处理队列</p>
                <h2>RoleFox 将如何处理这些岗位</h2>
              </div>
              <button disabled title="M0 静态原型" type="button">
                完整列表 · 规划中
              </button>
            </div>

            <div className="job-list">
              {jobs.map((job) => (
                <div className="job-row" key={`${job.company}-${job.title}`}>
                  <div className={`score ${job.tone}`}>
                    <strong>{job.score}</strong>
                    <span>匹配度</span>
                  </div>
                  <div className="job-copy">
                    <div className="job-title-line">
                      <h3>{job.title}</h3>
                      <span className={`job-tag ${job.tone}`}>{job.tag}</span>
                    </div>
                    <p className="company">{job.company}</p>
                    <p className="job-meta">{job.meta}</p>
                    <p className="match-reason">
                      <span aria-hidden="true">✦</span> {job.reason}
                    </p>
                  </div>
                  <button
                    className="round-arrow"
                    aria-label={`查看 ${job.title}`}
                    disabled
                    title="M0 静态原型"
                    type="button"
                  >
                    →
                  </button>
                </div>
              ))}
            </div>
          </article>

          <div className="right-column">
            <article className="panel funnel-panel">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">模拟漏斗</p>
                  <h2>今日进展</h2>
                </div>
                <span className="live-label">
                  <i /> 原型
                </span>
              </div>
              <div className="funnel-list">
                {funnel.map((item, index) => (
                  <div className="funnel-item" key={item.label}>
                    <div className="funnel-label">
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                    <div className="funnel-track">
                      <span
                        style={{
                          background: item.color,
                          width: `${Math.max(8, (item.value / funnel[0].value) * 100)}%`,
                        }}
                      />
                    </div>
                    {index < funnel.length - 1 ? <b aria-hidden="true">↓</b> : null}
                  </div>
                ))}
              </div>
              <p className="funnel-note">当前处于安全演示模式，已投递数据为 0。</p>
            </article>

            <article className="panel approval-panel">
              <div className="approval-icon">✓</div>
              <div>
                <p className="eyebrow">校准与规则例外</p>
                <h2>3 个示例事项需要处理</h2>
                <p>校准期用于确认策略；稳定运行后，规则内动作自动完成，只有异常才会出现在这里。</p>
              </div>
              <button disabled title="M0 静态原型" type="button">
                校准与异常 · 规划中
              </button>
            </article>
          </div>
        </section>

        <footer>
          <span>
            <i /> 模拟扫描时间：2 分钟前
          </span>
          <span>RoleFox M0 静态原型 · 所有人物、岗位和进度均为合成数据</span>
        </footer>
      </section>
    </main>
  );
}
