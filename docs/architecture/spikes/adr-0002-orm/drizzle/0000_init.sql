CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"action" text NOT NULL,
	"ref_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"tenant_id" text NOT NULL,
	"scope" text NOT NULL,
	"year" integer NOT NULL,
	"seq" integer NOT NULL,
	CONSTRAINT "counters_tenant_id_scope_year_pk" PRIMARY KEY("tenant_id","scope","year")
);
--> statement-breakpoint
CREATE TABLE "obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	CONSTRAINT "obligations_tenant_id_code_unique" UNIQUE("tenant_id","code")
);
