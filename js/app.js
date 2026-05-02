/**
 * IMI - Xiaomi News Aggregator
 * Frontend Application
 */

(function () {
    'use strict';

    // --- Constants ---
    const DATA_URL = 'data/news.json';
    const PER_PAGE = 20;
    const CATEGORY_MAP = {
        auto: { label: '汽车', icon: '🚗' },
        phone: { label: '手机', icon: '📱' },
        iot: { label: 'IoT', icon: '📡' },
        software: { label: '软件', icon: '💻' },
        ai: { label: 'AI', icon: '🤖' },
        people: { label: '人物', icon: '👤' }
    };
    const CATEGORY_KEYWORDS = {
        auto: ['SU7', 'YU7', 'YU9', 'SU7 Ultra', '小米汽车', 'Xiaomi Auto', 'Xiaomi EV', 'Xiaomi Car', '电动车', '纽北', 'Nurburgring', 'EV', 'electric vehicle', '汽车', 'automotive', '充电', '充电桩'],
        phone: ['Xiaomi 16', 'Xiaomi 15', 'Xiaomi 14', 'Redmi', 'POCO', 'MIX', '小米手机', 'Xiaomi Phone', 'Xiaomi Pad', '小米平板', 'Smartphone', 'Phone'],
        iot: ['IoT', '智能家居', '小米手环', 'Band', 'Watch', '电视', 'TV', '路由器', 'Router', '空调', '净化器', '米家', 'Mi Home', 'Smart Home', '穿戴', 'Wear', '耳机', 'Earbuds'],
        software: ['HyperOS', 'MIUI', '澎湃OS', '系统更新', 'System Update', 'OTA', 'Android', '小米系统'],
        ai: ['MiMo', 'AI', '人工智能', '大模型', 'LLM', '机器学习', 'Machine Learning', '深度学习', 'Deep Learning', 'NLP', 'Transformer', 'GPT', '模型', 'Model', 'MiLM'],
        people: ['雷军', 'Lei Jun', '罗福莉', 'Luo Fuli', '林斌', '卢伟冰', '高管', 'CEO', 'CTO', 'VP']
    };

    // --- State ---
    let allNews = [];
    let filteredNews = [];
    let displayedCount = 0;
    let currentCategory = 'all';
    let currentSort = 'newest';
    let searchQuery = '';

    // --- DOM ---
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // --- Init ---
    async function init() {
        setupTheme();
        setupSearch();
        setupFilters();
        setupSort();
        setupNav();
        setupModal();
        await loadData();
    }

    // --- Theme ---
    function setupTheme() {
        const toggle = $('#themeToggle');
        const saved = localStorage.getItem('imi-theme');
        if (saved) {
            document.documentElement.setAttribute('data-theme', saved);
        } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.setAttribute('data-theme', 'dark');
        }

        toggle?.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('imi-theme', next);
        });
    }

    // --- Search ---
    function setupSearch() {
        const toggle = $('#searchToggle');
        const bar = $('#searchBar');
        const input = $('#searchInput');

        toggle?.addEventListener('click', () => {
            bar.classList.toggle('open');
            if (bar.classList.contains('open')) {
                input.focus();
            }
        });

        let debounceTimer;
        input?.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                searchQuery = e.target.value.trim().toLowerCase();
                applyFilters();
            }, 300);
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                bar.classList.remove('open');
                input.value = '';
                searchQuery = '';
                applyFilters();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                bar.classList.toggle('open');
                if (bar.classList.contains('open')) input.focus();
            }
        });
    }

    // --- Filters ---
    function setupFilters() {
        $$('.filter-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                $$('.filter-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                currentCategory = btn.dataset.category;
                applyFilters();
            });
        });
    }

    // --- Sort ---
    function setupSort() {
        $$('.sort-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                $$('.sort-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                currentSort = btn.dataset.sort;
                applyFilters();
            });
        });
    }

    // --- Nav ---
    function setupNav() {
        const links = $$('.nav-link');
        const sections = ['timeline', 'products', 'tech', 'about'];

        links.forEach((link) => {
            link.addEventListener('click', (e) => {
                links.forEach((l) => l.classList.remove('active'));
                link.classList.add('active');
            });
        });

        // Scroll spy
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const id = entry.target.id;
                        links.forEach((l) => {
                            l.classList.toggle('active', l.dataset.nav === id);
                        });
                    }
                });
            },
            { rootMargin: '-40% 0px -60% 0px' }
        );

        sections.forEach((id) => {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        });
    }

    // --- Modal ---
    function setupModal() {
        const modal = $('#imageModal');
        const modalImg = $('#modalImg');
        const close = $('#modalClose');

        document.addEventListener('click', (e) => {
            const img = e.target.closest('.timeline-card-image, .featured-card-img');
            if (img) {
                const src = img.querySelector('img')?.src;
                if (src) {
                    modalImg.src = src;
                    modal.classList.add('open');
                }
            }
        });

        close?.addEventListener('click', () => modal.classList.remove('open'));
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('open');
        });
    }

    // --- Data Loading ---
    async function loadData() {
        try {
            const resp = await fetch(DATA_URL + '?t=' + Date.now());
            if (!resp.ok) throw new Error('Failed to load data');
            allNews = await resp.json();

            // Auto-classify if no category set
            allNews.forEach((item) => {
                if (!item.category || !CATEGORY_MAP[item.category]) {
                    item.category = classifyItem(item);
                }
                item._date = new Date(item.date);
            });

            updateStats();
            applyFilters();
        } catch (err) {
            console.error('Failed to load news data:', err);
            showEmpty();
        }
    }

    // --- Auto Classification ---
    function classifyItem(item) {
        const text = [item.title, item.description, item.source].join(' ').toLowerCase();
        let bestCat = null;
        let bestScore = 0;

        for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
            let score = 0;
            for (const kw of keywords) {
                if (text.includes(kw.toLowerCase())) score++;
            }
            if (score > bestScore) {
                bestScore = score;
                bestCat = cat;
            }
        }

        return bestCat || 'phone';
    }

    // --- Stats ---
    function updateStats() {
        const total = allNews.length;
        const today = new Date().toDateString();
        const todayCount = allNews.filter((n) => new Date(n.date).toDateString() === today).length;

        animateCounter($('#statTotal'), total);
        animateCounter($('#statToday'), todayCount);
    }

    function animateCounter(el, target) {
        if (!el) return;
        const duration = 800;
        const start = performance.now();
        const initial = parseInt(el.textContent) || 0;

        function tick(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(initial + (target - initial) * eased);
            if (progress < 1) requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
    }

    // --- Apply Filters ---
    function applyFilters() {
        let items = [...allNews];

        // Category filter
        if (currentCategory !== 'all') {
            items = items.filter((n) => n.category === currentCategory);
        }

        // Search filter
        if (searchQuery) {
            items = items.filter((n) => {
                const text = [n.title, n.description, n.source, n.category].join(' ').toLowerCase();
                return text.includes(searchQuery);
            });
        }

        // Sort
        items.sort((a, b) => {
            const da = new Date(a.date).getTime();
            const db = new Date(b.date).getTime();
            return currentSort === 'newest' ? db - da : da - db;
        });

        filteredNews = items;
        displayedCount = 0;

        updateFilterCounts();
        renderFeatured();
        renderTimeline();
        renderLoadMore();
    }

    // --- Filter Counts ---
    function updateFilterCounts() {
        const counts = { all: allNews.length };
        for (const cat of Object.keys(CATEGORY_MAP)) {
            counts[cat] = allNews.filter((n) => n.category === cat).length;
        }

        $$('.filter-btn').forEach((btn) => {
            const cat = btn.dataset.category;
            const existing = btn.querySelector('.filter-count');
            if (existing) existing.remove();
            if (counts[cat] > 0) {
                const span = document.createElement('span');
                span.className = 'filter-count';
                span.textContent = counts[cat];
                btn.appendChild(span);
            }
        });
    }

    // --- Render Featured ---
    function renderFeatured() {
        const section = $('#featured');
        const grid = $('#featuredGrid');
        if (!section || !grid) return;

        // Pick featured items: most recent 3 from different categories
        const seen = new Set();
        const featured = [];
        for (const item of filteredNews) {
            if (featured.length >= 3) break;
            if (!seen.has(item.category)) {
                seen.add(item.category);
                featured.push(item);
            }
        }

        if (featured.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        grid.innerHTML = featured.map((item, i) => `
            <a href="${escHtml(item.link)}" target="_blank" rel="noopener" class="featured-card" style="animation-delay:${i * 0.1}s">
                ${item.image ? `<div class="featured-card-img"><img src="${escHtml(item.image)}" alt="${escHtml(item.title)}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>` : ''}
                <div class="featured-card-body">
                    <span class="featured-card-category cat-${item.category}">${CATEGORY_MAP[item.category]?.label || item.category}</span>
                    <h3 class="featured-card-title">${escHtml(item.title)}</h3>
                    <p class="featured-card-desc">${escHtml(item.description || '')}</p>
                    <div class="featured-card-meta">
                        <span>${escHtml(item.source || '')}</span>
                        <span>${formatDate(item.date)}</span>
                    </div>
                </div>
            </a>
        `).join('');
    }

    // --- Render Timeline ---
    function renderTimeline() {
        const container = $('#timelineContainer');
        const loading = $('#loading');
        const empty = $('#emptyState');

        if (!container) return;

        loading.style.display = 'none';

        if (filteredNews.length === 0) {
            container.innerHTML = '';
            empty.style.display = 'flex';
            return;
        }

        empty.style.display = 'none';
        container.innerHTML = '';
        displayedCount = 0;

        loadMoreItems();
    }

    function loadMoreItems() {
        const container = $('#timelineContainer');
        const batch = filteredNews.slice(displayedCount, displayedCount + PER_PAGE);

        // Group by date
        const grouped = {};
        batch.forEach((item) => {
            const dateKey = formatDateGroup(item.date);
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push(item);
        });

        // Check if last group in existing DOM matches first new group
        const existingGroups = container.querySelectorAll('.timeline-date');
        const lastExistingGroup = existingGroups.length > 0 ? existingGroups[existingGroups.length - 1] : null;
        const lastExistingDateKey = lastExistingGroup?.dataset?.date;
        const newGroupKeys = Object.keys(grouped);

        let html = '';
        for (const [dateKey, items] of Object.entries(grouped)) {
            if (dateKey === lastExistingDateKey) {
                // Append cards to existing group
                const parent = lastExistingGroup;
                items.forEach((item, i) => {
                    parent.insertAdjacentHTML('beforeend', renderTimelineCard(item, displayedCount + i));
                });
            } else {
                html += `<div class="timeline-date" data-date="${dateKey}"><h3>${dateKey}</h3>`;
                items.forEach((item, i) => {
                    html += renderTimelineCard(item, displayedCount + i);
                });
                html += `</div>`;
            }
        }

        if (html) container.insertAdjacentHTML('beforeend', html);
        displayedCount += batch.length;
        renderLoadMore();
    }

    function renderTimelineCard(item, index) {
        const cat = item.category || 'phone';
        const catInfo = CATEGORY_MAP[cat] || { label: cat, icon: '' };
        const delay = (index % PER_PAGE) * 0.05;

        return `
            <a href="${escHtml(item.link)}" target="_blank" rel="noopener" class="timeline-card border-${cat}" style="animation-delay:${delay}s">
                <div class="timeline-card-image">
                    ${item.image
                        ? `<img src="${escHtml(item.image)}" alt="${escHtml(item.title)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'img-placeholder\\'><svg width=\\'32\\' height=\\'32\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%23999\\' stroke-width=\\'1.5\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\'/><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'/><polyline points=\\'21 15 16 10 5 21\\'/></svg></div>'">`
                        : `<div class="img-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`
                    }
                </div>
                <div class="timeline-card-body">
                    <span class="timeline-card-category cat-${cat}">${catInfo.icon} ${catInfo.label}</span>
                    <h4 class="timeline-card-title">${escHtml(item.title)}</h4>
                    <p class="timeline-card-desc">${escHtml(item.description || '')}</p>
                    <div class="timeline-card-meta">
                        <span class="timeline-card-source">${escHtml(item.source || '')}</span>
                        <span>${formatDate(item.date)}</span>
                    </div>
                </div>
            </a>
        `;
    }

    function renderLoadMore() {
        const btn = $('#loadMore');
        if (!btn) return;
        btn.style.display = displayedCount < filteredNews.length ? 'block' : 'none';

        // Remove old listener and add new
        const loadMoreBtn = btn.querySelector('.btn-load-more');
        if (loadMoreBtn) {
            loadMoreBtn.onclick = loadMoreItems;
        }
    }

    function showEmpty() {
        const loading = $('#loading');
        const empty = $('#emptyState');
        if (loading) loading.style.display = 'none';
        if (empty) empty.style.display = 'flex';
    }

    // --- Utilities ---
    function formatDateGroup(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / 86400000);

        if (days === 0) return '今天';
        if (days === 1) return '昨天';
        if (days === 2) return '前天';
        if (days < 7) return `${days}天前`;

        return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function formatDate(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor(diff / 60000);

        if (minutes < 60) return `${minutes}分钟前`;
        if (hours < 24) return `${hours}小时前`;
        if (hours < 48) return '昨天';
        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }

    function escHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // --- Start ---
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
