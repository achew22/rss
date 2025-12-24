/**
 * RSS Reader SPA
 * A simple single-page application for reading RSS feeds
 */

// Application State
const state = {
    feeds: [],
    articles: [],
    starredArticles: new Set(),
    currentFeed: 'all',
    currentRoute: '/'
};

// Sample data for demonstration
const sampleArticles = [
    {
        id: 1,
        title: 'Getting Started with RSS Feeds',
        excerpt: 'RSS (Really Simple Syndication) is a web feed that allows users and applications to access updates to websites in a standardized, computer-readable format. Learn how to make the most of RSS feeds to stay updated with your favorite content.',
        source: 'RSS Guide',
        sourceUrl: 'https://example.com',
        date: new Date().toISOString(),
        read: false
    },
    {
        id: 2,
        title: 'The Future of Content Consumption',
        excerpt: 'As social media algorithms become more opaque, many users are returning to RSS as a way to curate their own content feed. Discover why RSS is making a comeback and how it can help you take control of your information diet.',
        source: 'Tech Insights',
        sourceUrl: 'https://example.com',
        date: new Date(Date.now() - 3600000).toISOString(),
        read: false
    },
    {
        id: 3,
        title: 'Building a Modern RSS Reader',
        excerpt: 'In this tutorial, we will walk through the process of building a modern RSS reader using web technologies. From parsing feeds to displaying articles, you will learn everything you need to create your own reader.',
        source: 'Dev Blog',
        sourceUrl: 'https://example.com',
        date: new Date(Date.now() - 7200000).toISOString(),
        read: true
    },
    {
        id: 4,
        title: 'Top 10 RSS Feeds for Developers',
        excerpt: 'Stay up to date with the latest in software development by following these essential RSS feeds. From JavaScript to DevOps, these feeds cover everything a modern developer needs to know.',
        source: 'Code Weekly',
        sourceUrl: 'https://example.com',
        date: new Date(Date.now() - 86400000).toISOString(),
        read: false
    }
];

const sampleFeeds = [
    { id: 1, name: 'Tech News', url: 'https://example.com/tech/feed.xml', count: 12 },
    { id: 2, name: 'Dev Blog', url: 'https://example.com/dev/feed.xml', count: 8 },
    { id: 3, name: 'Design Weekly', url: 'https://example.com/design/feed.xml', count: 5 }
];

// Initialize state with sample data
state.articles = sampleArticles;
state.feeds = sampleFeeds;

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
    starredCount: document.getElementById('starredCount')
};

// Router
const routes = {
    '/': renderHome,
    '/feeds': renderFeeds,
    '/settings': renderSettings
};

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

// Renderers
function renderHome() {
    const articles = getFilteredArticles();
    const feedName = getFeedName(state.currentFeed);

    elements.content.innerHTML = `
        <div class="articles-header">
            <div>
                <h2>${feedName}</h2>
                <p class="articles-meta">${articles.length} article${articles.length !== 1 ? 's' : ''}</p>
            </div>
        </div>
        <div class="articles-grid">
            ${articles.length > 0 ? articles.map(renderArticleCard).join('') : renderEmptyState()}
        </div>
    `;

    // Add event listeners for article actions
    elements.content.querySelectorAll('.article-action-star').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleStar(parseInt(btn.dataset.id));
        });
    });
}

function renderArticleCard(article) {
    const isStarred = state.starredArticles.has(article.id);
    const timeAgo = formatTimeAgo(new Date(article.date));

    return `
        <article class="article-card" data-id="${article.id}">
            <div class="article-card-header">
                <h3 class="article-title">${escapeHtml(article.title)}</h3>
                <div class="article-actions">
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
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="removeFeed(${feed.id})">Remove</button>
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
                <h3>Refresh</h3>
            </div>
            <div class="settings-item">
                <div>
                    <div class="settings-label">Auto-refresh interval</div>
                    <div class="settings-description">How often to check for new articles</div>
                </div>
                <select class="btn btn-secondary btn-sm">
                    <option>15 minutes</option>
                    <option>30 minutes</option>
                    <option>1 hour</option>
                    <option>Manual only</option>
                </select>
            </div>
        </div>
        <div class="settings-section">
            <div class="settings-section-header">
                <h3>Data</h3>
            </div>
            <div class="settings-item">
                <div>
                    <div class="settings-label">Export feeds</div>
                    <div class="settings-description">Download your feed list as OPML</div>
                </div>
                <button class="btn btn-secondary btn-sm">Export</button>
            </div>
            <div class="settings-item">
                <div>
                    <div class="settings-label">Import feeds</div>
                    <div class="settings-description">Import feeds from an OPML file</div>
                </div>
                <button class="btn btn-secondary btn-sm">Import</button>
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

// Helper Functions
function getFilteredArticles() {
    if (state.currentFeed === 'all') {
        return state.articles;
    } else if (state.currentFeed === 'starred') {
        return state.articles.filter(a => state.starredArticles.has(a.id));
    } else {
        return state.articles.filter(a => a.feedId === state.currentFeed);
    }
}

function getFeedName(feedId) {
    if (feedId === 'all') return 'All Articles';
    if (feedId === 'starred') return 'Starred';
    const feed = state.feeds.find(f => f.id === feedId);
    return feed ? feed.name : 'Unknown Feed';
}

function toggleStar(articleId) {
    if (state.starredArticles.has(articleId)) {
        state.starredArticles.delete(articleId);
    } else {
        state.starredArticles.add(articleId);
    }
    updateCounts();
    renderHome();
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
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Feed Management
function renderUserFeeds() {
    elements.userFeeds.innerHTML = state.feeds.map(feed => `
        <li class="feed-item" data-feed="${feed.id}">
            <span class="feed-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20C5 20 4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1Z"/>
                </svg>
            </span>
            <span class="feed-name">${escapeHtml(feed.name)}</span>
            <span class="feed-count">${feed.count}</span>
        </li>
    `).join('');

    // Add click handlers
    elements.userFeeds.querySelectorAll('.feed-item').forEach(item => {
        item.addEventListener('click', () => selectFeed(parseInt(item.dataset.feed)));
    });
}

function selectFeed(feedId) {
    state.currentFeed = feedId;

    // Update active states
    document.querySelectorAll('.feed-item').forEach(item => {
        item.classList.toggle('active', item.dataset.feed == feedId);
    });

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
}

function addFeed(url, name) {
    const newFeed = {
        id: Date.now(),
        name: name || new URL(url).hostname,
        url: url,
        count: 0
    };

    state.feeds.push(newFeed);
    renderUserFeeds();
    closeAddFeedModal();

    // Navigate to feeds page to show the new feed
    if (state.currentRoute === '/feeds') {
        renderFeeds();
    }
}

function removeFeed(feedId) {
    state.feeds = state.feeds.filter(f => f.id !== feedId);
    renderUserFeeds();
    renderFeeds();
}

// Make functions globally available
window.openAddFeedModal = openAddFeedModal;
window.navigate = navigate;
window.removeFeed = removeFeed;

// Event Listeners
function initEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navigate(link.dataset.route);
        });
    });

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

// Initialize App
function init() {
    initEventListeners();
    renderUserFeeds();
    updateCounts();
    handleHashChange();
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
