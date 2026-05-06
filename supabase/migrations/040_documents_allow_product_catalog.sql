-- Allow 'product_catalog' as a documents.entity_type so we can attach a
-- single document per account that owns all product chunks.
ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_entity_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'post','transcription','highlight','partnership','coupon',
    'knowledge_base','document','website','product_catalog'
  ]));
