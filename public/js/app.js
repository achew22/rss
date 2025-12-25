/**
 * RSS Reader SPA
 * A single-page application for reading RSS feeds
 * Connects to Cloudflare Workers backend API
 */

// API base URL - empty string for same-origin requests
const API_BASE = '';

// Application State
const state = {
    feeds: [],
    articles: [],
    starredArticles: new Set(),
    readArticles: new Set(),
    currentFeed: 'all',
    currentRoute: '/',
    loading: false,
    error: null,
    hideReadArticles: true // Default: hide read articles
};

// DOM Elements
const elements = {
    content: document.getElementById('content'),
    feedList: document.getElementById('feedList'),
    userFeeds: document.getElementById('userFeeds'),
    addFeedBtn: document.getElementById('addFeedBtn'),
    addFeedModal: document.getElementById('addFeedModal'),
    addFeedForm: document.getElementById('addFeedForm'),
    closeModal: document.getElementById('closeModal'),
    cancelAddFeed: document.getElementById('cancelAddFeed'),
    allCount: document.getElementById('allCount'),
    starredCount: document.getElementById('starredCount'),
    hamburgerBtn: document.getElementById('hamburgerBtn'),
    sidebar: document.getElementById('sidebar'),
    sidebarOverlay: document.getElementById('sidebarOverlay'),
    sidebarCloseBtn: document.getElementById('sidebarCloseBtn')
};

// Router
const routes = {
    '/': renderHome,
    '/feeds': renderFeeds,
    '/settings': renderSettings
};

// ============================================================================
// API Functions
// ============================================================================

async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || data.message || 'API request failed');
    }

    return data;
}

async function fetchFeeds() {
    try {
        const data = await apiRequest('/api/feeds');
        state.feeds = data.feeds || [];
        return state.feeds;
    } catch (error) {
        console.error('Failed to fetch feeds:', error);
        state.feeds = [];
        throw error;
    }
}

async function fetchArticles(feedId = null, starredOnly = false) {
    try {
        let endpoint = '/api/articles';
        const params = new URLSearchParams();

        if (feedId && feedId !== 'all' && feedId !== 'starred') {
            params.set('feedId', feedId);
        }
        if (starredOnly) {
            params.set('starred', 'true');
        }

        if (params.toString()) {
            endpoint += `?${params.toString()}`;
        }

        const data = await apiRequest(endpoint);
        state.articles = data.articles || [];

        // Update starred and read articles sets from API response
        state.starredArticles = new Set(
            state.articles.filter(a => a.starred).map(a => a.id)
        );
        state.readArticles = new Set(
            state.articles.filter(a => a.read).map(a => a.id)
        );

        return state.articles;
    } catch (error) {
        console.error('Failed to fetch articles:', error);
        state.articles = [];
        throw error;
    }
}

async function addFeedApi(url, name) {
    const data = await apiRequest('/api/feeds', {
        method: 'POST',
        body: JSON.stringify({ url, name })
    });
    return data;
}

async function removeFeedApi(feedId) {
    await apiRequest(`/api/feeds/${feedId}`, {
        method: 'DELETE'
    });
}

async function toggleStarApi(articleId) {
    const data = await apiRequest(`/api/articles/${articleId}/star`, {
        method: 'POST'
    });
    return data;
}

async function refreshFeedApi(feedId) {
    const data = await apiRequest(`/api/feeds/${feedId}/refresh`, {
        method: 'POST'
    });
    return data;
}

async function refreshAllFeedsApi() {
    const data = await apiRequest('/api/refresh', {
        method: 'POST'
    });
    return data;
}

async function toggleReadApi(articleId) {
    const data = await apiRequest(`/api/articles/${articleId}/read`, {
        method: 'POST'
    });
    return data;
}

// ============================================================================
// Navigation
// ============================================================================

function navigate(path) {
    state.currentRoute = path;
    window.location.hash = path;

    // Update nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.route === path);
    });

    // Render the route
    const renderer = routes[path] || renderNotFound;
    renderer();
}

function handleHashChange() {
    const path = window.location.hash.slice(1) || '/';
    navigate(path);
}

// ============================================================================
// Renderers
// ============================================================================

function renderHome() {
    const articles = getFilteredArticles();
    const feedName = getFeedName(state.currentFeed);

    elements.content.innerHTML = `
        <div class="articles-header">
            <div>
                <h2>${feedName}</h2>
                <p class="articles-meta">${articles.length} article${articles.length !== 1 ? 's' : ''}</p>
            </div>
            <div class="articles-header-actions">
                <label class="filter-toggle">
                    <input type="checkbox" id="hideReadToggle" ${state.hideReadArticles ? 'checked' : ''} onchange="toggleHideRead()">
                    <span>Hide read articles</span>
                </label>
                <button class="btn btn-secondary btn-sm" onclick="refreshAllFeeds()" title="Refresh all feeds">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                    </svg>
                    Refresh
                </button>
            </div>
        </div>
        ${state.loading ? renderLoading() : ''}
        ${state.error ? renderError(state.error) : ''}
        <div class="articles-grid">
            ${articles.length > 0 ? articles.map(renderArticleCard).join('') : renderEmptyState()}
        </div>
    `;

    // Add event listeners for article actions
    elements.content.querySelectorAll('.article-action-star').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleStar(btn.dataset.id);
        });
    });

    elements.content.querySelectorAll('.article-action-read').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleRead(btn.dataset.id);
        });
    });

    // Add click handler for article cards to open the link
    elements.content.querySelectorAll('.article-card').forEach(card => {
        card.addEventListener('click', () => {
            const link = card.dataset.link;
            if (link) {
                window.open(link, '_blank');
            }
        });
    });

    // Setup intersection observer for scroll-based read marking
    setupScrollObserver();
}

function renderArticleCard(article) {
    const isStarred = state.starredArticles.has(article.id);
    const isRead = state.readArticles.has(article.id);
    const timeAgo = formatTimeAgo(new Date(article.date));

    return `
        <article class="article-card ${isRead ? 'read' : 'unread'}" data-id="${article.id}" data-link="${escapeHtml(article.link || '')}">
            <div class="article-card-header">
                <h3 class="article-title">${escapeHtml(article.title)}</h3>
                <div class="article-actions">
                    <button class="article-action article-action-read ${isRead ? 'read' : ''}" data-id="${article.id}" title="${isRead ? 'Mark as unread' : 'Mark as read'}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                            ${isRead
                                ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><line x1="1" y1="1" x2="23" y2="23"/>'
                                : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'}
                        </svg>
                    </button>
                    <button class="article-action article-action-star ${isStarred ? 'starred' : ''}" data-id="${article.id}" title="${isStarred ? 'Unstar' : 'Star'}">
                        <svg viewBox="0 0 24 24" fill="${isStarred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" width="18" height="18">
                            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                        </svg>
                    </button>
                </div>
            </div>
            <p class="article-excerpt">${escapeHtml(article.excerpt)}</p>
            <div class="article-meta">
                <span class="article-source">
                    <span class="article-source-icon"></span>
                    ${escapeHtml(article.source)}
                </span>
                <span>${timeAgo}</span>
            </div>
        </article>
    `;
}

function renderLoading() {
    return `
        <div class="loading-indicator">
            <div class="loading-spinner"></div>
            <span>Loading...</span>
        </div>
    `;
}

function renderError(message) {
    return `
        <div class="error-message">
            <strong>Error:</strong> ${escapeHtml(message)}
        </div>
    `;
}

function renderEmptyState() {
    return `
        <div class="empty-state">
            <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20C5 20 4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1Z"/>
            </svg>
            <h3>No articles yet</h3>
            <p>Add some RSS feeds to start reading articles.</p>
            <button class="btn btn-primary" onclick="openAddFeedModal()">
                Add Your First Feed
            </button>
        </div>
    `;
}

function renderFeeds() {
    elements.content.innerHTML = `
        <div class="page-header">
            <h2 class="page-title">Manage Feeds</h2>
            <p class="page-description">Add, edit, or remove your RSS feed subscriptions.</p>
        </div>
        <div class="settings-section">
            <div class="settings-section-header">
                <h3>Your Subscriptions</h3>
            </div>
            ${state.feeds.map(feed => `
                <div class="settings-item">
                    <div>
                        <div class="settings-label">${escapeHtml(feed.name)}</div>
                        <div class="settings-description">${escapeHtml(feed.url)}</div>
                        <div class="settings-meta">${feed.count || 0} articles</div>
                    </div>
                    <div class="settings-actions">
                        <button class="btn btn-secondary btn-sm" onclick="refreshFeed('${feed.id}')" title="Refresh feed">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                            </svg>
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="removeFeed('${feed.id}')">Remove</button>
                    </div>
                </div>
            `).join('')}
            ${state.feeds.length === 0 ? `
                <div class="settings-item">
                    <div class="settings-description">No feeds added yet. Click "Add Feed" to get started.</div>
                </div>
            ` : ''}
        </div>
        <button class="btn btn-primary" onclick="openAddFeedModal()">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
            Add New Feed
        </button>
    `;
}

function renderSettings() {
    elements.content.innerHTML = `
        <div class="page-header">
            <h2 class="page-title">Settings</h2>
            <p class="page-description">Customize your RSS Reader experience.</p>
        </div>
        <div class="settings-section">
            <div class="settings-section-header">
                <h3>Display</h3>
            </div>
            <div class="settings-item">
                <div>
                    <div class="settings-label">Theme</div>
                    <div class="settings-description">Choose your preferred color scheme</div>
                </div>
                <select class="btn btn-secondary btn-sm">
                    <option>Light</option>
                    <option>Dark</option>
                    <option>System</option>
                </select>
            </div>
            <div class="settings-item">
                <div>
                    <div class="settings-label">Articles per page</div>
                    <div class="settings-description">Number of articles to display at once</div>
                </div>
                <select class="btn btn-secondary btn-sm">
                    <option>10</option>
                    <option>25</option>
                    <option>50</option>
                </select>
            </div>
        </div>
        <div class="settings-section">
            <div class="settings-section-header">
                <h3>Data</h3>
            </div>
            <div class="settings-item">
                <div>
                    <div class="settings-label">Refresh all feeds</div>
                    <div class="settings-description">Fetch latest articles from all subscribed feeds</div>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="refreshAllFeeds()">Refresh Now</button>
            </div>
        </div>
    `;
}

function renderNotFound() {
    elements.content.innerHTML = `
        <div class="empty-state">
            <h3>Page Not Found</h3>
            <p>The page you're looking for doesn't exist.</p>
            <button class="btn btn-primary" onclick="navigate('/')">
                Go Home
            </button>
        </div>
    `;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getFilteredArticles() {
    let filtered = state.articles;

    // Filter by feed
    if (state.currentFeed === 'starred') {
        filtered = filtered.filter(a => state.starredArticles.has(a.id));
    } else if (state.currentFeed !== 'all') {
        filtered = filtered.filter(a => a.feedId === state.currentFeed);
    }

    // Filter by read status if enabled
    if (state.hideReadArticles) {
        filtered = filtered.filter(a => !state.readArticles.has(a.id));
    }

    return filtered;
}

function getFeedName(feedId) {
    if (feedId === 'all') return 'All Articles';
    if (feedId === 'starred') return 'Starred';
    const feed = state.feeds.find(f => f.id === feedId);
    return feed ? feed.name : 'Unknown Feed';
}

async function toggleStar(articleId) {
    try {
        const result = await toggleStarApi(articleId);

        if (result.starred) {
            state.starredArticles.add(articleId);
        } else {
            state.starredArticles.delete(articleId);
        }

        updateCounts();
        renderHome();
    } catch (error) {
        console.error('Failed to toggle star:', error);
        showNotification('Failed to update star status', 'error');
    }
}

async function toggleRead(articleId) {
    try {
        const result = await toggleReadApi(articleId);

        if (result.read) {
            state.readArticles.add(articleId);
        } else {
            state.readArticles.delete(articleId);
        }

        renderHome();
    } catch (error) {
        console.error('Failed to toggle read:', error);
        showNotification('Failed to update read status', 'error');
    }
}

function toggleHideRead() {
    state.hideReadArticles = !state.hideReadArticles;
    renderHome();
}

// Intersection Observer for scroll-based read marking
let scrollObserver = null;

function setupScrollObserver() {
    // Disconnect existing observer
    if (scrollObserver) {
        scrollObserver.disconnect();
    }

    // Create new observer
    scrollObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach(async (entry) => {
                // Mark as read when article is at least 50% visible for 1 second
                if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                    const articleId = entry.target.dataset.id;
                    const isAlreadyRead = state.readArticles.has(articleId);

                    if (!isAlreadyRead) {
                        // Add a small delay to ensure user is actually reading
                        entry.target.dataset.readTimeout = setTimeout(async () => {
                            try {
                                const result = await toggleReadApi(articleId);
                                if (result.read) {
                                    state.readArticles.add(articleId);
                                    // Update the article card visually without full re-render
                                    entry.target.classList.add('read');
                                    entry.target.classList.remove('unread');

                                    // Update read button
                                    const readBtn = entry.target.querySelector('.article-action-read');
                                    if (readBtn) {
                                        readBtn.classList.add('read');
                                        readBtn.title = 'Mark as unread';
                                        readBtn.querySelector('svg').innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><line x1="1" y1="1" x2="23" y2="23"/>';
                                    }
                                }
                            } catch (error) {
                                console.error('Failed to auto-mark as read:', error);
                            }
                        }, 1000);
                    }
                } else {
                    // Clear timeout if article scrolls out of view
                    const timeout = entry.target.dataset.readTimeout;
                    if (timeout) {
                        clearTimeout(timeout);
                        delete entry.target.dataset.readTimeout;
                    }
                }
            });
        },
        {
            threshold: [0, 0.5, 1.0], // Trigger at 0%, 50%, and 100% visibility
            rootMargin: '0px'
        }
    );

    // Observe all unread article cards
    elements.content.querySelectorAll('.article-card.unread').forEach(card => {
        scrollObserver.observe(card);
    });
}

function updateCounts() {
    elements.allCount.textContent = state.articles.length;
    elements.starredCount.textContent = state.starredArticles.size;
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    const intervals = [
        { label: 'year', seconds: 31536000 },
        { label: 'month', seconds: 2592000 },
        { label: 'week', seconds: 604800 },
        { label: 'day', seconds: 86400 },
        { label: 'hour', seconds: 3600 },
        { label: 'minute', seconds: 60 }
    ];

    for (const interval of intervals) {
        const count = Math.floor(seconds / interval.seconds);
        if (count >= 1) {
            return `${count} ${interval.label}${count !== 1 ? 's' : ''} ago`;
        }
    }

    return 'Just now';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    // Simple notification - could be enhanced with a proper toast library
    console.log(`[${type.toUpperCase()}] ${message}`);

    // Create a simple toast notification
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 24px;
        background: ${type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#007bff'};
        color: white;
        border-radius: 8px;
        z-index: 10000;
        animation: fadeIn 0.3s ease;
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================================================
// Feed Management
// ============================================================================

function renderUserFeeds() {
    elements.userFeeds.innerHTML = state.feeds.map(feed => `
        <li class="feed-item" data-feed="${feed.id}">
            <span class="feed-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20C5 20 4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1Z"/>
                </svg>
            </span>
            <span class="feed-name">${escapeHtml(feed.name)}</span>
            <span class="feed-count">${feed.count || 0}</span>
        </li>
    `).join('');

    // Add click handlers
    elements.userFeeds.querySelectorAll('.feed-item').forEach(item => {
        item.addEventListener('click', () => selectFeed(item.dataset.feed));
    });
}

async function selectFeed(feedId) {
    state.currentFeed = feedId;

    // Update active states
    document.querySelectorAll('.feed-item').forEach(item => {
        item.classList.toggle('active', item.dataset.feed == feedId);
    });

    // Close sidebar on mobile when a feed is selected
    closeSidebar();

    // Fetch articles for the selected feed
    try {
        if (feedId === 'starred') {
            await fetchArticles(null, true);
        } else if (feedId === 'all') {
            await fetchArticles();
        } else {
            await fetchArticles(feedId);
        }
    } catch (error) {
        console.error('Failed to fetch articles for feed:', error);
    }

    renderHome();
}

// Modal
function openAddFeedModal() {
    elements.addFeedModal.classList.add('active');
    document.getElementById('feedUrl').focus();
}

function closeAddFeedModal() {
    elements.addFeedModal.classList.remove('active');
    elements.addFeedForm.reset();
    // Remove any loading state
    const submitBtn = elements.addFeedForm.querySelector('button[type="submit"]');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Feed';
}

async function addFeed(url, name) {
    const submitBtn = elements.addFeedForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding...';

    try {
        const result = await addFeedApi(url, name);

        // Use the articles returned directly from the API response
        // This ensures articles display immediately even if KV has consistency delays
        if (result.articles && result.articles.length > 0) {
            // Merge new articles with existing ones
            const existingIds = new Set(state.articles.map(a => a.id));
            const newArticles = result.articles.filter(a => !existingIds.has(a.id));
            state.articles = [...state.articles, ...newArticles];
        }

        // Add the new feed to state
        if (result.feed) {
            const existingFeedIds = new Set(state.feeds.map(f => f.id));
            if (!existingFeedIds.has(result.feed.id)) {
                state.feeds.push(result.feed);
            }
        }

        // Also refresh from server to ensure we have the latest data
        // (this will update counts and catch any articles we might have missed)
        try {
            await Promise.all([fetchFeeds(), fetchArticles()]);
        } catch (refreshError) {
            // If refresh fails, we still have the data from the API response
            console.warn('Failed to refresh data from server:', refreshError);
        }

        renderUserFeeds();
        updateCounts();
        closeAddFeedModal();

        showNotification(`Added "${result.feed.name}" with ${result.articlesAdded} articles`, 'success');

        // Navigate to feeds page to show the new feed
        if (state.currentRoute === '/feeds') {
            renderFeeds();
        } else {
            renderHome();
        }
    } catch (error) {
        console.error('Failed to add feed:', error);
        showNotification(error.message || 'Failed to add feed', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Feed';
    }
}

async function removeFeed(feedId) {
    if (!confirm('Are you sure you want to remove this feed? All articles from this feed will be deleted.')) {
        return;
    }

    try {
        await removeFeedApi(feedId);

        // Refresh data
        await Promise.all([fetchFeeds(), fetchArticles()]);

        renderUserFeeds();
        updateCounts();
        renderFeeds();

        showNotification('Feed removed successfully', 'success');
    } catch (error) {
        console.error('Failed to remove feed:', error);
        showNotification(error.message || 'Failed to remove feed', 'error');
    }
}

async function refreshFeed(feedId) {
    showNotification('Refreshing feed...', 'info');

    try {
        const result = await refreshFeedApi(feedId);

        // Refresh data
        await Promise.all([fetchFeeds(), fetchArticles()]);

        renderUserFeeds();
        updateCounts();

        if (state.currentRoute === '/feeds') {
            renderFeeds();
        } else {
            renderHome();
        }

        showNotification(`Found ${result.newArticles} new articles`, 'success');
    } catch (error) {
        console.error('Failed to refresh feed:', error);
        showNotification(error.message || 'Failed to refresh feed', 'error');
    }
}

async function refreshAllFeeds() {
    showNotification('Refreshing all feeds...', 'info');

    try {
        const result = await refreshAllFeedsApi();

        // Refresh data
        await Promise.all([fetchFeeds(), fetchArticles()]);

        renderUserFeeds();
        updateCounts();
        renderHome();

        const totalNew = result.results.reduce((sum, r) => sum + (r.newArticles || 0), 0);
        const errors = result.results.filter(r => r.error).length;

        if (errors > 0) {
            showNotification(`Found ${totalNew} new articles (${errors} feeds failed)`, 'error');
        } else {
            showNotification(`Found ${totalNew} new articles`, 'success');
        }
    } catch (error) {
        console.error('Failed to refresh feeds:', error);
        showNotification(error.message || 'Failed to refresh feeds', 'error');
    }
}

// ============================================================================
// Mobile Navigation
// ============================================================================

function toggleSidebar() {
    const isOpen = elements.sidebar.classList.contains('open');

    if (isOpen) {
        closeSidebar();
    } else {
        openSidebar();
    }
}

function openSidebar() {
    elements.sidebar.classList.add('open');
    elements.sidebarOverlay.classList.add('active');
    // Prevent body scroll when sidebar is open on mobile
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    elements.sidebar.classList.remove('open');
    elements.sidebarOverlay.classList.remove('active');
    // Re-enable body scroll
    document.body.style.overflow = '';
}

// Make functions globally available
window.openAddFeedModal = openAddFeedModal;
window.navigate = navigate;
window.removeFeed = removeFeed;
window.refreshFeed = refreshFeed;
window.refreshAllFeeds = refreshAllFeeds;
window.toggleHideRead = toggleHideRead;

// ============================================================================
// Event Listeners
// ============================================================================

function initEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navigate(link.dataset.route);
        });
    });

    // Mobile navigation
    elements.hamburgerBtn.addEventListener('click', toggleSidebar);
    elements.sidebarCloseBtn.addEventListener('click', closeSidebar);
    elements.sidebarOverlay.addEventListener('click', closeSidebar);

    // Feed selection in sidebar
    elements.feedList.querySelectorAll('.feed-item').forEach(item => {
        item.addEventListener('click', () => selectFeed(item.dataset.feed));
    });

    // Add feed modal
    elements.addFeedBtn.addEventListener('click', openAddFeedModal);
    elements.closeModal.addEventListener('click', closeAddFeedModal);
    elements.cancelAddFeed.addEventListener('click', closeAddFeedModal);

    // Close modal on backdrop click
    elements.addFeedModal.querySelector('.modal-backdrop').addEventListener('click', closeAddFeedModal);

    // Add feed form
    elements.addFeedForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const url = document.getElementById('feedUrl').value;
        const name = document.getElementById('feedName').value;
        addFeed(url, name);
    });

    // Hash change for routing
    window.addEventListener('hashchange', handleHashChange);
}

// ============================================================================
// Initialize App
// ============================================================================

async function init() {
    initEventListeners();

    // Load initial data from API
    state.loading = true;

    try {
        await Promise.all([fetchFeeds(), fetchArticles()]);
        state.error = null;
    } catch (error) {
        console.error('Failed to load initial data:', error);
        state.error = 'Failed to load data. Please try again later.';
    }

    state.loading = false;

    renderUserFeeds();
    updateCounts();
    handleHashChange();
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
