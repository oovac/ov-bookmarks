CREATE TABLE `ov_ai_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bookmark_id` text NOT NULL,
	`task` text NOT NULL,
	`provider` text,
	`model` text,
	`prompt_version` text DEFAULT 'ov-v1' NOT NULL,
	`score` integer,
	`comment` text,
	`status` text DEFAULT 'empty' NOT NULL,
	`error_code` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ov_assessment_user_task_idx` ON `ov_ai_assessments` (`user_id`,`task`,`created_at`);--> statement-breakpoint
CREATE INDEX `ov_assessment_link_task_idx` ON `ov_ai_assessments` (`bookmark_id`,`task`,`created_at`);--> statement-breakpoint
CREATE TABLE `ov_canonical_links` (
	`user_id` text NOT NULL,
	`normalized_url` text NOT NULL,
	`bookmark_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `normalized_url`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ov_canonical_bookmark_idx` ON `ov_canonical_links` (`bookmark_id`);--> statement-breakpoint
CREATE TABLE `ov_link_meta` (
	`bookmark_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`review_priority` integer,
	`for_case` integer DEFAULT false NOT NULL,
	`for_future` integer DEFAULT false NOT NULL,
	`user_rating` integer,
	`user_comment` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ov_meta_user_priority_idx` ON `ov_link_meta` (`user_id`,`review_priority`);--> statement-breakpoint
CREATE INDEX `ov_meta_user_rating_idx` ON `ov_link_meta` (`user_id`,`user_rating`);--> statement-breakpoint
CREATE TABLE `ov_link_terms` (
	`bookmark_id` text NOT NULL,
	`term_id` text NOT NULL,
	PRIMARY KEY(`bookmark_id`, `term_id`),
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`term_id`) REFERENCES `ov_terms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ov_term_links_idx` ON `ov_link_terms` (`term_id`,`bookmark_id`);--> statement-breakpoint
CREATE TABLE `ov_open_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bookmark_id` text NOT NULL,
	`source` text DEFAULT 'web' NOT NULL,
	`opened_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ov_opens_user_time_idx` ON `ov_open_events` (`user_id`,`opened_at`);--> statement-breakpoint
CREATE INDEX `ov_opens_link_time_idx` ON `ov_open_events` (`bookmark_id`,`opened_at`);--> statement-breakpoint
CREATE TABLE `ov_tab_captures` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`label` text,
	`browser` text,
	`bookmark_ids` text NOT NULL,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `ov_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ov_capture_workspace_idx` ON `ov_tab_captures` (`workspace_id`,`captured_at`);--> statement-breakpoint
CREATE TABLE `ov_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`trigger_description` text,
	`parent_id` text,
	`comment` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ov_terms_user_kind_name` ON `ov_terms` (`user_id`,`kind`,`normalized_name`);--> statement-breakpoint
CREATE TABLE `ov_workspace_links` (
	`workspace_id` text NOT NULL,
	`bookmark_id` text NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `bookmark_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `ov_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ov_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ov_workspace_owner_idx` ON `ov_workspaces` (`owner_id`);