CREATE TABLE `workout_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`seq` integer NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workout_labels_seq_idx` ON `workout_labels` (`seq`);--> statement-breakpoint
ALTER TABLE `workouts` ADD `label_id` text;