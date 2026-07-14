-- Roles: SUPPORT, VOLUNTEER
INSERT INTO "roles" (
  "key", "name", "discount", "min_pay_stars", "days", "devices_count",
  "traffic_limit_gb", "is_unlimit_traffic", "is_premium_servers",
  "is_no_ads", "is_role_chat", "is_auto_renewing", "role_name"
)
VALUES
  ('SUPPORT'::"UserRoleEnum", 'Поддержка', 0.8, 10, 1, 1, 1, false, true, false, true, false, 'Поддержка'),
  ('VOLUNTEER'::"UserRoleEnum", 'Волонтер', 0.9, 10, 1, 1, 1, false, true, false, true, false, 'Волонтер')
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "discount" = EXCLUDED."discount",
  "min_pay_stars" = EXCLUDED."min_pay_stars",
  "days" = EXCLUDED."days",
  "devices_count" = EXCLUDED."devices_count",
  "traffic_limit_gb" = EXCLUDED."traffic_limit_gb",
  "is_unlimit_traffic" = EXCLUDED."is_unlimit_traffic",
  "is_premium_servers" = EXCLUDED."is_premium_servers",
  "is_no_ads" = EXCLUDED."is_no_ads",
  "is_role_chat" = EXCLUDED."is_role_chat",
  "is_auto_renewing" = EXCLUDED."is_auto_renewing",
  "role_name" = EXCLUDED."role_name";

-- DefaultSubData: DEFAULT
INSERT INTO "default_sub_data" (
  "key", "devices_count", "is_premium_servers", "traffic_limit_gb",
  "is_unlimit_traffic", "days", "is_no_ads", "is_role_chat", "is_auto_renewing",
  "updated_at"
)
VALUES (
  'DEFAULT'::"DefaultEnum", 1, false, 1, false, 1, false, false, false, now()
)
ON CONFLICT ("key") DO UPDATE SET
  "devices_count" = EXCLUDED."devices_count",
  "is_premium_servers" = EXCLUDED."is_premium_servers",
  "traffic_limit_gb" = EXCLUDED."traffic_limit_gb",
  "is_unlimit_traffic" = EXCLUDED."is_unlimit_traffic",
  "days" = EXCLUDED."days",
  "is_no_ads" = EXCLUDED."is_no_ads",
  "is_role_chat" = EXCLUDED."is_role_chat",
  "is_auto_renewing" = EXCLUDED."is_auto_renewing",
  "updated_at" = now();

-- SubscriptionExtensions: PREMIUM, CHANNEL, CHAT, BIO, NAME
INSERT INTO "subscription_extensions" (
  "key", "days", "devices_count", "traffic_limit_gb", "is_unlimit_traffic",
  "is_premium_servers", "is_no_ads", "is_role_chat", "is_auto_renewing", "role_name"
)
VALUES
  ('PREMIUM'::"SubscriptionExtensionsEnum", 0, 10, 50, false, true, true, true, true, 'Премиум'),
  ('CHANNEL'::"SubscriptionExtensionsEnum", 2, 1, 1, false, false, false, false, false, NULL),
  ('CHAT'::"SubscriptionExtensionsEnum", 2, 1, 1, false, false, false, false, false, NULL),
  ('BIO'::"SubscriptionExtensionsEnum", 1, 1, 1, false, false, false, false, false, NULL),
  ('NAME'::"SubscriptionExtensionsEnum", 1, 1, 1, false, false, false, false, false, NULL)
ON CONFLICT ("key") DO UPDATE SET
  "days" = EXCLUDED."days",
  "devices_count" = EXCLUDED."devices_count",
  "traffic_limit_gb" = EXCLUDED."traffic_limit_gb",
  "is_unlimit_traffic" = EXCLUDED."is_unlimit_traffic",
  "is_premium_servers" = EXCLUDED."is_premium_servers",
  "is_no_ads" = EXCLUDED."is_no_ads",
  "is_role_chat" = EXCLUDED."is_role_chat",
  "is_auto_renewing" = EXCLUDED."is_auto_renewing",
  "role_name" = EXCLUDED."role_name";

-- ExternalSquad: RU_ROUTING_FRAGMENT
INSERT INTO "external_squads" ("key", "uuid")
VALUES ('RU_ROUTING_FRAGMENT'::"ExternalSquadEnum", '0b1bd76f-06ba-4d02-acdb-4bff82c69587')
ON CONFLICT ("key") DO UPDATE SET "uuid" = EXCLUDED."uuid";

-- InternalSquads: FREE, PREMIUM, TELEGRAM
INSERT INTO "internal_squads" ("key", "uuid")
VALUES
  ('FREE'::"InternalSquadsEnum", '745e6772-3dcd-41b2-befc-9ccc9c9a3714'),
  ('PREMIUM'::"InternalSquadsEnum", '2d04797e-dac5-4df6-a7e9-d0e39ba93de2'),
  ('TELEGRAM'::"InternalSquadsEnum", 'e4b69fdd-487a-4dce-986d-c735e7e078eb')
ON CONFLICT ("key") DO UPDATE SET "uuid" = EXCLUDED."uuid";
