CREATE TABLE `system_config` (
	`id` text PRIMARY KEY DEFAULT 'active_user' NOT NULL,
	`display_name` text NOT NULL,
	`session_token` text,
	`is_cloud_synced` integer DEFAULT false NOT NULL,
	`last_sync_timestamp` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sets` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`icon_svg_uri` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`merge_base_updated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sets_code_unique` ON `sets` (`code`);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`set_id` text NOT NULL,
	`arena_id` integer NOT NULL,
	`collector_number` text NOT NULL,
	`scryfall_id` text NOT NULL,
	`name` text NOT NULL,
	`local_art_uri` text NOT NULL,
	`local_illustration_uri` text DEFAULT '' NOT NULL,
	`type_line` text NOT NULL,
	`colors` text NOT NULL,
	`rarity` text NOT NULL,
	`mana_cost` text NOT NULL,
	`oracle_text` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`set_id`) REFERENCES `sets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `decks` (
	`id` text PRIMARY KEY NOT NULL,
	`set_id` text NOT NULL,
	`name` text NOT NULL,
	`themes` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'concept' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`cover_card_id` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`merge_base_updated_at` text,
	FOREIGN KEY (`set_id`) REFERENCES `sets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `deck_cards` (
	`deck_id` text NOT NULL,
	`card_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`deck_id`, `card_id`),
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`theirs_payload` text NOT NULL,
	`theirs_updated_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_queue_entity_record_idx` ON `sync_queue` (`entity_type`,`entity_id`);
