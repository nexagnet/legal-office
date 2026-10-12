import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  foreignKey,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
});

export const offices = pgTable(
  'offices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
  },
  (t) => [unique('offices_id_tenant_uq').on(t.id, t.tenantId)],
);

export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    officeId: uuid('office_id').notNull(),
    name: text('name').notNull(),
  },
  (t) => [
    unique('branches_id_tenant_uq').on(t.id, t.tenantId),
    unique('branches_id_tenant_office_uq').on(t.id, t.tenantId, t.officeId),
    foreignKey({
      name: 'branches_office_tenant_fk',
      columns: [t.officeId, t.tenantId],
      foreignColumns: [offices.id, offices.tenantId],
    }),
  ],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    externalRef: text('external_ref').notNull(),
  },
  (t) => [unique('users_id_tenant_uq').on(t.id, t.tenantId)],
);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    officeId: uuid('office_id').notNull(),
    role: text('role').notNull(),
    legalSigner: boolean('legal_signer').notNull().default(false),
  },
  (t) => [
    unique('memberships_id_tenant_uq').on(t.id, t.tenantId),
    foreignKey({
      name: 'memberships_user_tenant_fk',
      columns: [t.userId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
    }),
    foreignKey({
      name: 'memberships_office_tenant_fk',
      columns: [t.officeId, t.tenantId],
      foreignColumns: [offices.id, offices.tenantId],
    }),
  ],
);

export const branchGrants = pgTable(
  'branch_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
    branchId: uuid('branch_id').notNull(),
  },
  (t) => [
    unique('branch_grants_membership_branch_uq').on(t.membershipId, t.branchId),
    foreignKey({
      name: 'branch_grants_membership_tenant_fk',
      columns: [t.membershipId, t.tenantId],
      foreignColumns: [memberships.id, memberships.tenantId],
    }),
    foreignKey({
      name: 'branch_grants_branch_tenant_fk',
      columns: [t.branchId, t.tenantId],
      foreignColumns: [branches.id, branches.tenantId],
    }),
  ],
);

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: text('actor_id').notNull(),
  action: text('action').notNull(),
  outcome: text('outcome').notNull(),
  reason: text('reason').notNull(),
  officeId: uuid('office_id'),
  branchId: uuid('branch_id'),
});

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    kind: text('kind').notNull(),
    externalRef: text('external_ref').notNull(),
  },
  (t) => [unique('customers_id_tenant_uq').on(t.id, t.tenantId)],
);

export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: uuid('customer_id').notNull(),
    externalRef: text('external_ref').notNull(),
  },
  (t) => [
    unique('contracts_id_tenant_uq').on(t.id, t.tenantId),
    foreignKey({
      name: 'contracts_customer_tenant_fk',
      columns: [t.customerId, t.tenantId],
      foreignColumns: [customers.id, customers.tenantId],
    }),
  ],
);

export const vibangCases = pgTable(
  'vibang_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    officeId: uuid('office_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    customerId: uuid('customer_id').notNull(),
    contractId: uuid('contract_id'),
    status: text('status').notNull().default('INTAKE'),
    responsibleThvUserId: uuid('responsible_thv_user_id'),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    contactNote: text('contact_note').notNull().default(''),
    proofs: text('proofs').array().notNull().default([]),
    cancelReason: text('cancel_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    version: integer('version').notNull().default(1),
  },
  (t) => [
    unique('vibang_cases_id_tenant_uq').on(t.id, t.tenantId),
    index('vibang_cases_tenant_status_idx').on(t.tenantId, t.status),
    foreignKey({
      name: 'vibang_cases_branch_tenant_fk',
      columns: [t.branchId, t.tenantId, t.officeId],
      foreignColumns: [branches.id, branches.tenantId, branches.officeId],
    }),
    foreignKey({
      name: 'vibang_cases_office_tenant_fk',
      columns: [t.officeId, t.tenantId],
      foreignColumns: [offices.id, offices.tenantId],
    }),
    foreignKey({
      name: 'vibang_cases_customer_tenant_fk',
      columns: [t.customerId, t.tenantId],
      foreignColumns: [customers.id, customers.tenantId],
    }),
    foreignKey({
      name: 'vibang_cases_contract_tenant_fk',
      columns: [t.contractId, t.tenantId],
      foreignColumns: [contracts.id, contracts.tenantId],
    }),
    foreignKey({
      name: 'vibang_cases_thv_tenant_fk',
      columns: [t.responsibleThvUserId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
    }),
  ],
);

export const vibangCaseChangeRequests = pgTable(
  'vibang_case_change_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    caseId: uuid('case_id').notNull(),
    requestedBy: text('requested_by').notNull(),
    reason: text('reason').notNull(),
    before: jsonb('before').notNull(),
    after: jsonb('after').notNull(),
    status: text('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      name: 'vibang_cr_case_tenant_fk',
      columns: [t.caseId, t.tenantId],
      foreignColumns: [vibangCases.id, vibangCases.tenantId],
    }),
  ],
);

// Lát #7. Hàm nghiệp vụ (vibang_record_misa, vibang_allocate_number, ...) nằm trong 0002; gọi bằng
// `SELECT * FROM fn(...)` (KHÔNG `(fn(...)).*`, vì Postgres sẽ chạy hàm một lần cho mỗi cột).
export const vibangMisaConfirmations = pgTable(
  'vibang_misa_confirmations',
  {
    caseId: uuid('case_id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    status: text('status').notNull(),
    reference: text('reference'),
    confirmedBy: uuid('confirmed_by'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    revokeStatus: text('revoke_status').notNull().default('NONE'),
    revokeReason: text('revoke_reason'),
    revokeProposedBy: uuid('revoke_proposed_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'vibang_misa_case_tenant_fk',
      columns: [t.caseId, t.tenantId],
      foreignColumns: [vibangCases.id, vibangCases.tenantId],
    }),
  ],
);

export const vibangNumberCounters = pgTable(
  'vibang_number_counters',
  {
    tenantId: uuid('tenant_id').notNull(),
    officeId: uuid('office_id').notNull(),
    year: integer('year').notNull(),
    lastSeq: integer('last_seq').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.officeId, t.year] })],
);

export const vibangNumbers = pgTable(
  'vibang_numbers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    officeId: uuid('office_id').notNull(),
    caseId: uuid('case_id').notNull(),
    year: integer('year').notNull(),
    seq: integer('seq').notNull(),
    label: text('label').notNull(),
    allocatedBy: uuid('allocated_by').notNull(),
    allocatedAt: timestamp('allocated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('vibang_numbers_case_uq').on(t.caseId),
    unique('vibang_numbers_seq_uq').on(t.tenantId, t.officeId, t.year, t.seq),
  ],
);
