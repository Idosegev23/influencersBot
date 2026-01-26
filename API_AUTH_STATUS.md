# API Authentication Status

## ✅ תוקן (Cookie Auth)
- ✅ `/api/influencer/partnerships` - GET, POST
- ✅ `/api/influencer/partnerships/[id]` - GET, PATCH, DELETE
- ✅ `/api/influencer/partnerships/[id]/documents` - GET
- ✅ `/api/influencer/documents/upload` - POST
- ✅ `/api/influencer/documents/parse` - POST
- ✅ `/api/influencer/documents/[id]` - GET, DELETE
- ✅ `/api/influencer/analytics/audience` - GET
- ✅ `/api/influencer/analytics/conversations` - GET
- ✅ `/api/influencer/analytics/coupons` - GET
- ✅ `/api/influencer/tasks/summary` - GET
- ✅ `/api/influencer/tasks` - GET (חלקי)
- ✅ `/api/influencer/content` - GET
- ✅ `/api/influencer/products` - GET

## ⚠️ צריך תיקון (RLS Loop)
- ⚠️ `/api/influencer/tasks/[id]` - GET, PATCH, DELETE
- ⚠️ `/api/influencer/communications/*`
- ⚠️ `/api/influencer/partnerships/[id]/roi`
- ⚠️ `/api/influencer/partnerships/[id]/coupons`
- ⚠️ `/api/influencer/[username]/analytics/*`
- ⚠️ `/api/influencer/notifications/*`
- ⚠️ `/api/influencer/documents/[id]/update-parsed`
- ⚠️ `/api/influencer/regenerate-greeting`
- ⚠️ `/api/influencer/rescan`
- ⚠️ `/api/influencer/partnerships/create-from-parsed`

## איך לתקן?
השתמש ב-`requireInfluencerAuth` במקום `requireAuth`:

```ts
import { requireInfluencerAuth } from '@/lib/auth/influencer-auth';

const auth = await requireInfluencerAuth(req);
if (!auth.authorized) {
  return auth.response!;
}

// עכשיו יש:
// - auth.username
// - auth.influencer
// - auth.accountId
```

## רק לזכור!
- ✅ Cookie auth = אין RLS loop
- ❌ getCurrentUser() = RLS loop על users
- ✅ supabase client = service role (עוקף RLS)
