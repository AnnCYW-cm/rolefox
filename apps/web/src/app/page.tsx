const navItems = [
  { icon: "⌂", label: "今日概览", active: true },
  { icon: "⌕", label: "岗位雷达" },
  { icon: "✓", label: "待我确认", badge: "3" },
  { icon: "↗", label: "投递看板" },
  { icon: "◷", label: "面试日程" },
];

const jobs = [
  {
    score: 92,
    title: "AI 产品经理",
    company: "云图智能",
    meta: "杭州 · 25–40K · 3–5 年",
    reason: "企业 AI 落地、智能体产品经验高度匹配",
    tag: "建议投递",
    tone: "strong",
  },
  {
    score: 86,
    title: "企业 AI 解决方案顾问",
    company: "明远科技",
    meta: "上海 / 远程 · 30–45K · 5–10 年",
    reason: "培训与咨询经验匹配，需确认出差频率",
    tag: "待确认",
    tone: "review",
  },
  {
    score: 79,
    title: "Agent 产品专家",
    company: "星河网络",
    meta: "杭州 · 28–42K · 5–10 年",
    reason: "智能体方向匹配，团队管理经验要求待核实",
    tag: "补充信息",
    tone: "muted",
  },
];

const funnel = [
  { label: "已发现", value: 24, color: "var(--forest)" },
  { label: "高匹配", value: 7, color: "var(--orange)" },
  { label: "待确认", value: 3, color: "var(--amber)" },
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
            <small>求职智能体</small>
          </span>
        </div>

        <nav aria-label="主要导航">
          <p className="nav-heading">工作台</p>
          {navItems.map((item) => (
            <button
              className={`nav-item ${item.active ? "active" : ""}`}
              key={item.label}
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
              安全模式运行中
            </div>
            <strong>L2 · 每次投递需确认</strong>
            <span>所有动作都可预览和撤销</span>
          </div>
          <button className="settings-button" type="button">
            <span aria-hidden="true">⚙</span> 设置与规则
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">2026年9月8日 · 星期二</p>
            <h1>早上好，今天有 7 个岗位值得看</h1>
            <p className="subtitle">RoleFox 已完成本轮搜索、去重与匹配评分。</p>
          </div>
          <div className="header-actions">
            <span className="demo-pill">演示数据</span>
            <button className="icon-button" aria-label="通知" type="button">
              ♢
              <span />
            </button>
            <div className="avatar">CY</div>
          </div>
        </header>

        <div className="safety-banner">
          <div className="shield" aria-hidden="true">
            ✓
          </div>
          <div>
            <strong>Dry-run 已开启</strong>
            <span>RoleFox 只会准备材料，不会未经你确认对外投递或回复。</span>
          </div>
          <button type="button">查看自动化规则 →</button>
        </div>

        <section className="stat-grid" aria-label="今日求职数据">
          <article className="stat-card featured">
            <div className="stat-topline">
              <span>今日新岗位</span>
              <span className="stat-icon">⌕</span>
            </div>
            <div className="stat-value">24</div>
            <div className="stat-detail">
              <span>来自 4 个渠道</span>
              <MiniSparkline />
            </div>
          </article>
          <article className="stat-card">
            <div className="stat-topline">
              <span>高匹配岗位</span>
              <span className="stat-icon orange">✦</span>
            </div>
            <div className="stat-value">7</div>
            <div className="stat-detail positive">↗ 比昨日多 2 个</div>
          </article>
          <article className="stat-card">
            <div className="stat-topline">
              <span>等待确认</span>
              <span className="stat-icon amber">✓</span>
            </div>
            <div className="stat-value">3</div>
            <div className="stat-detail">材料已经准备完成</div>
          </article>
          <article className="stat-card">
            <div className="stat-topline">
              <span>本周面试</span>
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
                <p className="eyebrow">智能推荐</p>
                <h2>最值得关注的岗位</h2>
              </div>
              <button type="button">查看全部 7 个 →</button>
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
                  <p className="eyebrow">实时漏斗</p>
                  <h2>今日进展</h2>
                </div>
                <span className="live-label">
                  <i /> 实时
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
                <p className="eyebrow">需要你的决定</p>
                <h2>3 份材料等待确认</h2>
                <p>检查简历改动和招呼语后，即可加入投递队列。</p>
              </div>
              <button type="button">进入审批中心</button>
            </article>
          </div>
        </section>

        <footer>
          <span>
            <i /> 上次扫描：2 分钟前
          </span>
          <span>RoleFox pre-alpha · 所有岗位均为虚构演示数据</span>
        </footer>
      </section>
    </main>
  );
}
