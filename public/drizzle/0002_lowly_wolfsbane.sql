CREATE TABLE `set_vocabulary` (
	`id` text PRIMARY KEY NOT NULL,
	`set_id` text NOT NULL,
	`name` text NOT NULL,
	`type_line` text DEFAULT '' NOT NULL,
	`oracle_text` text DEFAULT '' NOT NULL,
	`keywords` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`set_id`) REFERENCES `sets`(`id`) ON UPDATE no action ON DELETE cascade
);
