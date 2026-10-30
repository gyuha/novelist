CREATE TABLE `annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`chapter_id` text NOT NULL,
	`mark_id` text NOT NULL,
	`body` text NOT NULL,
	`state` text DEFAULT 'anchored' NOT NULL,
	`quote` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `annotations_user_id_idx` ON `annotations` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `annotations_chapter_id_mark_id_idx` ON `annotations` (`chapter_id`,`mark_id`);--> statement-breakpoint
CREATE TABLE `memos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`novel_id` text,
	`chapter_id` text,
	`title` text,
	`body` text NOT NULL,
	`ai_reference` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`novel_id`) REFERENCES `novels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "memos_kind_owner_check" CHECK(("memos"."kind" = 'free' AND "memos"."novel_id" IS NULL AND "memos"."chapter_id" IS NULL)
				OR ("memos"."kind" = 'novel' AND "memos"."novel_id" IS NOT NULL AND "memos"."chapter_id" IS NULL)
				OR ("memos"."kind" = 'chapter' AND "memos"."novel_id" IS NOT NULL AND "memos"."chapter_id" IS NOT NULL)),
	CONSTRAINT "memos_title_length_check" CHECK("memos"."title" IS NULL OR length("memos"."title") <= 200)
);
--> statement-breakpoint
CREATE INDEX `memos_user_id_idx` ON `memos` (`user_id`);--> statement-breakpoint
CREATE INDEX `memos_novel_id_idx` ON `memos` (`novel_id`);--> statement-breakpoint
CREATE INDEX `memos_chapter_id_idx` ON `memos` (`chapter_id`);