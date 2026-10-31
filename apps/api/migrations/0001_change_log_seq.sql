ALTER TABLE `change_log` ADD `seq` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `change_log_undo_of_idx` ON `change_log` (`undo_of`);