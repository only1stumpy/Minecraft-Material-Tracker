INSERT INTO "Buildings" (
  "id",
  "name",
  "x",
  "y",
  "z",
  "schematicFileName",
  "materialsFileName",
  "screenshotDataUrl",
  "materials",
  "createdAt",
  "checklist"
)
VALUES (
  'legacy-building-fixture',
  'Legacy Rathaus',
  123,
  64,
  -456,
  'legacy-rathaus.litematic',
  'legacy-materials.csv',
  NULL,
  '[{"item":"Stone Bricks","total":"128"},{"item":"Glass","total":"24"}]'::jsonb,
  TIMESTAMP '2024-01-02 03:04:05.678',
  '[{"text":"Foundation","done":true},{"text":"Roof","done":false}]'::jsonb
);
