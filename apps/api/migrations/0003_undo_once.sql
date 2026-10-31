DROP INDEX `change_log_undo_of_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `change_log_undo_of_idx` ON `change_log` (`undo_of`,`entity`,`entity_id`);