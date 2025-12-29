# Database Structure (ERD)

## Overview

This RSS Reader uses **Cloudflare KV** (Key-Value Store) with a GET-optimized architecture. The design prioritizes cheap GET operations over expensive LIST operations, leveraging Worker CPU for merge-sort aggregation.

## Storage Architecture

### Design Principles
- **GET-heavy:** 99.9% of operations are inexpensive GET requests
- **LIST-minimal:** Only cron jobs use LIST operations (~96/day, well under 1,000/day free tier)
- **Worker-side aggregation:** Merge sorting happens in Worker CPU (free)
- **Feed isolation:** Each feed's growth is independent
- **Multi-tenant ready:** Each user is completely isolated

---

## Entity Relationship Diagram

```
┌─────────────────────────────────┐
│     USER SUBSCRIPTIONS          │
│  Key: user:{userId}:subs        │
├─────────────────────────────────┤
│ feeds: [                        │
│   {                             │
│     feedId: string         ─────┼──┐
│     caughtUpToTimestamp: int    │  │
│     manuallyReadBefore: [id]    │  │  (1:N relationship)
│   }                             │  │
│ ]                               │  │
└─────────────────────────────────┘  │
                                     │
                                     ▼
┌─────────────────────────────────┐  │
│     USER STARRED                │  │
│  Key: user:{userId}:starred     │  │
├─────────────────────────────────┤  │
│ [articleId, articleId, ...]     │  │
└─────────────────────────────────┘  │
                                     │
                                     │
┌─────────────────────────────────┐  │
│         FEED INDEX              │◄─┘
│  Key: feed:{feedId}             │
├─────────────────────────────────┤
│ id: string                      │
│ name: string                    │
│ url: string                     │
│ lastFetched: timestamp          │
│ articles: [                     │
│   {                             │
│     id: string             ─────┼──┐
│     timestamp: int              │  │
│   }                             │  │  (1:N relationship)
│ ]                               │  │
│ (sorted DESC, newest first)     │  │
└─────────────────────────────────┘  │
                                     │
                                     ▼
                              ┌─────────────────────────────────┐
                              │         ARTICLE                 │
                              │  Key: article:{articleId}       │
                              ├─────────────────────────────────┤
                              │ id: string                      │
                              │ feedId: string                  │
                              │ title: string                   │
                              │ excerpt: string                 │
                              │ link: string                    │
                              │ source: string                  │
                              │ sourceUrl: string               │
                              │ timestamp: int                  │
                              └─────────────────────────────────┘
```

---

## Entity Details

### 1. USER SUBSCRIPTIONS
**KV Key:** `user:{userId}:subscriptions`

**Structure:**
```javascript
{
  feeds: [
    {
      feedId: "feed-abc123",
      caughtUpToTimestamp: 1735488000000,    // Watermark: all articles before this are "read"
      manuallyReadBefore: ["article-xyz"]     // Exception: articles before watermark manually marked as read
    }
  ]
}
```

**Purpose:**
- Tracks which feeds a user subscribes to
- Maintains "read cursor" (watermark) per feed
- Handles exceptions for non-sequential reading patterns

**Access Pattern:**
- GET on every page load
- PUT when user subscribes/unsubscribes or marks articles as read

**Scaling:**
- ~50 bytes per subscription
- 500,000 max feeds per user (25MB limit)
- Realistic: <1,000 feeds per user

---

### 2. FEED INDEX
**KV Key:** `feed:{feedId}`

**Structure:**
```javascript
{
  id: "feed-abc123",
  name: "TechCrunch",
  url: "https://techcrunch.com/feed/",
  lastFetched: 1735488000000,
  articles: [
    { id: "article-999", timestamp: 1735488000000 },
    { id: "article-998", timestamp: 1735487900000 },
    { id: "article-997", timestamp: 1735487800000 }
    // ... sorted DESC (newest first)
  ]
}
```

**Purpose:**
- Central index of all articles in a feed
- Enables efficient chronological/reverse-chronological sorting
- Lightweight reference (only IDs + timestamps, not full article data)

**Access Pattern:**
- GET when user loads feed or timeline
- PUT during cron refresh (when new articles arrive)
- LIST during cron to discover all feeds

**Scaling:**
- ~50 bytes per article reference
- 500,000 max articles per feed (25MB limit)
- Realistic feeds never exceed 50,000 articles total

---

### 3. ARTICLE
**KV Key:** `article:{articleId}`

**Structure:**
```javascript
{
  id: "article-abc123",
  feedId: "feed-xyz789",
  title: "Breaking News Title",
  excerpt: "First 500 characters of content...",
  link: "https://example.com/article",
  source: "TechCrunch",        // Denormalized feed name
  sourceUrl: "https://...",     // Denormalized feed URL
  timestamp: 1735488000000
}
```

**Purpose:**
- Full article content and metadata
- Immutable after creation (never updated)

**Access Pattern:**
- GET in batches (50-100 articles) for timeline rendering
- PUT during cron refresh (new articles only)

**Scaling:**
- ~1KB per article
- Billions of articles possible (each is separate KV key)
- Only accessed for articles currently being displayed

---

### 4. USER STARRED
**KV Key:** `user:{userId}:starred`

**Structure:**
```javascript
["article-abc", "article-xyz", "article-123"]
```

**Purpose:**
- Simple list of article IDs the user has starred
- Small set (typically <100 items, power users <1000)

**Access Pattern:**
- GET when rendering starred view
- PUT when user toggles star status

**Scaling:**
- ~20 bytes per article ID
- 1,000,000+ starred articles possible (still <25MB)
- Realistic: <1,000 starred per user

---

## Query Operations

### Get Recent Articles (Reverse Chronological)
```
1. GET user:{userId}:subscriptions                  (1 op)
2. GET feed:{feedId} for each subscribed feed       (N ops, parallel)
3. Merge sort newest articles across all feeds      (Worker CPU)
4. GET article:{articleId} for top 50 results       (50 ops, parallel)

Total: 1 + N feeds + 50 = ~60 GET operations
```

### Get Oldest Unread Articles (Chronological)
```
1. GET user:{userId}:subscriptions                  (1 op)
2. GET feed:{feedId} for each subscribed feed       (N ops, parallel)
3. Find first unread in each feed (after watermark) (Worker CPU)
4. Merge sort oldest unread across all feeds        (Worker CPU)
5. GET article:{articleId} for top 50 results       (50 ops, parallel)

Total: 1 + N feeds + 50 = ~60 GET operations
```

### Mark Article as Read
```
1. GET user:{userId}:subscriptions                  (1 op)
2. GET article:{articleId}                          (1 op)
3. Update watermark or exception list               (Worker CPU)
4. PUT user:{userId}:subscriptions                  (1 op)

Total: 2 GET + 1 PUT = 3 operations
```

### Toggle Star
```
1. GET user:{userId}:starred                        (1 op)
2. Add/remove article ID from array                 (Worker CPU)
3. PUT user:{userId}:starred                        (1 op)

Total: 1 GET + 1 PUT = 2 operations
```

### Cron: Refresh All Feeds
```
1. LIST prefix:"feed:" to discover all feeds        (1 LIST op)
2. For each feed:
   a. GET feed:{feedId}                            (1 GET)
   b. Fetch RSS/Atom from external URL             (external)
   c. PUT article:{articleId} for new articles     (M PUTs)
   d. PUT feed:{feedId} with updated index         (1 PUT)

Total per cron run: 1 LIST + (N feeds × (1 GET + M new articles + 1 PUT))
Frequency: 96x/day (every 15 minutes)
```

---

## Scaling Characteristics

### Capacity Limits

| Entity | Max Size | Realistic Usage | Bottleneck |
|--------|----------|-----------------|------------|
| User Subscriptions | 500,000 feeds | 1,000 feeds | 25MB KV value limit |
| Feed Index | 500,000 articles | 50,000 articles | 25MB KV value limit |
| Articles | Unlimited | Billions | KV namespace limit |
| Starred | 1,000,000 articles | 1,000 articles | 25MB KV value limit |

### Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| Query latency | <100ms | 50 feeds, 50 articles |
| Memory per request | <1MB | Indexes only, not full articles |
| Concurrent users | 100,000+ | Each user isolated |
| Articles per feed | 500,000 | Never hit in practice |
| Total articles | Billions | Separate KV keys |

### Cost (Cloudflare Workers)

**Free Tier:**
- 10M reads/day
- 1,000 LIST operations/day
- 1M writes/day

**At 1,000 active users:**
- ~10M GETs/day (FREE)
- ~96 LISTs/day (FREE)
- ~230K writes/day (FREE)
- **Total: $0/month**

**At 10,000 active users:**
- ~100M GETs/day → $1,350/month
- ~96 LISTs/day (FREE)
- ~2.3M writes/day → $19.50/month
- **Total: ~$1,370/month ($0.14/user/month)**

---

## Relationships

### User → Feeds (Many-to-Many)
- One user subscribes to many feeds
- One feed has many subscribers (implicit)
- Junction table: User Subscriptions entity
- Includes per-user metadata (watermark, exceptions)

### Feed → Articles (One-to-Many)
- One feed contains many articles
- Feed Index stores lightweight references (ID + timestamp)
- Full article data stored separately

### User → Starred (Many-to-Many)
- One user stars many articles
- Junction table: User Starred entity (simple ID list)
- No feed scoping required

---

## Data Consistency

### Write Operations
- **Articles:** Immutable after creation (append-only)
- **Feed Indexes:** Updated only by cron (single writer)
- **User Data:** Updated only by that user (isolated writes)
- **No conflicts:** Each entity has single writer or isolated per user

### Read Operations
- **Eventually consistent:** KV may have slight delays
- **Acceptable:** RSS readers tolerate eventual consistency
- **Caching:** Feed indexes cached in Worker for 60s

---

## Future Considerations

*The following optimizations are not currently implemented but may be added if scale requires:*

- Article TTL (auto-delete after N days)
- Feed index trimming (keep only recent N articles)
- Exception list cleanup (remove old manually-read markers)
- Multi-region replication strategies
- Read/write caching layers

**Note:** The current architecture is designed to scale to 10,000+ active users and billions of articles without these optimizations.
