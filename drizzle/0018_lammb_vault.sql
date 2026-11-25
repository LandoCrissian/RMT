CREATE TABLE `lammb_vault_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lammb_vault_limits_expiry` ON `lammb_vault_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `lammb_vault_receipts` (
	`hash` text PRIMARY KEY NOT NULL,
	`token_id` text NOT NULL,
	`recipient` text NOT NULL,
	`asset` text NOT NULL,
	`amount` text NOT NULL,
	`block_number` integer NOT NULL,
	`block_hash` text NOT NULL,
	`block_timestamp` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "lammb_vault_receipts_asset" CHECK("lammb_vault_receipts"."asset" IN ('ETH','WETH','USDG')),
	CONSTRAINT "lammb_vault_receipts_positive" CHECK(length("lammb_vault_receipts"."amount") BETWEEN 1 AND 78 AND "lammb_vault_receipts"."amount" NOT GLOB '*[^0-9]*' AND substr("lammb_vault_receipts"."amount",1,1) BETWEEN '1' AND '9')
);
--> statement-breakpoint
CREATE INDEX `lammb_vault_receipts_block` ON `lammb_vault_receipts` (`block_number`);--> statement-breakpoint
CREATE TABLE `lammb_vault_treasury` (
	`id` integer PRIMARY KEY NOT NULL,
	`address` text,
	`revision` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	CONSTRAINT "lammb_vault_treasury_singleton" CHECK("lammb_vault_treasury"."id"=1)
);
--> statement-breakpoint
CREATE TABLE `lammb_vault_wallets` (
	`browser_hash` text PRIMARY KEY NOT NULL,
	`challenge_id` text NOT NULL,
	`origin` text NOT NULL,
	`address` text NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`session_hash` text
);
--> statement-breakpoint
CREATE INDEX `lammb_vault_wallets_expiry` ON `lammb_vault_wallets` (`expires_at`);
--> statement-breakpoint
INSERT INTO lammb_vault_receipts (hash,token_id,recipient,asset,amount,block_number,block_hash,block_timestamp,created_at) VALUES
  ('0x59bcb422d9c54d2f898ef775951c02f5ffdd6d67662b5fdaa30b5f6b09470294', '274', '0x7e8e7d3af28584a8b9eeddbe16cd3308bd1e76ca', 'WETH', '100000000000000', 122006504, '0x57a46f7f121972f4609ea693b5d066595d14ac4847b6ae1a38847b422d27d5a8', 1795499950, 1795618800000),
  ('0x618b3e882f0ebbe6b432fd80f7d36e2b0992cdde00261c3e8386523af5a4ce71', '388', '0x7e8e7d3af28584a8b9eeddbe16cd3308bd1e76ca', 'WETH', '90000000000000', 120827320, '0x7c6498912bbd958e94b5592f16d610084c51af02f233650e80e5069d09479753', 1795373253, 1795618800000),
  ('0x6468507739fd578b91bd0881b2c6e03d123b644d777c6b5dc089054f365f9b02', '253', '0x7e8e7d3af28584a8b9eeddbe16cd3308bd1e76ca', 'WETH', '100000000000000', 120732789, '0x873111e9c7f4cd53f79c7a832f1a660b02f10776e0dbe61561f77e47e1c0dc58', 1795362562, 1795618800000),
  ('0x1c37e44ef4d74b2dd39f9de57c583e5004b296a70dd54c1dc3a23a98f689d3aa', '245', '0x7e8e7d3af28584a8b9eeddbe16cd3308bd1e76ca', 'WETH', '60000000000000', 120077178, '0x1612c912a562af097715f25ddf2b43c43e3efb1375c38c97813bb3ac88a067e8', 1795286300, 1795618800000),
  ('0x21c9093f64b1d7219e5459bb3e7bde0576a12930fe1fec2b90e4f1e050d9bee6', '222', '0x7e8e7d3af28584a8b9eeddbe16cd3308bd1e76ca', 'ETH', '84520000000000', 120132507, '0xb33165236d8a1e4db6e9df6d2e9217847e67755bd907b0c8de64bf16970f7b91', 1795292608, 1795618800000);
