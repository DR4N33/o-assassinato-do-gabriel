CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`occupation` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'suspeito' NOT NULL,
	`story` text DEFAULT '' NOT NULL,
	`secrets` text DEFAULT '' NOT NULL,
	`alibi` text DEFAULT '' NOT NULL,
	`information` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`character_id` text,
	`last_seen` integer,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_phone_unique` ON `players` (`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `players_character_id_unique` ON `players` (`character_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`rosa` text DEFAULT '' NOT NULL
);
