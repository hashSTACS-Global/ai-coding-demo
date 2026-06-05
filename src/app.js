import {
  FOLLOW_UP_METHODS,
  LEAD_STATUSES,
  addFollowUp,
  createInitialState,
  createLead,
  getAllowedNextStatuses,
  getLeadTimeline,
  getOwnerName,
  getSalesHome,
  getStatusLogs,
  getSupervisorRisks,
  getUser,
  transitionLead
} from './domain/leadStore.js';

const storageKey = 'sales-lead-workbench-state-v1';
const userKey = 'sales-lead-workbench-user-v1';
const selectedLeadKey = 'sales-lead-workbench-selected-lead-v1';

let state = loadState();
let currentUserId = localStorage.getItem(userKey) || 'u-sales-a';
let selectedLeadId = localStorage.getItem(selectedLeadKey) || state.leads[0]?.id || '';
let activeView = 'workspace';

const app = document.querySelector('#app');

render();

function render() {
  const currentUser = getUser(state, currentUserId) || state.users[0];
  const selectedLead = state.leads.find((lead) => lead.id === selectedLeadId) || state.leads[0];

  currentUserId = currentUser.id;
  selectedLeadId = selectedLead?.id || '';

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">SL</div>
          <div>
            <div class="eyebrow">S1 CRM DEMO</div>
            <h1>销售线索跟进</h1>
          </div>
        </div>

        <label class="field role-field">
          <span>演示身份</span>
          <select id="user-switch">
            ${state.users.map((user) => `<option value="${user.id}" ${user.id === currentUserId ? 'selected' : ''}>${user.name} · ${roleLabel(user.role)}</option>`).join('')}
          </select>
        </label>

        <nav class="nav">
          <button class="${activeView === 'workspace' ? 'active' : ''}" data-view="workspace">销售工作台</button>
          <button class="${activeView === 'leads' ? 'active' : ''}" data-view="leads">线索管理</button>
          <button class="${activeView === 'dashboard' ? 'active' : ''}" data-view="dashboard">主管看板</button>
        </nav>

        <div class="sidebar-note">
          <strong>S1 范围</strong>
          <span>线索创建、跟进记录、状态流转、提醒与主管风险看板。</span>
        </div>
        <button class="ghost" id="reset-demo">重置演示数据</button>
      </aside>

      <main class="main">
        ${renderHeader(currentUser)}
        ${renderMain(currentUser, selectedLead)}
      </main>
    </div>
  `;

  bindEvents();
}

function renderHeader(currentUser) {
  const stats = getGlobalStats();

  return `
    <header class="topbar">
      <div>
        <div class="eyebrow">当前身份：${currentUser.name} · ${roleLabel(currentUser.role)}</div>
        <h2>${activeViewTitle()}</h2>
      </div>
      <div class="metric-strip">
        ${renderMetric('全部线索', stats.total)}
        ${renderMetric('未终态', stats.active)}
        ${renderMetric('今日待联系', stats.today)}
        ${renderMetric('已逾期', stats.overdue, 'danger')}
      </div>
    </header>
  `;
}

function renderMain(currentUser, selectedLead) {
  if (activeView === 'dashboard') {
    return renderDashboard(currentUser);
  }

  if (activeView === 'leads') {
    return `
      <section class="content-grid manage-grid">
        ${renderLeadList(currentUser, true)}
        ${selectedLead ? renderLeadDetail(selectedLead, currentUser) : renderEmptyDetail()}
      </section>
    `;
  }

  if (currentUser.role === 'manager') {
    return renderDashboard(currentUser);
  }

  return `
    ${renderSalesHome(currentUser)}
    <section class="content-grid manage-grid">
      ${renderLeadList(currentUser, false)}
      ${selectedLead ? renderLeadDetail(selectedLead, currentUser) : renderEmptyDetail()}
    </section>
  `;
}

function renderSalesHome(currentUser) {
  const home = getSalesHome(state, currentUser.id);

  return `
    <section class="workbench">
      <div class="workbench-copy">
        <div class="eyebrow">Today Queue</div>
        <h3>今天优先处理这些线索</h3>
        <p>销售每天只需要看今日待联系和逾期清单，进入详情后即可新增跟进或更新状态。</p>
      </div>
      <div class="risk-grid">
        ${renderRiskCard('今日待联系', home.today, 'today')}
        ${renderRiskCard('已逾期', home.overdue, 'overdue')}
      </div>
    </section>
  `;
}

function renderDashboard(currentUser) {
  if (currentUser.role !== 'manager') {
    return `
      <section class="panel">
        <div class="empty-state">
          <strong>主管看板需要主管身份</strong>
          <span>请在左侧切换为“赵主管 · 主管”查看团队风险。</span>
        </div>
      </section>
    `;
  }

  const risks = getSupervisorRisks(state, currentUser.id);

  return `
    <section class="workbench manager-hero">
      <div class="workbench-copy">
        <div class="eyebrow">Manager Risk Board</div>
        <h3>团队风险一屏可见</h3>
        <p>主管视角聚焦谁今天要跟、谁快到期、谁已经逾期，先保障销售跟进闭环。</p>
      </div>
      <div class="metric-strip large">
        ${renderMetric('今日待联系', risks.today.length)}
        ${renderMetric('即将到期', risks.dueSoon.length, 'warning')}
        ${renderMetric('已逾期', risks.overdue.length, 'danger')}
      </div>
    </section>

    <section class="risk-grid three">
      ${renderRiskCard('团队今日待联系', risks.today, 'today')}
      ${renderRiskCard('团队即将到期', risks.dueSoon, 'due')}
      ${renderRiskCard('团队已逾期', risks.overdue, 'overdue')}
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <div class="eyebrow">Pipeline Snapshot</div>
          <h3>团队状态概览</h3>
        </div>
      </div>
      <div class="status-row">
        ${Object.entries(LEAD_STATUSES).map(([status, label]) => `<div class="status-pill ${status}"><strong>${risks.summary[status] || 0}</strong><span>${label}</span></div>`).join('')}
      </div>
    </section>
  `;
}

function renderLeadList(currentUser, showCreateForm) {
  const visibleLeads = getVisibleLeads(currentUser);

  return `
    <section class="panel lead-panel">
      <div class="panel-head">
        <div>
          <div class="eyebrow">Lead Object</div>
          <h3>线索列表</h3>
        </div>
        <span class="count-badge">${visibleLeads.length}</span>
      </div>
      ${showCreateForm ? renderCreateLeadForm(currentUser) : ''}
      <div class="table-card">
        <div class="lead-table head">
          <span>客户</span>
          <span>状态</span>
          <span>归属</span>
          <span>下次联系</span>
        </div>
        <div class="lead-list">
          ${visibleLeads.map((lead) => renderLeadRow(lead)).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderCreateLeadForm(currentUser) {
  const salesUsers = state.users.filter((user) => user.role === 'sales' && (currentUser.role === 'manager' ? user.teamId === currentUser.teamId : user.id === currentUser.id));

  return `
    <form class="form create-form" id="create-lead-form">
      <div class="form-title">
        <strong>新建线索</strong>
        <span>录入后自动进入线索列表</span>
      </div>
      <div class="form-grid">
        <label class="field"><span>客户名</span><input name="customerName" required placeholder="例如：蓝海制造" /></label>
        <label class="field"><span>联系人</span><input name="contactName" required placeholder="主要联系人" /></label>
        <label class="field"><span>联系方式</span><input name="contactInfo" placeholder="手机 / 微信 / 邮箱" /></label>
        <label class="field"><span>来源</span><select name="source">${['官网咨询', '活动', '转介绍', '手动录入', '其他'].map((source) => `<option>${source}</option>`).join('')}</select></label>
        <label class="field"><span>归属销售</span><select name="ownerId">${salesUsers.map((user) => `<option value="${user.id}">${user.name}</option>`).join('')}</select></label>
        <label class="field"><span>下次联系</span><input name="nextFollowUpAt" type="datetime-local" /></label>
      </div>
      <label class="field"><span>备注</span><textarea name="remark" rows="2" placeholder="客户背景、需求线索或下一步判断"></textarea></label>
      <button class="primary" type="submit">创建线索</button>
    </form>
  `;
}

function renderLeadRow(lead) {
  return `
    <button class="lead-table row ${lead.id === selectedLeadId ? 'selected' : ''}" data-select-lead="${lead.id}">
      <span class="customer-cell">
        <strong>${escapeHtml(lead.customerName)}</strong>
        <small>${escapeHtml(lead.contactName)} · ${escapeHtml(lead.source)}</small>
      </span>
      <span>${renderStatusBadge(lead.status)}</span>
      <span>${getOwnerName(state, lead.ownerId)}</span>
      <span>${formatDateTime(lead.nextFollowUpAt)}</span>
    </button>
  `;
}

function renderLeadDetail(lead, currentUser) {
  const timeline = getLeadTimeline(state, lead.id);
  const statusLogs = getStatusLogs(state, lead.id);
  const canWrite = currentUser.role === 'manager' || currentUser.id === lead.ownerId;

  return `
    <section class="panel detail-panel">
      <div class="record-header">
        <div>
          <div class="eyebrow">Lead Record</div>
          <h3>${escapeHtml(lead.customerName)}</h3>
          <p>${escapeHtml(lead.contactName)} · ${escapeHtml(lead.contactInfo || '无联系方式')}</p>
        </div>
        ${renderStatusBadge(lead.status)}
      </div>

      ${renderStagePath(lead.status)}

      <div class="info-grid">
        ${renderInfo('归属销售', getOwnerName(state, lead.ownerId))}
        ${renderInfo('来源', lead.source)}
        ${renderInfo('最近跟进', formatDateTime(lead.lastFollowUpAt))}
        ${renderInfo('下次联系', formatDateTime(lead.nextFollowUpAt))}
      </div>
      <p class="note">${escapeHtml(lead.remark || '暂无备注')}</p>

      <div class="detail-layout">
        <div>
          <div class="timeline">
            <h4>跟进时间线</h4>
            ${timeline.length ? timeline.map((item) => renderFollowUp(item)).join('') : '<p class="muted">暂无跟进记录</p>'}
          </div>
          <div class="timeline">
            <h4>状态变更</h4>
            ${statusLogs.length ? statusLogs.map((item) => renderStatusLog(item)).join('') : '<p class="muted">暂无状态变更</p>'}
          </div>
        </div>
        <div class="action-panel">
          ${canWrite ? renderFollowUpForm(lead) : ''}
          ${canWrite ? renderTransitionForm(lead) : ''}
        </div>
      </div>
    </section>
  `;
}

function renderRiskCard(title, leads, tone) {
  return `
    <section class="panel risk ${tone}">
      <div class="panel-head compact">
        <h3>${title}</h3>
        <span class="count-badge">${leads.length}</span>
      </div>
      ${leads.length ? `<div class="risk-list">${leads.map((lead) => renderRiskItem(lead)).join('')}</div>` : '<div class="empty-state small">暂无数据</div>'}
    </section>
  `;
}

function renderRiskItem(lead) {
  return `
    <button class="risk-item" data-select-lead="${lead.id}">
      <span>
        <strong>${escapeHtml(lead.customerName)}</strong>
        <small>${getOwnerName(state, lead.ownerId)} · ${LEAD_STATUSES[lead.status]}</small>
      </span>
      <em>${formatDateTime(lead.nextFollowUpAt)}</em>
    </button>
  `;
}

function renderFollowUpForm(lead) {
  if (['won', 'lost'].includes(lead.status)) {
    return '<p class="muted boxed">终态线索不能新增下次提醒。</p>';
  }

  return `
    <form class="form action-form" id="follow-up-form" data-lead-id="${lead.id}">
      <div class="form-title">
        <strong>新增跟进</strong>
        <span>保存后同步更新提醒时间</span>
      </div>
      <label class="field"><span>沟通方式</span><select name="method">${Object.entries(FOLLOW_UP_METHODS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label>
      <label class="field"><span>下次联系</span><input name="nextFollowUpAt" type="datetime-local" required /></label>
      <label class="field"><span>沟通摘要</span><textarea name="summary" rows="3" required placeholder="记录客户反馈、异议和下一步"></textarea></label>
      <button class="primary" type="submit">保存跟进</button>
    </form>
  `;
}

function renderTransitionForm(lead) {
  const nextStatuses = getAllowedNextStatuses(lead.status);
  if (!nextStatuses.length) return '';

  return `
    <form class="form action-form" id="transition-form" data-lead-id="${lead.id}">
      <div class="form-title">
        <strong>状态流转</strong>
        <span>按状态机推进线索</span>
      </div>
      <label class="field"><span>下一状态</span><select name="toStatus">${nextStatuses.map((status) => `<option value="${status}">${LEAD_STATUSES[status]}</option>`).join('')}</select></label>
      <label class="field"><span>丢失原因</span><input name="lostReason" placeholder="流转为已丢失时必填" /></label>
      <button class="secondary" type="submit">更新状态</button>
    </form>
  `;
}

function renderFollowUp(item) {
  return `
    <div class="timeline-item">
      <div>
        <strong>${FOLLOW_UP_METHODS[item.method] || item.method}</strong>
        <span>${formatDateTime(item.createdAt)}</span>
      </div>
      <p>${escapeHtml(item.summary)}</p>
      <small>下次联系：${formatDateTime(item.nextFollowUpAt)}</small>
    </div>
  `;
}

function renderStatusLog(item) {
  return `
    <div class="timeline-item">
      <div>
        <strong>${LEAD_STATUSES[item.fromStatus]} → ${LEAD_STATUSES[item.toStatus]}</strong>
        <span>${formatDateTime(item.createdAt)}</span>
      </div>
      ${item.reason ? `<p>原因：${escapeHtml(item.reason)}</p>` : ''}
    </div>
  `;
}

function renderMetric(label, value, tone = '') {
  return `<div class="metric ${tone}"><strong>${value}</strong><span>${label}</span></div>`;
}

function renderInfo(label, value) {
  return `<div><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderStatusBadge(status) {
  return `<span class="status-badge ${status}">${LEAD_STATUSES[status]}</span>`;
}

function renderStagePath(currentStatus) {
  return `
    <div class="stage-path">
      ${Object.entries(LEAD_STATUSES).map(([status, label]) => `<span class="${status === currentStatus ? 'current' : ''}">${label}</span>`).join('')}
    </div>
  `;
}

function renderEmptyDetail() {
  return `<section class="panel detail-panel"><div class="empty-state"><strong>请选择一条线索</strong><span>线索详情、跟进和状态流转会显示在这里。</span></div></section>`;
}

function bindEvents() {
  document.querySelector('#user-switch')?.addEventListener('change', (event) => {
    currentUserId = event.target.value;
    localStorage.setItem(userKey, currentUserId);
    activeView = getUser(state, currentUserId)?.role === 'manager' ? 'dashboard' : 'workspace';
    render();
  });

  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      activeView = button.dataset.view;
      render();
    });
  });

  document.querySelectorAll('[data-select-lead]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedLeadId = button.dataset.selectLead;
      localStorage.setItem(selectedLeadKey, selectedLeadId);
      activeView = 'leads';
      render();
    });
  });

  document.querySelector('#reset-demo')?.addEventListener('click', () => {
    state = createInitialState();
    selectedLeadId = state.leads[0]?.id || '';
    saveState();
    render();
  });

  document.querySelector('#create-lead-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = formData(event.currentTarget);
    try {
      state = createLead(state, { ...data, nextFollowUpAt: normalizeDateTime(data.nextFollowUpAt) });
      selectedLeadId = state.leads.at(-1).id;
      saveState();
      render();
    } catch (error) {
      alert(error.message);
    }
  });

  document.querySelector('#follow-up-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = formData(event.currentTarget);
    try {
      state = addFollowUp(state, {
        leadId: event.currentTarget.dataset.leadId,
        method: data.method,
        summary: data.summary,
        nextFollowUpAt: normalizeDateTime(data.nextFollowUpAt),
        createdBy: currentUserId,
        createdAt: new Date().toISOString()
      });
      saveState();
      render();
    } catch (error) {
      alert(error.message);
    }
  });

  document.querySelector('#transition-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = formData(event.currentTarget);
    try {
      state = transitionLead(state, {
        leadId: event.currentTarget.dataset.leadId,
        toStatus: data.toStatus,
        lostReason: data.lostReason,
        changedBy: currentUserId,
        changedAt: new Date().toISOString()
      });
      saveState();
      render();
    } catch (error) {
      alert(error.message);
    }
  });
}

function getGlobalStats() {
  const active = state.leads.filter((lead) => !['won', 'lost'].includes(lead.status));
  const now = new Date();
  return {
    total: state.leads.length,
    active: active.length,
    today: active.filter((lead) => sameDay(lead.nextFollowUpAt, now)).length,
    overdue: active.filter((lead) => lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < now).length
  };
}

function getVisibleLeads(currentUser) {
  if (currentUser.role === 'manager') {
    return state.leads.filter((lead) => lead.teamId === currentUser.teamId);
  }
  return state.leads.filter((lead) => lead.ownerId === currentUser.id);
}

function loadState() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    const initial = createInitialState();
    localStorage.setItem(storageKey, JSON.stringify(initial));
    return initial;
  }

  try {
    return JSON.parse(raw);
  } catch {
    const initial = createInitialState();
    localStorage.setItem(storageKey, JSON.stringify(initial));
    return initial;
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  localStorage.setItem(userKey, currentUserId);
  localStorage.setItem(selectedLeadKey, selectedLeadId);
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function normalizeDateTime(value) {
  if (!value) return '';
  return new Date(value).toISOString();
}

function formatDateTime(value) {
  if (!value) return '未设置';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function sameDay(value, now) {
  if (!value) return false;
  const date = new Date(value);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function roleLabel(role) {
  return role === 'manager' ? '主管' : '销售';
}

function activeViewTitle() {
  if (activeView === 'dashboard') return '主管风险看板';
  if (activeView === 'leads') return '线索管理';
  return '销售工作台';
}

function escapeHtml(value) {
  return `${value ?? ''}`
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
