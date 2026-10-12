"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vibangCaseChangeRequests = exports.vibangCases = exports.contracts = exports.customers = exports.auditLog = exports.branchGrants = exports.memberships = exports.users = exports.branches = exports.offices = exports.tenants = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.tenants = (0, pg_core_1.pgTable)('tenants', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.text)('name').notNull(),
});
exports.offices = (0, pg_core_1.pgTable)('offices', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    tenantId: (0, pg_core_1.uuid)('tenant_id')
        .notNull()
        .references(() => exports.tenants.id),
    name: (0, pg_core_1.text)('name').notNull(),
}, (t) => [(0, pg_core_1.unique)('offices_id_tenant_uq').on(t.id, t.tenantId)]);
exports.branches = (0, pg_core_1.pgTable)('branches', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    tenantId: (0, pg_core_1.uuid)('tenant_id').notNull(),
    officeId: (0, pg_core_1.uuid)('office_id').notNull(),
    name: (0, pg_core_1.text)('name').notNull(),
}, (t) => [
    (0, pg_core_1.unique)('branches_id_tenant_uq').on(t.id, t.tenantId),
    (0, pg_core_1.unique)('branches_id_tenant_office_uq').on(t.id, t.tenantId, t.officeId),
    (0, pg_core_1.foreignKey)({
        name: 'branches_office_tenant_fk',
        columns: [t.officeId, t.tenantId],
        foreignColumns: [exports.offices.id, exports.offices.tenantId],
    }),
]);
exports.users = (0, pg_core_1.pgTable)('users', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    tenantId: (0, pg_core_1.uuid)('tenant_id')
        .notNull()
        .references(() => exports.tenants.id),
    externalRef: (0, pg_core_1.text)('external_ref').notNull(),
}, (t) => [(0, pg_core_1.unique)('users_id_tenant_uq').on(t.id, t.tenantId)]);
exports.memberships = (0, pg_core_1.pgTable)('memberships', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    tenantId: (0, pg_core_1.uuid)('tenant_id').notNull(),
    userId: (0, pg_core_1.uuid)('user_id').notNull(),
    officeId: (0, pg_core_1.uuid)('office_id').notNull(),
    role: (0, pg_core_1.text)('role').notNull(),
    legalSigner: (0, pg_core_1.boolean)('legal_signer').notNull().default(false),
}, (t) => [
    (0, pg_core_1.unique)('memberships_id_tenant_uq').on(t.id, t.tenantId),
    (0, pg_core_1.foreignKey)({
        name: 'memberships_user_tenant_fk',
        columns: [t.userId, t.tenantId],
        foreignColumns: [exports.users.id, exports.users.tenantId],
    }),
    (0, pg_core_1.foreignKey)({
        name: 'memberships_office_tenant_fk',
        columns: [t.officeId, t.tenantId],
        foreignColumns: [exports.offices.id, exports.offices.tenantId],
    }),
]);
exports.branchGrants = (0, pg_core_1.pgTable)('branch_grants', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    tenantId: (0, pg_core_1.uuid)('tenant_id').notNull(),
    membershipId: (0, pg_core_1.uuid)('membership_id').notNull(),
    branchId: (0, pg_core_1.uuid)('branch_id').notNull(),
}, (t) => [
    (0, pg_core_1.unique)('branch_grants_membership_branch_uq').on(t.membershipId, t.branchId),
    (0, pg_core_1.foreignKey)({
        name: 'branch_grants_membership_tenant_fk',
        columns: [t.membershipId, t.tenantId],
        foreignColumns: [exports.memberships.id, exports.memberships.tenantId],
    }),
    (0, pg_core_1.foreignKey)({
        name: 'branch_grants_branch_tenant_fk',
        columns: [t.branchId, t.tenantId],
        foreignColumns: [exports.branches.id, exports.branches.tenantId],
    }),
]);
exports.auditLog = (0, pg_core_1.pgTable)('audit_log', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    at: (0, pg_core_1.timestamp)('at', { withTimezone: true }).notNull().defaultNow(),
    tenantId: (0, pg_core_1.uuid)('tenant_id').notNull(),
    actorId: (0, pg_core_1.text)('actor_id').notNull(),
    action: (0, pg_core_1.text)('action').notNull(),
    outcome: (0, pg_core_1.text)('outcome').notNull(),
    reason: (0, pg_core_1.text)('reason').notNull(),
    officeId: (0, pg_core_1.uuid)('office_id'),
    branchId: (0, pg_core_1.uuid)('branch_id'),
});
exports.customers = (0, pg_core_1.pgTable)('customers', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    tenantId: (0, pg_core_1.uuid)('tenant_id')
        .notNull()
        .references(() => exports.tenants.id),
    kind: (0, pg_core_1.text)('kind').notNull(),
    externalRef: (0, pg_core_1.text)('external_ref').notNull(),
}, (t) => [(0, pg_core_1.unique)('customers_id_tenant_uq').on(t.id, t.tenantId)]);
exports.contracts = (0, pg_core_1.pgTable)('contracts', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    tenantId: (0, pg_core_1.uuid)('tenant_id')
        .notNull()
        .references(() => exports.tenants.id),
    customerId: (0, pg_core_1.uuid)('customer_id').notNull(),
    externalRef: (0, pg_core_1.text)('external_ref').notNull(),
}, (t) => [
    (0, pg_core_1.unique)('contracts_id_tenant_uq').on(t.id, t.tenantId),
    (0, pg_core_1.foreignKey)({
        name: 'contracts_customer_tenant_fk',
        columns: [t.customerId, t.tenantId],
        foreignColumns: [exports.customers.id, exports.customers.tenantId],
    }),
]);
exports.vibangCases = (0, pg_core_1.pgTable)('vibang_cases', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    tenantId: (0, pg_core_1.uuid)('tenant_id').notNull(),
    officeId: (0, pg_core_1.uuid)('office_id').notNull(),
    branchId: (0, pg_core_1.uuid)('branch_id').notNull(),
    customerId: (0, pg_core_1.uuid)('customer_id').notNull(),
    contractId: (0, pg_core_1.uuid)('contract_id'),
    status: (0, pg_core_1.text)('status').notNull().default('INTAKE'),
    responsibleThvUserId: (0, pg_core_1.uuid)('responsible_thv_user_id'),
    title: (0, pg_core_1.text)('title').notNull(),
    description: (0, pg_core_1.text)('description').notNull().default(''),
    contactNote: (0, pg_core_1.text)('contact_note').notNull().default(''),
    proofs: (0, pg_core_1.text)('proofs').array().notNull().default([]),
    cancelReason: (0, pg_core_1.text)('cancel_reason'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    version: (0, pg_core_1.integer)('version').notNull().default(1),
}, (t) => [
    (0, pg_core_1.unique)('vibang_cases_id_tenant_uq').on(t.id, t.tenantId),
    (0, pg_core_1.index)('vibang_cases_tenant_status_idx').on(t.tenantId, t.status),
    (0, pg_core_1.foreignKey)({
        name: 'vibang_cases_branch_tenant_fk',
        columns: [t.branchId, t.tenantId, t.officeId],
        foreignColumns: [exports.branches.id, exports.branches.tenantId, exports.branches.officeId],
    }),
    (0, pg_core_1.foreignKey)({
        name: 'vibang_cases_office_tenant_fk',
        columns: [t.officeId, t.tenantId],
        foreignColumns: [exports.offices.id, exports.offices.tenantId],
    }),
    (0, pg_core_1.foreignKey)({
        name: 'vibang_cases_customer_tenant_fk',
        columns: [t.customerId, t.tenantId],
        foreignColumns: [exports.customers.id, exports.customers.tenantId],
    }),
    (0, pg_core_1.foreignKey)({
        name: 'vibang_cases_contract_tenant_fk',
        columns: [t.contractId, t.tenantId],
        foreignColumns: [exports.contracts.id, exports.contracts.tenantId],
    }),
    (0, pg_core_1.foreignKey)({
        name: 'vibang_cases_thv_tenant_fk',
        columns: [t.responsibleThvUserId, t.tenantId],
        foreignColumns: [exports.users.id, exports.users.tenantId],
    }),
]);
exports.vibangCaseChangeRequests = (0, pg_core_1.pgTable)('vibang_case_change_requests', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    tenantId: (0, pg_core_1.uuid)('tenant_id').notNull(),
    caseId: (0, pg_core_1.uuid)('case_id').notNull(),
    requestedBy: (0, pg_core_1.text)('requested_by').notNull(),
    reason: (0, pg_core_1.text)('reason').notNull(),
    before: (0, pg_core_1.jsonb)('before').notNull(),
    after: (0, pg_core_1.jsonb)('after').notNull(),
    status: (0, pg_core_1.text)('status').notNull().default('PENDING'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedBy: (0, pg_core_1.text)('decided_by'),
    decidedAt: (0, pg_core_1.timestamp)('decided_at', { withTimezone: true }),
}, (t) => [
    (0, pg_core_1.foreignKey)({
        name: 'vibang_cr_case_tenant_fk',
        columns: [t.caseId, t.tenantId],
        foreignColumns: [exports.vibangCases.id, exports.vibangCases.tenantId],
    }),
]);
