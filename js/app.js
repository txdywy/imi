/**
 * IMI - Xiaomi News Aggregator
 * v2 — Polished with expert review feedback
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

    // --- State ---
    let allNews = [];
    let filteredNews = [];
    let displayedCount = 0;
    let currentCategory = 'all';
    let currentSort = 'newest';
    let searchQuery = '';
    let filterCounts = {};
    let musicCtx = null;
    let musicPlaying = false;

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
        setupMobileNav();
        setupModal();
        setupMusic();
        setupHeroParticles();
        setupScrollReveal();
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
            if (bar.classList.contains('open')) input.focus();
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
            link.addEventListener('click', () => {
                links.forEach((l) => l.classList.remove('active'));
                link.classList.add('active');
            });
        });
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const id = entry.target.id;
                        links.forEach((l) => l.classList.toggle('active', l.dataset.nav === id));
                        $$('.mobile-nav-link').forEach((l) => l.classList.toggle('active', l.dataset.nav === id));
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

    // --- Mobile Nav ---
    function setupMobileNav() {
        const btn = $('#mobileMenuBtn');
        const overlay = $('#mobileNavOverlay');
        if (!btn || !overlay) return;
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            overlay.classList.toggle('open');
            btn.setAttribute('aria-expanded', btn.classList.contains('active'));
        });
        $$('.mobile-nav-link').forEach((link) => {
            link.addEventListener('click', () => {
                btn.classList.remove('active');
                overlay.classList.remove('open');
                btn.setAttribute('aria-expanded', 'false');
            });
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                btn.classList.remove('active');
                overlay.classList.remove('open');
                btn.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // --- Modal ---
    function setupModal() {
        const modal = $('#imageModal');
        const modalImg = $('#modalImg');
        const close = $('#modalClose');
        document.addEventListener('click', (e) => {
            const imgWrap = e.target.closest('.timeline-card-image, .featured-card-img');
            if (imgWrap) {
                const img = imgWrap.querySelector('img');
                if (img?.src) {
                    modalImg.src = img.src;
                    modalImg.alt = img.alt || '';
                    modal.classList.add('open');
                }
            }
        });
        close?.addEventListener('click', () => modal.classList.remove('open'));
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('open');
        });
    }

    // --- Music (Web Audio API ambient pad) ---
    function setupMusic() {
        const btn = $('#musicToggle');
        if (!btn) return;
        btn.addEventListener('click', () => {
            if (!musicPlaying) {
                startMusic();
                btn.classList.add('playing');
                btn.setAttribute('aria-label', '停止背景音乐');
            } else {
                stopMusic();
                btn.classList.remove('playing');
                btn.setAttribute('aria-label', '播放背景音乐');
            }
            musicPlaying = !musicPlaying;
        });
    }

    function startMusic() {
        if (musicCtx) { musicCtx.close(); musicCtx = null; }
        musicCtx = new (window.AudioContext || window.webkitAudioContext)();
        const now = musicCtx.currentTime;
        const masterGain = musicCtx.createGain();
        masterGain.gain.setValueAtTime(0, now);
        masterGain.gain.linearRampToValueAtTime(0.08, now + 2);
        masterGain.connect(musicCtx.destination);

        // Ambient pad: 3 detuned oscillators through lowpass filter
        const filter = musicCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, now);
        filter.Q.setValueAtTime(0.5, now);
        filter.connect(masterGain);

        const freqs = [130.81, 196.00, 261.63]; // C3, G3, C4
        freqs.forEach((f, i) => {
            const osc = musicCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, now);
            osc.detune.setValueAtTime(i * 4, now);
            const g = musicCtx.createGain();
            g.gain.setValueAtTime(0.3, now);
            osc.connect(g);
            g.connect(filter);
            osc.start(now);

            // Gentle LFO for movement
            const lfo = musicCtx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.setValueAtTime(0.05 + i * 0.02, now);
            const lfoGain = musicCtx.createGain();
            lfoGain.gain.setValueAtTime(3, now);
            lfo.connect(lfoGain);
            lfoGain.connect(osc.detune);
            lfo.start(now);
        });

        // Soft noise layer
        const bufferSize = musicCtx.sampleRate * 2;
        const noiseBuffer = musicCtx.createBuffer(1, bufferSize, musicCtx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.02;
        const noise = musicCtx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;
        const noiseFilter = musicCtx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(200, now);
        noiseFilter.Q.setValueAtTime(1, now);
        noise.connect(noiseFilter);
        noiseFilter.connect(masterGain);
        noise.start(now);
    }

    function stopMusic() {
        if (musicCtx) {
            const now = musicCtx.currentTime;
            musicCtx.destination.gain?.setValueAtTime?.(0, now);
            musicCtx.close();
            musicCtx = null;
        }
    }

    // --- Hero Particles ---
    function setupHeroParticles() {
        const container = $('#heroParticles');
        if (!container) return;
        for (let i = 0; i < 20; i++) {
            const p = document.createElement('div');
            p.className = 'hero-particle';
            p.style.left = Math.random() * 100 + '%';
            p.style.top = Math.random() * 100 + '%';
            p.style.animationDelay = Math.random() * 6 + 's';
            p.style.animationDuration = (4 + Math.random() * 4) + 's';
            p.style.width = p.style.height = (1 + Math.random() * 3) + 'px';
            container.appendChild(p);
        }
    }

    // --- Scroll Reveal ---
    function setupScrollReveal() {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry, i) => {
                    if (entry.isIntersecting) {
                        setTimeout(() => entry.target.classList.add('revealed'), i * 60);
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
        );
        // Observe all reveal items (product cards, tech cards, about features)
        const observeAll = () => {
            $$('.reveal-item:not(.revealed)').forEach((el) => observer.observe(el));
        };
        observeAll();
        // Re-observe after dynamic content loads
        const mutObs = new MutationObserver(observeAll);
        mutObs.observe(document.body, { childList: true, subtree: true });
    }

    // --- Data Loading ---
    async function loadData() {
        try {
            const resp = await fetch(DATA_URL + '?t=' + Date.now());
            if (!resp.ok) throw new Error('Failed to load data');
            allNews = await resp.json();

            allNews.forEach((item) => {
                if (!item.category || !CATEGORY_MAP[item.category]) {
                    item.category = classifyItem(item);
                }
                item._date = new Date(item.date);
                if (isNaN(item._date.getTime())) item._date = new Date();
            });

            // Compute filter counts once
            filterCounts = { all: allNews.length };
            for (const cat of Object.keys(CATEGORY_MAP)) {
                filterCounts[cat] = allNews.filter((n) => n.category === cat).length;
            }

            updateStats();
            updateFilterCounts();
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
        const keywords = {
            auto: ['su7', 'yu7', 'yu9', 'su7 ultra', '小米汽车', 'xiaomi auto', 'xiaomi ev', 'xiaomi car', '电动车', '纽北', 'nurburgring', ' ev ', 'automotive', '充电桩'],
            phone: ['xiaomi 16', 'xiaomi 15', 'xiaomi 14', 'redmi', 'poco', 'mix ', '小米手机', 'smartphone', 'phone'],
            iot: ['iot', '智能家居', '手环', 'band', 'watch', '电视', 'tv', '路由器', 'router', '米家', 'mi home', '穿戴', 'earbuds', '耳机'],
            software: ['hyperos', 'miui', '澎湃os', '系统更新', 'system update', 'ota', 'android'],
            ai: ['mimo', ' ai ', '人工智能', '大模型', 'llm', '机器学习', 'machine learning', '深度学习'],
            people: ['雷军', 'lei jun', '罗福莉', 'luo fuli', '林斌', '卢伟冰']
        };
        for (const [cat, kws] of Object.entries(keywords)) {
            let score = 0;
            for (const kw of kws) { if (text.includes(kw)) score++; }
            if (score > bestScore) { bestScore = score; bestCat = cat; }
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
        const initial = parseInt(el.textContent.replace(/,/g, '')) || 0;
        function tick(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const val = Math.round(initial + (target - initial) * eased);
            el.textContent = val.toLocaleString('en-US');
            if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    // --- Filter Counts (cached) ---
    function updateFilterCounts() {
        $$('.filter-btn').forEach((btn) => {
            const cat = btn.dataset.category;
            const existing = btn.querySelector('.filter-count');
            if (existing) existing.remove();
            const count = filterCounts[cat] || 0;
            if (count > 0) {
                const span = document.createElement('span');
                span.className = 'filter-count';
                span.textContent = count;
                btn.appendChild(span);
            }
        });
    }

    // --- Apply Filters ---
    function applyFilters() {
        let items = [...allNews];
        if (currentCategory !== 'all') {
            items = items.filter((n) => n.category === currentCategory);
        }
        if (searchQuery) {
            items = items.filter((n) => {
                const text = [n.title, n.description, n.source, n.category].join(' ').toLowerCase();
                return text.includes(searchQuery);
            });
        }
        items.sort((a, b) => {
            const da = new Date(a.date).getTime();
            const db = new Date(b.date).getTime();
            return currentSort === 'newest' ? db - da : da - db;
        });
        filteredNews = items;
        displayedCount = 0;
        renderFeatured();
        renderTimeline();
        renderLoadMore();
    }

    // --- Render Featured ---
    function renderFeatured() {
        const section = $('#featured');
        const grid = $('#featuredGrid');
        if (!section || !grid) return;
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
        section.style.display = '';
        grid.innerHTML = featured.map((item, i) => {
            const imgHtml = item.image
                ? `<div class="featured-card-img"><img src="${esc(item.image)}" alt="${esc(item.title)}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`
                : `<div class="featured-card-img">${generatePlaceholder(item.category)}</div>`;
            return `<a href="${esc(item.link)}" target="_blank" rel="noopener" class="featured-card" style="animation-delay:${i * 0.1}s">
                ${imgHtml}
                <div class="featured-card-body">
                    <span class="featured-card-category cat-${item.category}">${CATEGORY_MAP[item.category]?.label || item.category}</span>
                    <h3 class="featured-card-title">${esc(item.title)}</h3>
                    <p class="featured-card-desc">${esc(item.description || '')}</p>
                    <div class="featured-card-meta">
                        <span>${esc(item.source || '')}</span>
                        <span>${formatDate(item.date)}</span>
                    </div>
                </div>
            </a>`;
        }).join('');
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
        const grouped = {};
        batch.forEach((item) => {
            const dateKey = formatDateGroup(item.date);
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push(item);
        });

        const existingGroups = container.querySelectorAll('.timeline-date');
        const lastExistingGroup = existingGroups.length > 0 ? existingGroups[existingGroups.length - 1] : null;
        const lastExistingDateKey = lastExistingGroup?.dataset?.date;

        let html = '';
        for (const [dateKey, items] of Object.entries(grouped)) {
            if (dateKey === lastExistingDateKey) {
                items.forEach((item, i) => {
                    lastExistingGroup.insertAdjacentHTML('beforeend', renderTimelineCard(item, displayedCount + i));
                });
            } else {
                html += `<div class="timeline-date" data-date="${dateKey}"><h3>${dateKey}</h3>`;
                items.forEach((item, i) => { html += renderTimelineCard(item, displayedCount + i); });
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
        const imgHtml = item.image
            ? `<img src="${esc(item.image)}" alt="${esc(item.title)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'img-placeholder\\'>${esc(generatePlaceholderSVG(cat))}</div>'">`
            : generatePlaceholder(cat);
        return `<a href="${esc(item.link)}" target="_blank" rel="noopener" class="timeline-card border-${cat}" style="animation-delay:${delay}s">
            <div class="timeline-card-image">${imgHtml}</div>
            <div class="timeline-card-body">
                <span class="timeline-card-category cat-${cat}">${catInfo.icon} ${catInfo.label}</span>
                <h4 class="timeline-card-title">${esc(item.title)}</h4>
                <p class="timeline-card-desc">${esc(item.description || '')}</p>
                <div class="timeline-card-meta">
                    <span class="timeline-card-source">${esc(item.source || '')}</span>
                    <span>${formatDate(item.date)}</span>
                </div>
            </div>
        </a>`;
    }

    function renderLoadMore() {
        const btn = $('#loadMore');
        if (!btn) return;
        btn.style.display = displayedCount < filteredNews.length ? 'block' : 'none';
        const loadMoreBtn = btn.querySelector('.btn-load-more');
        if (loadMoreBtn) loadMoreBtn.onclick = loadMoreItems;
    }

    function showEmpty() {
        const loading = $('#loading');
        const empty = $('#emptyState');
        if (loading) loading.style.display = 'none';
        if (empty) empty.style.display = 'flex';
    }

    // --- Placeholder Image Generation ---
    const PLACEHOLDER_CONFIGS = {
        auto: {
            bg: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            accent: '#FF6900',
            icon: '<path d="M8 28h32M8 28a3 3 0 01-3-3v-6a3 3 0 013-3h32a3 3 0 013 3v6a3 3 0 01-3 3M8 28l-2 4h36l-2-4" stroke="#FF6900" stroke-width="2" stroke-linecap="round" fill="none"/>',
            label: 'SU7'
        },
        phone: {
            bg: 'linear-gradient(135deg, #2d1b69 0%, #11998e 100%)',
            accent: '#6C5CE7',
            icon: '<rect x="17" y="6" width="14" height="36" rx="3" stroke="#6C5CE7" stroke-width="2" fill="none"/><circle cx="24" cy="36" r="2" fill="#6C5CE7"/>',
            label: 'Mi Phone'
        },
        iot: {
            bg: 'linear-gradient(135deg, #0a3d62 0%, #079992 100%)',
            accent: '#00B894',
            icon: '<circle cx="24" cy="24" r="6" stroke="#00B894" stroke-width="2" fill="none"/><path d="M24 14v4m0 12v4M14 24h4m12 0h4" stroke="#00B894" stroke-width="2" stroke-linecap="round"/>',
            label: 'IoT'
        },
        software: {
            bg: 'linear-gradient(135deg, #0c2461 0%, #0984e3 100%)',
            accent: '#0984E3',
            icon: '<polyline points="18 14 10 24 18 34" stroke="#0984E3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><polyline points="30 14 38 24 30 34" stroke="#0984E3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
            label: 'HyperOS'
        },
        ai: {
            bg: 'linear-gradient(135deg, #2d1b69 0%, #e84393 100%)',
            accent: '#E84393',
            icon: '<circle cx="24" cy="20" r="8" stroke="#E84393" stroke-width="2" fill="none"/><path d="M16 34c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="#E84393" stroke-width="2" stroke-linecap="round" fill="none"/>',
            label: 'MiMo AI'
        },
        people: {
            bg: 'linear-gradient(135deg, #2d3436 0%, #636e72 100%)',
            accent: '#FDCB6E',
            icon: '<circle cx="24" cy="18" r="7" stroke="#FDCB6E" stroke-width="2" fill="none"/><path d="M14 40c0-5.5 4.5-10 10-10s10 4.5 10 10" stroke="#FDCB6E" stroke-width="2" stroke-linecap="round" fill="none"/>',
            label: 'People'
        }
    };

    function generatePlaceholderSVG(category) {
        const cfg = PLACEHOLDER_CONFIGS[category] || PLACEHOLDER_CONFIGS.phone;
        return `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="pg-${category}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${cfg.accent}" stop-opacity="0.15"/><stop offset="100%" stop-color="${cfg.accent}" stop-opacity="0.05"/></linearGradient></defs>
            <rect width="48" height="48" rx="8" fill="url(#pg-${category})"/>
            ${cfg.icon}
        </svg>`;
    }

    function generatePlaceholder(category) {
        const cfg = PLACEHOLDER_CONFIGS[category] || PLACEHOLDER_CONFIGS.phone;
        return `<div class="placeholder-img">
            <svg viewBox="0 0 400 280" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
                <defs>
                    <linearGradient id="bg-${category}" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="${cfg.accent}" stop-opacity="0.12"/>
                        <stop offset="100%" stop-color="${cfg.accent}" stop-opacity="0.04"/>
                    </linearGradient>
                    <pattern id="grid-${category}" width="20" height="20" patternUnits="userSpaceOnUse">
                        <circle cx="10" cy="10" r="0.5" fill="${cfg.accent}" opacity="0.15"/>
                    </pattern>
                </defs>
                <rect width="400" height="280" fill="url(#bg-${category})"/>
                <rect width="400" height="280" fill="url(#grid-${category})"/>
                <g transform="translate(176,104) scale(2.5)" opacity="0.6">${cfg.icon}</g>
                <text x="200" y="230" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="${cfg.accent}" opacity="0.5">${cfg.label}</text>
            </svg>
        </div>`;
    }

    // --- Utilities ---
    function formatDateGroup(dateStr) {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '未知日期';
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
        if (isNaN(date.getTime())) return '';
        const now = new Date();
        const diff = now - date;
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor(diff / 60000);
        if (minutes < 60) return `${minutes}分钟前`;
        if (hours < 24) return `${hours}小时前`;
        if (hours < 48) return '昨天';
        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }

    // Optimized HTML escaping (no DOM element creation)
    const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    function esc(str) {
        if (!str) return '';
        return str.replace(/[&<>"']/g, (c) => ESC_MAP[c]);
    }

    // --- Start ---
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
