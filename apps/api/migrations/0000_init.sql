CREATE TABLE `applied_mutations` (
	`mutation_id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`applied_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `athlete_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`seq` integer NOT NULL,
	`content` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `athlete_profile_seq_idx` ON `athlete_profile` (`seq`);--> statement-breakpoint
CREATE TABLE `change_log` (
	`id` text PRIMARY KEY NOT NULL,
	`change_group_id` text NOT NULL,
	`actor` text NOT NULL,
	`thread_id` text,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`op` text NOT NULL,
	`before` text,
	`after` text,
	`undo_of` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `change_log_group_idx` ON `change_log` (`change_group_id`);--> statement-breakpoint
CREATE INDEX `change_log_entity_idx` ON `change_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_token_hash_unique` ON `devices` (`token_hash`);--> statement-breakpoint
CREATE TABLE `equipment_items` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`props` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `equipment_items_seq_idx` ON `equipment_items` (`seq`);--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`seq` integer NOT NULL,
	`name_pl` text NOT NULL,
	`aliases` text NOT NULL,
	`primary_muscles` text NOT NULL,
	`secondary_muscles` text NOT NULL,
	`patterns` text NOT NULL,
	`requires` text NOT NULL,
	`implements` integer NOT NULL,
	`unilateral` integer NOT NULL,
	`rest_seconds` integer NOT NULL,
	`weight_step_kg` real,
	`note` text,
	`archived` integer DEFAULT false NOT NULL,
	`measure` text NOT NULL,
	`rep_range` text,
	`time_range_s` text
);
--> statement-breakpoint
CREATE INDEX `exercises_seq_idx` ON `exercises` (`seq`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`seq` integer NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`parts` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_seq_idx` ON `messages` (`seq`);--> statement-breakpoint
CREATE INDEX `messages_thread_idx` ON `messages` (`thread_id`);--> statement-breakpoint
CREATE TABLE `pairing_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pairing_codes_code_hash_unique` ON `pairing_codes` (`code_hash`);--> statement-breakpoint
CREATE TABLE `pairing_failures` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pairing_failures_at_idx` ON `pairing_failures` (`at`);--> statement-breakpoint
CREATE TABLE `pending_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`tool` text NOT NULL,
	`input` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE TABLE `sets` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`seq` integer NOT NULL,
	`workout_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`status` text NOT NULL,
	`weight_kg` real NOT NULL,
	`reps` integer,
	`duration_s` integer,
	`rir` integer,
	`warmup` integer DEFAULT false NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`performed_at` text,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sets_seq_idx` ON `sets` (`seq`);--> statement-breakpoint
CREATE INDEX `sets_workout_idx` ON `sets` (`workout_id`);--> statement-breakpoint
CREATE INDEX `sets_exercise_idx` ON `sets` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`seq` integer NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `settings_seq_idx` ON `settings` (`seq`);--> statement-breakpoint
CREATE TABLE `sync_counter` (
	`id` integer PRIMARY KEY NOT NULL,
	`value` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`seq` integer NOT NULL,
	`date` text NOT NULL,
	`workout_id` text
);
--> statement-breakpoint
CREATE INDEX `threads_seq_idx` ON `threads` (`seq`);--> statement-breakpoint
CREATE INDEX `threads_date_idx` ON `threads` (`date`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`seq` integer NOT NULL,
	`date` text NOT NULL,
	`started_at` text,
	`ended_at` text,
	`checkin` text,
	`rationale` text,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workouts_seq_idx` ON `workouts` (`seq`);--> statement-breakpoint
CREATE INDEX `workouts_date_idx` ON `workouts` (`date`);