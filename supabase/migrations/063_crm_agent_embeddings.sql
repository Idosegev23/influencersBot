-- Migration 063 (P3): per-agent semantic RAG index for the WhatsApp advisory brain (spec §4.5C).
-- Hard tenant boundary lives in match_agent_embeddings (WHERE e.agent_id = p_agent_id).
-- (061 = P0 idempotency+log, 062 = P1 version — so P3 embeddings take 063.)
create extension if not exists vector;

create table if not exists public.crm_agent_embeddings (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references public.users(id) on delete cascade,
  talent_id    uuid,          -- accounts.id (the represented influencer)
  brand        text,
  deal_id      uuid,          -- partnerships.id
  source_type  text not null, -- brief | transcript | quote | contract | note | deliverable | special_term
  source_id    text,          -- origin row id (brief/deal/transcript)
  chunk_index  int not null default 0,
  chunk_text   text not null,
  chunk_hash   text not null,
  embedding    vector(2000),  -- OpenAI text-embedding-3-large @2000d (same space as document_chunks)
  source_date  timestamptz,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_agent_emb_agent   on public.crm_agent_embeddings(agent_id);
create index if not exists idx_agent_emb_scope    on public.crm_agent_embeddings(agent_id, source_type);
create index if not exists idx_agent_emb_talent   on public.crm_agent_embeddings(agent_id, talent_id);
create unique index if not exists idx_agent_emb_dedup
  on public.crm_agent_embeddings(agent_id, source_type, source_id, chunk_index);
create index if not exists idx_agent_emb_hnsw
  on public.crm_agent_embeddings using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);

create or replace function match_agent_embeddings(
  p_agent_id     uuid,
  p_embedding    text,
  p_match_count  int         default 12,
  p_threshold    float       default 0.20,
  p_talent_id    uuid        default null,
  p_brand        text        default null,
  p_deal_id      uuid        default null,
  p_source_types text[]      default null,
  p_since        timestamptz default null
)
returns table (
  id uuid, talent_id uuid, brand text, deal_id uuid, source_type text,
  source_id text, chunk_text text, similarity float, source_date timestamptz, metadata jsonb
)
language plpgsql stable as $$
begin
  return query
  select e.id, e.talent_id, e.brand, e.deal_id, e.source_type, e.source_id, e.chunk_text,
         (1 - (e.embedding <=> p_embedding::vector))::float as similarity,
         e.source_date, e.metadata
  from public.crm_agent_embeddings e
  where e.agent_id = p_agent_id                                   -- tenant boundary FIRST
    and e.embedding is not null
    and (1 - (e.embedding <=> p_embedding::vector)) > p_threshold
    and (p_talent_id    is null or e.talent_id   = p_talent_id)
    and (p_deal_id      is null or e.deal_id      = p_deal_id)
    and (p_brand        is null or e.brand ilike '%'||p_brand||'%')
    and (p_source_types is null or e.source_type  = any(p_source_types))
    and (p_since        is null or e.source_date >= p_since)
  order by e.embedding <=> p_embedding::vector
  limit p_match_count;
end;
$$;

grant execute on function match_agent_embeddings(uuid, text, int, float, uuid, text, uuid, text[], timestamptz) to service_role;
comment on table public.crm_agent_embeddings is 'Per-agent RAG index for the WhatsApp advisory brain (spec §4.5C). Scoped by agent_id in match_agent_embeddings.';
