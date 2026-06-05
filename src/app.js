import {
  FOLLOW_UP_METHODS,
  LEAD_STATUSES,
  addFollowUp,
  createInitialState,
  createLead,
  getAllowedNextStatuses,
  getLead,
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
  currentUserId = currentUser.id;
  const selectedLead = state.leads.find((lead) => lead.id === selectedLeadId) || state.leads[0];
  selectedLeadId = selectedLead?.id || '';

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div>
          <div class="eyebrow">S1 Demo</div>
          <h1>销售线索跟进</h1>
        </div>
        <label class="field">
          <span>演示身份</span>
          <select id="user-switch">
            ${state.users.map((user) => `<option value="${user.id}" ${user.id === currentUserId ? 'selected' : ''}>${user.name} · ${roleLabel(user.role)}</option>`).join('')}
          </select>
        </label>
        <nav class="nav">
          <button class="${activeView === 'workspace' ? 'active' : ''}" data-view="workspace">工作台</button>
          <button class="${activeView === 'leads' ? 'active' : ''}" data-view="leads">线索列表</button>
          <button class="${activeView === 'dashboard' ? 'active' : ''}" data-view="dashboard">主管看板</button>
        </nav>
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
  const allActive = state.leads.filter((lead) => !['won', 'lost'].includes(lead.status)).length;
  const overdue = state.leads.filter((lead) => !['won', 'lost'].includes(lead.status) && new Date(lead.nextFollowUpAt || 0) < new Date()).length;

  return `
    <header class="topbar">
      <div>
        <div class="eyebrow">当前身份：${currentUser.name} · ${roleLabel(currentUser.role)}</div>
        <h2>${activeViewTitle()}</h2>
      </div>
      <div class="top-metrics">
        <div><strong>${state.leads.length}</strong><span>全部线索</span></div>
        <div><strong>${allActive}</strong><span>未终态</span></div>
        <div><strong>${overdue}</strong><span>已逾期</span></div>
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
      <section class="grid two">
        ${renderLeadList(currentUser, true)}
        ${selectedLead ? renderLeadDetail(selectedLead, currentUser) : renderEmptyDetail()}
      </section>
    `;
  }

  return `
    ${currentUser.role === 'manager' ? renderDashboard(currentUser) : renderSalesHome(currentUser)}
    <section class="grid two">
      ${renderLeadList(currentUser, false)}
      ${selectedLead ? renderLeadDetail(selectedLead, currentUser) : renderEmptyDetail()}
    </section>
  `;
}

function renderSalesHome(currentUser) {
  const home = getSalesHome(state, currentUser.id);

  return `
    <section class="grid two">
      ${renderRiskCard('今日待联系', home.today, 'today')}
      ${renderRiskCard('已逾期', home.overdue, 'overdue')}
    </section>
  `;
}

function renderDashboard(currentUser) {
  if (currentUser.role !== 'manager') {
    return `<section class="panel"><h3>主管看板</h3><p class="muted">请在左侧切换为主管身份查看团队风险。</p></section>`;
  }

  const risks = getSupervisorRisks(state, currentUser.id);

  return `
    <section class="grid three">
      ${renderRiskCard('团队今日待联系', risks.today, 'today')}
      ${renderRiskCard('团队即将到期', risks.dueSoon, 'due')}
      ${renderRiskCard('团队已逾期', risks.overdue, 'overdue')}
    </section>
    <section class="panel">
      <div class="panel-head">
        <h3>团队状态概览</h3>
      </div>
      <div class="status-row">
        ${Object.entries(LEAD_STATUSES)
          .map(([status, label]) => `<div class="status-pill"><strong>${risks.summary[status] || 0}</strong><span>${label}</span></div>`)
          .join('')}
      </div>
    </section>
  `;
}

function renderRiskCard(title, leads, tone) {
  return `
    <section class="panel risk ${tone}">
      <div class="panel-head">
        <h3>${title}</h3>
        <span class="badge">${leads.length}</span>
      </div>
      ${
        leads.length
          ? `<div class="risk-list">${leads.map((lead) => renderRiskItem(lead)).join('')}</div>`
          : `<p class="muted">暂无数据</p>`
      }
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

function renderLeadList(currentUser, showCreateForm) {
  const visibleLeads = getVisibleLeads(currentUser);

  return `
    <section class="panel">
      <div class="panel-head">
        <h3>线索列表</h3>
        <span class="badge">${visibleLeads.length}</span>
      </div>
      ${showCreateForm ? renderCreateLeadForm(currentUser) : ''}
      <div class="lead-list">
        ${visibleLeads.map((lead) => renderLeadRow(lead)).join('')}
      </div>
    </section>
  `;
}

function renderCreateLeadForm(currentUser) {
  const salesUsers = state.users.filter((user) => user.role === 'sales' && (currentUser.role === 'manager' ? user.teamId === currentUser.teamId : user.id === currentUser.id));

  return `
    <form class="form compact" id="create-lead-form">
      <div class="form-grid">
        <label class="field"><span>客户名</span><input name="customerName" required /></label>
        <label class="field"><span>联系人</span><input name="contactName" required /></label>
        <label class="field"><span>联系方式</span><input name="contactInfo" /></label>
        <label class="field"><span>来源</span><select name="source">${['官网咨询', '活动', '转介绍', '手动录入', '其他'].map((source) => `<option>${source}</option>`).join('')}</select></label>
        <label class="field"><span>归属销售</span><select name="ownerId">${salesUsers.map((user) => `<option value="${user.id}">${user.name}</option>`).join('')}</select></label>
        <label class="field"><span>下次联系</span><input name="nextFollowUpAt" type="datetime-local" /></label>
      </div>
      <label class="field"><span>备注</span><textarea name="remark" rows="2"></textarea></label>
      <button class="primary" type="submit">新建线索</button>
    </form>
  `;
}

function renderLeadRow(lead) {
  return `
    <button class="lead-row ${lead.id === selectedLeadId ? 'selected' : ''}" data-select-lead="${lead.id}">
      <span>
        <strong>${escapeHtml(lead.customerName)}</strong>
        <small>${escapeHtml(lead.contactName)} · ${getOwnerName(state, lead.ownerId)}</small>
      </span>
      <span class="lead-meta">
        <em>${LEAD_STATUSES[lead.status]}</em>
        <small>${formatDateTime(lead.nextFollowUpAt)}</small>
      </span>
    </button>
  `;
}

function renderLeadDetail(lead, currentUser) {
  const timeline = getLeadTimeline(state, lead.id);
  const statusLogs = getStatusLogs(state, lead.id);
  const canWrite = currentUser.role === 'manager' || currentUser.id === lead.ownerId;

  return `
    <section class="panel detail">
      <div class="panel-head">
        <div>
          <h3>${escapeHtml(lead.customerName)}</h3>
          <p class="muted">${escapeHtml(lead.contactName)} · ${escapeHtml(lead.contactInfo || '无联系方式')}</p>
        </div>
        <span class="badge">${LEAD_STATUSES[lead.status]}</span>
      </div>

      <div class="info-grid">
        <div><span>归属销售</span><strong>${getOwnerName(state, lead.ownerId)}</strong></div>
        <div><span>来源</span><strong>${escapeHtml(lead.source)}</strong></div>
        <div><span>最近跟进</span><strong>${formatDateTime(lead.lastFollowUpAt)}</strong></div>
        <div><span>下次联系</span><strong>${formatDateTime(lead.nextFollowUpAt)}</strong></div>
      </div>
      <p class="note">${escapeHtml(lead.remark || '暂无备注')}</p>

      ${canWrite ? renderFollowUpForm(lead) : ''}
      ${canWrite ? renderTransitionForm(lead) : ''}

      <div class="timeline">
        <h4>跟进记录</h4>
        ${timeline.length ? timeline.map((item) => renderFollowUp(item)).join('') : '<p class="muted">暂无跟进记录</p>'}
      </div>

      <div class="timeline">
        <h4>状态变更</h4>
        ${statusLogs.length ? statusLogs.map((item) => renderStatusLog(item)).join('') : '<p class="muted">暂无状态变更</p>'}
      </div>
    </section>
  `;
}

function renderFollowUpForm(lead) {
  if (['won', 'lost'].includes(lead.status)) {
    return '<p class="muted boxed">终态线索不能新增下次提醒。</p>';
  }

  return `
    <form class="form" id="follow-up-form" data-lead-id="${lead.id}">
      <h4>新增跟进</h4>
      <div class="form-grid">
        <label class="field"><span>沟通方式</span><select name="method">${Object.entries(FOLLOW_UP_METHODS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label>
        <label class="field"><span>下次联系</span><input name="nextFollowUpAt" type="datetime-local" required /></label>
      </div>
      <label class="field"><span>沟通摘要</span><textarea name="summary" rows="3" required></textarea></label>
      <button class="primary" type="submit">保存跟进</button>
    </form>
  `;
}

function renderTransitionForm(lead) {
  const nextStatuses = getAllowedNextStatuses(lead.status);
  if (!nextStatuses.length) {
    return '';
  }

  return `
    <form class="form inline" id="transition-form" data-lead-id="${lead.id}">
      <label class="field"><span>状态流转</span><select name="toStatus">${nextStatuses.map((status) => `<option value="${status}">${LEAD_STATUSES[status]}</option>`).join('')}</select></label>
      <label class="field grow"><span>丢失原因</span><input name="lostReason" placeholder="流转为已丢失时必填" /></label>
      <button class="secondary" type="submit">更新状态</button>
    </form>
  `;
}

function renderFollowUp(item) {
  return `
    <div class="timeline-item">
      <strong>${FOLLOW_UP_METHODS[item.method] || item.method}</strong>
      <span>${formatDateTime(item.createdAt)}</span>
      <p>${escapeHtml(item.summary)}</p>
      <small>下次联系：${formatDateTime(item.nextFollowUpAt)}</small>
    </div>
  `;
}

function renderStatusLog(item) {
  return `
    <div class="timeline-item">
      <strong>${LEAD_STATUSES[item.fromStatus]} -> ${LEAD_STATUSES[item.toStatus]}</strong>
      <span>${formatDateTime(item.createdAt)}</span>
      ${item.reason ? `<p>原因：${escapeHtml(item.reason)}</p>` : ''}
    </div>
  `;
}

function renderEmptyDetail() {
  return `<section class="panel detail"><p class="muted">请选择一条线索。</p></section>`;
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
      state = createLead(state, {
        ...data,
        nextFollowUpAt: normalizeDateTime(data.nextFollowUpAt)
      });
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
