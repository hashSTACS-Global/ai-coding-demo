export const LEAD_STATUSES = {
  new: '新线索',
  contacted: '已联系',
  interested: '有意向',
  won: '已成交',
  lost: '已丢失'
};

export const FOLLOW_UP_METHODS = {
  phone: '电话',
  wechat: '微信',
  visit: '拜访',
  email: '邮件'
};

const terminalStatuses = new Set(['won', 'lost']);

const allowedTransitions = {
  new: ['contacted', 'lost'],
  contacted: ['interested', 'lost'],
  interested: ['won', 'lost'],
  won: [],
  lost: []
};

export function createInitialState(nowIso = new Date().toISOString()) {
  return {
    users: [
      { id: 'u-sales-a', name: '陈晓', role: 'sales', teamId: 'team-east', managerId: 'u-manager-east' },
      { id: 'u-sales-b', name: '李敏', role: 'sales', teamId: 'team-east', managerId: 'u-manager-east' },
      { id: 'u-manager-east', name: '赵主管', role: 'manager', teamId: 'team-east' }
    ],
    leads: [
      {
        id: 'lead-001',
        customerName: '华东零售集团',
        contactName: '周经理',
        contactInfo: '13800001111',
        source: '官网咨询',
        remark: '关注销售过程管理',
        status: 'new',
        ownerId: 'u-sales-a',
        teamId: 'team-east',
        lastFollowUpAt: null,
        nextFollowUpAt: sameDayAt(nowIso, 15, 0),
        lostReason: null,
        createdBy: 'u-sales-a',
        createdAt: sameDayAt(nowIso, 9, 0),
        updatedAt: sameDayAt(nowIso, 9, 0)
      },
      {
        id: 'lead-002',
        customerName: '北辰科技',
        contactName: '林总',
        contactInfo: '13800002222',
        source: '转介绍',
        remark: '已约过一次演示，需要补材料',
        status: 'contacted',
        ownerId: 'u-sales-a',
        teamId: 'team-east',
        lastFollowUpAt: addHours(nowIso, -28),
        nextFollowUpAt: addHours(nowIso, -4),
        lostReason: null,
        createdBy: 'u-sales-a',
        createdAt: addHours(nowIso, -48),
        updatedAt: addHours(nowIso, -28)
      },
      {
        id: 'lead-003',
        customerName: '远山医疗',
        contactName: '许主任',
        contactInfo: '13800003333',
        source: '活动',
        remark: '采购周期较长，需要持续跟进',
        status: 'interested',
        ownerId: 'u-sales-b',
        teamId: 'team-east',
        lastFollowUpAt: addHours(nowIso, -6),
        nextFollowUpAt: addHours(nowIso, 23),
        lostReason: null,
        createdBy: 'u-sales-b',
        createdAt: addHours(nowIso, -96),
        updatedAt: addHours(nowIso, -6)
      }
    ],
    followUps: [
      {
        id: 'fu-001',
        leadId: 'lead-002',
        method: 'wechat',
        summary: '客户确认需要一份报价前的方案说明',
        nextFollowUpAt: addHours(nowIso, -4),
        createdBy: 'u-sales-a',
        createdAt: addHours(nowIso, -28)
      },
      {
        id: 'fu-002',
        leadId: 'lead-003',
        method: 'phone',
        summary: '客户希望本周内再看一次主管看板演示',
        nextFollowUpAt: addHours(nowIso, 23),
        createdBy: 'u-sales-b',
        createdAt: addHours(nowIso, -6)
      }
    ],
    statusLogs: []
  };
}

export function createLead(state, input) {
  const owner = getUser(state, input.ownerId);
  if (!owner || owner.role !== 'sales') {
    throw new Error('线索必须归属销售');
  }

  const now = new Date().toISOString();
  const lead = {
    id: createId('lead'),
    customerName: requireText(input.customerName, '客户名必填'),
    contactName: requireText(input.contactName, '联系人必填'),
    contactInfo: input.contactInfo?.trim() ?? '',
    source: requireText(input.source, '来源必填'),
    remark: input.remark?.trim() ?? '',
    status: 'new',
    ownerId: owner.id,
    teamId: owner.teamId,
    lastFollowUpAt: null,
    nextFollowUpAt: input.nextFollowUpAt || null,
    lostReason: null,
    createdBy: owner.id,
    createdAt: now,
    updatedAt: now
  };

  return {
    ...state,
    leads: [...state.leads, lead]
  };
}

export function addFollowUp(state, input) {
  const lead = getLead(state, input.leadId);
  if (terminalStatuses.has(lead.status)) {
    throw new Error('终态线索不能新增下次提醒');
  }

  const createdAt = input.createdAt || new Date().toISOString();
  const followUp = {
    id: createId('fu'),
    leadId: lead.id,
    method: requireText(input.method, '沟通方式必填'),
    summary: requireText(input.summary, '沟通摘要必填'),
    nextFollowUpAt: requireText(input.nextFollowUpAt, '下次联系时间必填'),
    createdBy: requireText(input.createdBy, '创建人必填'),
    createdAt
  };

  return {
    ...state,
    leads: state.leads.map((item) =>
      item.id === lead.id
        ? {
            ...item,
            lastFollowUpAt: createdAt,
            nextFollowUpAt: followUp.nextFollowUpAt,
            updatedAt: createdAt
          }
        : item
    ),
    followUps: [...state.followUps, followUp]
  };
}

export function transitionLead(state, input) {
  const lead = getLead(state, input.leadId);
  const nextStatus = input.toStatus;

  if (!allowedTransitions[lead.status].includes(nextStatus)) {
    throw new Error('不允许的状态流转');
  }

  const reason = input.lostReason?.trim() ?? '';
  if (nextStatus === 'lost' && !reason) {
    throw new Error('丢失原因必填');
  }

  const changedAt = input.changedAt || new Date().toISOString();
  const statusLog = {
    id: createId('log'),
    leadId: lead.id,
    fromStatus: lead.status,
    toStatus: nextStatus,
    reason: reason || '',
    createdBy: requireText(input.changedBy, '操作人必填'),
    createdAt: changedAt
  };

  return {
    ...state,
    leads: state.leads.map((item) =>
      item.id === lead.id
        ? {
            ...item,
            status: nextStatus,
            lostReason: nextStatus === 'lost' ? reason : null,
            updatedAt: changedAt
          }
        : item
    ),
    statusLogs: [...state.statusLogs, statusLog]
  };
}

export function getSalesHome(state, userId, nowIso = new Date().toISOString()) {
  const active = state.leads.filter((lead) => lead.ownerId === userId && !terminalStatuses.has(lead.status));
  const overdue = active.filter((lead) => isOverdue(lead, nowIso)).sort(compareNextFollowUp);
  const today = active.filter((lead) => !isOverdue(lead, nowIso) && isToday(lead.nextFollowUpAt, nowIso)).sort(compareNextFollowUp);
  const summary = summarizeByStatus(state.leads.filter((lead) => lead.ownerId === userId));

  return { today, overdue, summary };
}

export function getSupervisorRisks(state, managerId, nowIso = new Date().toISOString()) {
  const manager = getUser(state, managerId);
  if (!manager || manager.role !== 'manager') {
    throw new Error('主管不存在');
  }

  const teamLeads = state.leads.filter((lead) => lead.teamId === manager.teamId && !terminalStatuses.has(lead.status));
  const overdue = teamLeads.filter((lead) => isOverdue(lead, nowIso)).sort(compareNextFollowUp);
  const today = teamLeads.filter((lead) => !isOverdue(lead, nowIso) && isToday(lead.nextFollowUpAt, nowIso)).sort(compareNextFollowUp);
  const dueSoon = teamLeads
    .filter((lead) => !isOverdue(lead, nowIso) && !isToday(lead.nextFollowUpAt, nowIso) && isDueSoon(lead.nextFollowUpAt, nowIso))
    .sort(compareNextFollowUp);

  return {
    today,
    dueSoon,
    overdue,
    summary: summarizeByStatus(state.leads.filter((lead) => lead.teamId === manager.teamId))
  };
}

export function getLeadTimeline(state, leadId) {
  return state.followUps
    .filter((followUp) => followUp.leadId === leadId)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function getStatusLogs(state, leadId) {
  return state.statusLogs
    .filter((log) => log.leadId === leadId)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function getUser(state, userId) {
  return state.users.find((user) => user.id === userId);
}

export function getLead(state, leadId) {
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead) {
    throw new Error('线索不存在');
  }
  return lead;
}

export function getOwnerName(state, ownerId) {
  return getUser(state, ownerId)?.name ?? '未知销售';
}

export function getAllowedNextStatuses(status) {
  return allowedTransitions[status] ?? [];
}

function summarizeByStatus(leads) {
  return Object.fromEntries(Object.keys(LEAD_STATUSES).map((status) => [status, leads.filter((lead) => lead.status === status).length]));
}

function requireText(value, message) {
  const text = value?.trim?.() ?? '';
  if (!text) {
    throw new Error(message);
  }
  return text;
}

function isToday(dateIso, nowIso) {
  if (!dateIso) return false;
  return dayKey(dateIso) === dayKey(nowIso);
}

function isOverdue(lead, nowIso) {
  if (!lead.nextFollowUpAt || terminalStatuses.has(lead.status)) return false;
  return new Date(lead.nextFollowUpAt).getTime() < new Date(nowIso).getTime();
}

function isDueSoon(dateIso, nowIso) {
  if (!dateIso) return false;
  const diff = new Date(dateIso).getTime() - new Date(nowIso).getTime();
  return diff > 0 && diff <= 24 * 60 * 60 * 1000;
}

function dayKey(dateIso) {
  const date = new Date(dateIso);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function compareNextFollowUp(left, right) {
  return new Date(left.nextFollowUpAt || 0).getTime() - new Date(right.nextFollowUpAt || 0).getTime();
}

function sameDayAt(dateIso, hours, minutes) {
  const date = new Date(dateIso);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function addHours(dateIso, hours) {
  return new Date(new Date(dateIso).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
