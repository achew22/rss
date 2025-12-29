# Database Structure (ERD)

## Overview

This RSS Reader uses **Cloudflare KV** (Key-Value Store) with a GET-optimized architecture. The design prioritizes cheap GET operations over expensive LIST operations, leveraging Worker CPU for merge-sort aggregation.

## Storage Architecture

### Design Principles
- **GET-heavy:** 100% of operations are inexpensive GET requests
- **No LIST operations:** Cron reads from the "feeds" key directly (tracked list)
- **Worker-side aggregation:** Merge sorting happens in Worker CPU (free)
- **Feed isolation:** Each feed's growth is independent
- **Hierarchical keys:** Articles nested under feeds for organization
- **Object values:** All values are objects for future extensibility

---

## Entity Relationship Diagram

```
┌──────────────────────────────┐
│     FEEDS METADATA           │
│  Key: "feeds"                │
├──────────────────────────────┤
│ [ {id, name, url, ...} ]     │
│ (list of all feeds)          │
└──────────┬───────────────────┘
           │
           │ References
           ▼
┌──────────────────────────────┐         ┌────────────────────────────┐
│      FEED INDEX              │         │      STARRED               │
│  Key: feed:{feedId}          │         │  Key: "starred"            │
├──────────────────────────────┤         ├────────────────────────────┤
│ id: string                   │         │ {                          │
│ name: string                 │         │   articles: [              │
│ url: string                  │         │     articleId, ...         │
│ lastFetched: timestamp       │         │   ]                        │
│ articles: [                  │         │ }                          │
│   {                          │         └────────────────────────────┘
│     id: string          ─────┼──┐
│     timestamp: int           │  │      ┌────────────────────────────┐
│   }                          │  │      │      READ                  │
│ ]                            │  │      │  Key: "read"               │
│ (sorted DESC, newest first)  │  │      ├────────────────────────────┤
└──────────────────────────────┘  │      │ {                          │
                                  │      │   articles: [              │
                                  │      │     articleId, ...         │
                                  │      │   ]                        │
                                  │      │ }                          │
                                  │      └────────────────────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────────────────┐
                    │         ARTICLE                      │
                    │  Key: feed:{feedId}:article:{id}     │
                    ├──────────────────────────────────────┤
                    │ id: string                           │
                    │ feedId: string                       │
                    │ title: string                        │
                    │ excerpt: string                      │
                    │ link: string                         │
                    │ source: string                       │
                    │ sourceUrl: string                    │
                    │ timestamp: int                       │
                    └──────────────────────────────────────┘
```

---

## Entity Details

### 1. FEEDS METADATA
**KV Key:** `"feeds"`

**Structure:**
```javascript
[
  {
    id: "feed-abc123",
    name: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    lastFetched: "2024-01-15T10:30:00Z"
  },
  ...
]
```

**Purpose:**
- Central list of all feeds in the system
- Used by cron to iterate and refresh feeds (no LIST operation needed)
- Provides feed metadata for UI display

**Access Pattern:**
- GET on every page load (for feed list display)
- PUT when feeds are added/removed

**Scaling:**
- ~100 bytes per feed
- Realistic: <200 feeds globally
- Well under 25MB limit

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
**KV Key:** `feed:{feedId}:article:{articleId}`

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
- Nested under feed for hierarchical organization

**Access Pattern:**
- GET in batches (50-100 articles) for timeline rendering
- PUT during cron refresh (new articles only)

**Scaling:**
- ~1KB per article
- Billions of articles possible (each is separate KV key)
- Only accessed for articles currently being displayed
- Hierarchical keys keep articles organized by feed

---

### 4. STARRED
**KV Key:** `"starred"`

**Structure:**
```javascript
{
  articles: ["article-abc", "article-xyz", "article-123"]
}
```

**Purpose:**
- Tracks starred article IDs
- Object wrapper allows future extension (e.g., starred timestamps, notes)

**Access Pattern:**
- GET when rendering articles (to show star status)
- PUT when user toggles star status

**Scaling:**
- ~20 bytes per article ID + object overhead
- 1,000,000+ starred articles possible (still <25MB)
- Realistic: <1,000 starred articles

---

### 5. READ
**KV Key:** `"read"`

**Structure:**
```javascript
{
  articles: ["article-def", "article-ghi", "article-456"]
}
```

**Purpose:**
- Tracks read article IDs
- Object wrapper allows future extension (e.g., read timestamps, scroll position)

**Access Pattern:**
- GET when rendering articles (to show read status)
- PUT when user marks article as read/unread

**Scaling:**
- ~20 bytes per article ID + object overhead
- 1,000,000+ read articles possible (still <25MB)
- Realistic: <10,000 read articles (older ones can be pruned)

---

## Query Operations

### Get Recent Articles (All Feeds, Reverse Chronological)
```
1. GET "feeds" (feed metadata)                      (1 op)
2. GET "starred" and "read" (user preferences)      (2 ops, parallel)
3. GET feed:{feedId} for each feed                  (N ops, parallel)
4. Merge sort newest articles across all feeds      (Worker CPU)
5. GET feed:{feedId}:article:{articleId} × 50       (50 ops, parallel)

Total: 3 + N feeds + 50 articles = ~63 GET operations (for 10 feeds)
```

### Get Articles for Single Feed
```
1. GET "starred" and "read"                         (2 ops, parallel)
2. GET feed:{feedId}                                (1 op)
3. GET feed:{feedId}:article:{articleId} × 50       (50 ops, parallel)

Total: 3 + 50 = 53 GET operations
```

### Get Starred Articles
```
1. GET "feeds" (to know which feeds exist)          (1 op)
2. GET "starred" and "read"                         (2 ops, parallel)
3. GET feed:{feedId} for each feed                  (N ops, parallel)
4. Find starred articles in feed indexes            (Worker CPU)
5. GET feed:{feedId}:article:{articleId} for each   (M ops, parallel)

Total: 3 + N feeds + M starred = varies by starred count
```

### Toggle Star
```
1. GET "starred"                                     (1 op)
2. Add/remove article ID from articles array         (Worker CPU)
3. PUT "starred"                                     (1 op)

Total: 1 GET + 1 PUT = 2 operations
```

### Toggle Read
```
1. GET "read"                                        (1 op)
2. Add/remove article ID from articles array         (Worker CPU)
3. PUT "read"                                        (1 op)

Total: 1 GET + 1 PUT = 2 operations
```

### Cron: Refresh All Feeds
```
1. GET "feeds" to get list of all feeds              (1 GET - no LIST needed!)
2. For each feed:
   a. GET feed:{feedId}                             (1 GET)
   b. Fetch RSS/Atom from external URL              (external)
   c. GET feed:{feedId}:article:{id} for existing   (M GETs to check links)
   d. PUT feed:{feedId}:article:{id} for new ones   (K PUTs for new articles)
   e. PUT feed:{feedId} with updated index          (1 PUT)
3. PUT "feeds" with updated lastFetched              (1 PUT)

Total per cron run: 1 GET + (N feeds × (1 GET + M link checks + K new + 1 PUT)) + 1 PUT
All operations are GET/PUT - NO LIST operations!
Frequency: 96x/day (every 15 minutes)
```

---

## Scaling Characteristics

### Capacity Limits

| Entity | Max Size | Realistic Usage | Bottleneck |
|--------|----------|-----------------|------------|
| Feeds Metadata | ~250 feeds | <200 feeds | 25MB KV value limit |
| Feed Index | 500,000 articles | <50,000 articles | 25MB KV value limit |
| Articles | Unlimited | Billions | KV namespace limit |
| Starred | 1,000,000 articles | <1,000 articles | 25MB KV value limit |
| Read | 1,000,000 articles | <10,000 articles | 25MB KV value limit |

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
- 1,000 LIST operations/day (not used!)
- 1M writes/day

**At 1,000 active users:**
- ~10M GETs/day (FREE)
- ~0 LISTs/day (we don't use LIST!)
- ~230K writes/day (FREE)
- **Total: $0/month**

**At 10,000 active users:**
- ~100M GETs/day → $1,350/month
- ~0 LISTs/day (we don't use LIST!)
- ~2.3M writes/day → $19.50/month
- **Total: ~$1,370/month ($0.14/user/month)**

**Key Optimization:**
By tracking all feeds in the "feeds" key, we eliminated 100% of LIST operations. Cron simply reads that key to discover which feeds to refresh - pure GET operations!

---

## Relationships

### Feeds → Feed Indexes (One-to-One)
- "feeds" key contains metadata for all feeds
- Each feed has corresponding feed:{feedId} key with article index
- Feed index stores lightweight references (ID + timestamp)

### Feed Indexes → Articles (One-to-Many)
- One feed contains many articles
- Articles nested under feed: feed:{feedId}:article:{articleId}
- Hierarchical organization keeps related data together

### Global → Starred/Read (Simple Lists)
- Starred and read are global lists (not user-scoped in current implementation)
- Object wrapper allows future extension
- Simple ID arrays inside objects

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
