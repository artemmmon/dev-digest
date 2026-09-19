DROP INDEX "repos_ws_idx";--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pr_commits_pr_idx" ON "pr_commits" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "pr_files_pr_idx" ON "pr_files" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "findings_review_idx" ON "findings" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "reviews_pr_created_idx" ON "reviews" USING btree ("pr_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_skills_skill_idx" ON "agent_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "agents_ws_idx" ON "agents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_runs_pr_ran_at_idx" ON "agent_runs" USING btree ("pr_id","ran_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_severity_ck" CHECK ("findings"."severity" in ('CRITICAL', 'WARNING', 'SUGGESTION'));--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_status_ck" CHECK ("agent_runs"."status" in ('running', 'done', 'failed', 'cancelled'));