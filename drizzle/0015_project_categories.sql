CREATE TABLE taxonomy_categories(id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, position INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN(0,1)));
--> statement-breakpoint
INSERT INTO taxonomy_categories(id,name,position) VALUES ('nft','NFTs & Collectibles',0),
('gaming','Gaming',1),
('defi','DeFi',2),
('trading','Trading & Analytics',3),
('ai','AI & Agents',4),
('apps','Apps & Utilities',5),
('devtools','Developer Tools',6),
('communities','Communities',7),
('art','Art & Entertainment',8),
('infrastructure','Infrastructure',9),
('education','Education',10),
('tokens','Tokens',11);
--> statement-breakpoint
CREATE TABLE project_categories(project_id TEXT NOT NULL, category_id TEXT NOT NULL REFERENCES taxonomy_categories(id), is_primary INTEGER NOT NULL CHECK(is_primary IN(0,1)), PRIMARY KEY(project_id,category_id));
--> statement-breakpoint
CREATE UNIQUE INDEX project_primary_category ON project_categories(project_id) WHERE is_primary=1;
--> statement-breakpoint
CREATE INDEX category_members ON project_categories(category_id,project_id);
--> statement-breakpoint
CREATE TABLE taxonomy_reviews(revision INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, reviewed_at INTEGER NOT NULL);
--> statement-breakpoint
ALTER TABLE submissions ADD COLUMN category_selection TEXT NOT NULL DEFAULT '[]';
--> statement-breakpoint
CREATE TRIGGER submission_categories AFTER UPDATE OF status ON submissions
WHEN NEW.status='approved' AND OLD.status='pending' BEGIN
 INSERT INTO project_categories(project_id,category_id,is_primary)
 SELECT 'community-'||NEW.id,j.value,j.key=0 FROM json_each(CASE WHEN json_array_length(NEW.category_selection)>0 THEN NEW.category_selection ELSE json_array(CASE NEW.category WHEN 'Games' THEN 'gaming' WHEN 'Music' THEN 'art' WHEN 'Tools' THEN 'apps' ELSE 'communities' END) END) j;
END;
--> statement-breakpoint
CREATE TRIGGER category_active BEFORE INSERT ON project_categories WHEN NOT EXISTS(SELECT 1 FROM taxonomy_categories WHERE id=NEW.category_id AND archived=0) BEGIN SELECT RAISE(ABORT,'Category unavailable'); END;
--> statement-breakpoint
CREATE TRIGGER archive_unused BEFORE UPDATE OF archived ON taxonomy_categories WHEN NEW.archived=1 AND EXISTS(SELECT 1 FROM project_categories WHERE category_id=NEW.id) BEGIN SELECT RAISE(ABORT,'Reassign projects before archiving'); END;

--> statement-breakpoint
INSERT INTO project_categories SELECT 'vamps','gaming',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'vamps','nft',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'vamps','apps',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'lammbs','nft',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'lammbs','communities',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'suited-apes','nft',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'suited-apes','gaming',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'suited-apes','trading',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'ccff00','nft',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'ccff00','apps',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'hood-vandalz','nft',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'hood-vandalz','art',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'pixel-hood-arcade','gaming',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'pixel-hood-arcade','nft',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'pixel-hood-arcade','art',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'cannacats-v2','nft',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'cannacats-v2','art',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'robin-rabbits','nft',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'robin-rabbits','art',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT '1kiss','art',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT '1kiss','nft',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'synchronized-mindz','communities',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'synchronized-mindz','nft',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'synchronized-mindz','art',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'cash-grab-rh','gaming',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'cash-grab-rh','nft',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'cash-grab-rh','art',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'abstract-workers2','art',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'abstract-workers2','nft',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'animal-pharm-71884901','art',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'animal-pharm-71884901','nft',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'animal-pharm-71884901','apps',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'pricedout','nft',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'companions-by-wfit','nft',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'companions-by-wfit','apps',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'tmo-initiates','nft',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'tmo-initiates','communities',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'tmo-initiates','art',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'rillaz-n-da-hood-apex-collection','gaming',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'rillaz-n-da-hood-apex-collection','nft',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'rillaz-n-da-hood-apex-collection','trading',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'claystonkz','art',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'claystonkz','nft',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'stray-cucks','nft',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'stray-cucks','gaming',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'stray-cucks','apps',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'hoodfi','infrastructure',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'hoodfi','devtools',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'hoodfi','apps',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'moneymomos','nft',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'moneymomos','art',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'moneymomos','communities',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'wif-outlaws','nft',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'wif-outlaws','apps',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'bored-traders','nft',1;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'bored-traders','art',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'bored-traders','tokens',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'bored-traders','defi',0;
--> statement-breakpoint
INSERT INTO project_categories SELECT 'community-a03d19b5-8cb0-47b6-97a8-23ecf5e5f194','defi',1 WHERE EXISTS(SELECT 1 FROM submissions WHERE id='a03d19b5-8cb0-47b6-97a8-23ecf5e5f194' AND status IN ('approved','suspended'));
--> statement-breakpoint
INSERT INTO project_categories SELECT 'community-a03d19b5-8cb0-47b6-97a8-23ecf5e5f194','trading',0 WHERE EXISTS(SELECT 1 FROM submissions WHERE id='a03d19b5-8cb0-47b6-97a8-23ecf5e5f194' AND status IN ('approved','suspended'));
--> statement-breakpoint
INSERT INTO project_categories SELECT 'community-a03d19b5-8cb0-47b6-97a8-23ecf5e5f194','gaming',0 WHERE EXISTS(SELECT 1 FROM submissions WHERE id='a03d19b5-8cb0-47b6-97a8-23ecf5e5f194' AND status IN ('approved','suspended'));
--> statement-breakpoint
INSERT INTO project_categories SELECT 'community-a03d19b5-8cb0-47b6-97a8-23ecf5e5f194','tokens',0 WHERE EXISTS(SELECT 1 FROM submissions WHERE id='a03d19b5-8cb0-47b6-97a8-23ecf5e5f194' AND status IN ('approved','suspended'));
--> statement-breakpoint
INSERT INTO project_categories SELECT 'community-'||id,CASE category WHEN 'Games' THEN 'gaming' WHEN 'Music' THEN 'art' WHEN 'Tools' THEN 'apps' ELSE 'communities' END,1 FROM submissions s WHERE status IN ('approved','suspended') AND NOT EXISTS(SELECT 1 FROM project_categories p WHERE p.project_id='community-'||s.id);
--> statement-breakpoint
INSERT INTO project_categories SELECT project_id,CASE json_extract(definition_json,'$.category') WHEN 'Games' THEN 'gaming' WHEN 'Music' THEN 'art' WHEN 'Tools' THEN 'apps' ELSE 'communities' END,1 FROM project_controls WHERE source='admin';
--> statement-breakpoint
CREATE TRIGGER admin_category AFTER INSERT ON project_controls WHEN NEW.source='admin' BEGIN INSERT INTO project_categories SELECT NEW.project_id,value,key=0 FROM json_each(coalesce(json_extract(NEW.definition_json,'$.initialCategories'),json_array(CASE json_extract(NEW.definition_json,'$.category') WHEN 'Games' THEN 'gaming' WHEN 'Music' THEN 'art' WHEN 'Tools' THEN 'apps' ELSE 'communities' END))); END;

--> statement-breakpoint
INSERT INTO project_categories VALUES('vamps','ai',0);
