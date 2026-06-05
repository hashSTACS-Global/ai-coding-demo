import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addFollowUp,
  createInitialState,
  createLead,
  getSalesHome,
  getSupervisorRisks,
  transitionLead
} from './leadStore.js';

const now = new Date('2026-06-05T10:00:00+08:00').toISOString();

test('creates a lead owned by the current salesperson', () => {
  const state = createInitialState(now);
  const next = createLead(state, {
    customerName: '蓝海制造',
    contactName: '王总',
    contactInfo: '13800000000',
    source: '官网咨询',
    remark: '关注线索跟进效率',
    nextFollowUpAt: '2026-06-05T15:00:00+08:00',
    ownerId: 'u-sales-a'
  });

  const created = next.leads.find((lead) => lead.customerName === '蓝海制造');

  assert.equal(created.customerName, '蓝海制造');
  assert.equal(created.contactName, '王总');
  assert.equal(created.ownerId, 'u-sales-a');
  assert.equal(created.teamId, 'team-east');
  assert.equal(created.status, 'new');
});

test('adds a follow-up and updates the lead tracking timestamps together', () => {
  const state = createInitialState(now);
  const leadId = state.leads[0].id;

  const next = addFollowUp(state, {
    leadId,
    method: 'phone',
    summary: '客户确认下周安排产品演示',
    nextFollowUpAt: '2026-06-06T09:30:00+08:00',
    createdBy: 'u-sales-a',
    createdAt: now
  });

  const lead = next.leads.find((item) => item.id === leadId);
  const followUps = next.followUps.filter((item) => item.leadId === leadId);

  assert.equal(lead.lastFollowUpAt, now);
  assert.equal(lead.nextFollowUpAt, '2026-06-06T09:30:00+08:00');
  assert.equal(followUps.at(-1).method, 'phone');
  assert.equal(followUps.at(-1).summary, '客户确认下周安排产品演示');
});

test('requires a lost reason when a lead moves to lost', () => {
  const state = createInitialState(now);
  const leadId = state.leads[0].id;

  assert.throws(
    () =>
      transitionLead(state, {
        leadId,
        toStatus: 'lost',
        changedBy: 'u-sales-a',
        changedAt: now
      }),
    /丢失原因必填/
  );
});

test('separates today and overdue leads for the salesperson home', () => {
  const state = createInitialState(now);

  const home = getSalesHome(state, 'u-sales-a', now);

  assert.ok(home.today.some((lead) => lead.customerName === '华东零售集团'));
  assert.ok(home.overdue.some((lead) => lead.customerName === '北辰科技'));
  assert.equal(home.today.some((lead) => lead.customerName === '北辰科技'), false);
});

test('shows supervisor team risks for today, due soon, and overdue leads', () => {
  const state = createInitialState(now);

  const risks = getSupervisorRisks(state, 'u-manager-east', now);

  assert.ok(risks.today.some((lead) => lead.customerName === '华东零售集团'));
  assert.ok(risks.dueSoon.some((lead) => lead.customerName === '远山医疗'));
  assert.ok(risks.overdue.some((lead) => lead.customerName === '北辰科技'));
});
