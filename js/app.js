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
    let currentOSFilter = 'all';
    let updatesDisplayed = 0;
    const UPDATES_PER_PAGE = 15;
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
        setupUpdatesFilters();
        setupNav();
        setupMobileNav();
        setupModal();
        setupMusic();
        setupHeroParticles();
        setupScrollReveal();
        setupImageErrorHandling();
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
            btn.setAttribute('aria-pressed', btn.classList.contains('active'));
            btn.addEventListener('click', () => {
                $$('.filter-btn').forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
                btn.classList.add('active');
                btn.setAttribute('aria-pressed', 'true');
                currentCategory = btn.dataset.category;
                applyFilters();
            });
        });
    }

    // --- Updates Filters ---
    function setupUpdatesFilters() {
        $$('.updates-filter').forEach((btn) => {
            btn.addEventListener('click', () => {
                $$('.updates-filter').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                currentOSFilter = btn.dataset.os;
                updatesDisplayed = 0;
                renderUpdates();
            });
        });
    }

    function renderUpdates() {
        const container = $('#updatesList');
        const moreBtn = $('#updatesMore');
        if (!container) return;

        const updates = allNews
            .filter((n) => n.isUpdate)
            .filter((n) => currentOSFilter === 'all' || n.osType === currentOSFilter)
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        if (updatesDisplayed === 0) container.innerHTML = '';

        const batch = updates.slice(updatesDisplayed, updatesDisplayed + UPDATES_PER_PAGE);
        const html = batch.map((item, i) => {
            const osClass = item.osType ? item.osType.toLowerCase().replace(/[\s]/g, '') : 'hyperos';
            const osBadgeClass = osClass === 'hyperos' ? 'hyperos'
                : osClass === 'miui' ? 'miui'
                : osClass === 'android' ? 'android'
                : osClass === '澎湃os' ? 'pengpai'
                : 'hyperos';
            const typeClass = item.updateType || 'update';
            const typeLabels = { stable: '正式版', beta: '测试版', security: '安全更新', firmware: '固件', update: '更新' };
            const delay = (i % UPDATES_PER_PAGE) * 0.04;

            return `<a href="${esc(item.link)}" target="_blank" rel="noopener" class="update-item" style="animation-delay:${delay}s">
                <div class="update-badges">
                    <span class="update-os-badge ${osBadgeClass}">${esc(item.osType || 'OS')}</span>
                    ${item.updateVersion ? `<span class="update-version">v${esc(item.updateVersion)}</span>` : ''}
                    <span class="update-type-badge ${typeClass}">${typeLabels[typeClass] || '更新'}</span>
                </div>
                <div class="update-body">
                    <h4 class="update-title">${esc(item.title)}</h4>
                    ${item.device ? `<span class="update-device">${esc(item.device)}</span>` : ''}
                    <div class="update-meta">
                        <span>${esc(item.source || '')}</span>
                        <span>${formatDate(item.date)}</span>
                    </div>
                </div>
            </a>`;
        }).join('');

        if (html) container.insertAdjacentHTML('beforeend', html);
        updatesDisplayed += batch.length;

        if (moreBtn) moreBtn.style.display = updatesDisplayed < updates.length ? 'block' : 'none';
        const btn = moreBtn?.querySelector('.btn-load-more');
        if (btn) btn.onclick = () => renderUpdates();
    }

    // --- Sort ---
    function setupSort() {
        $$('.sort-btn').forEach((btn) => {
            btn.setAttribute('aria-pressed', btn.classList.contains('active'));
            btn.addEventListener('click', () => {
                $$('.sort-btn').forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
                btn.classList.add('active');
                btn.setAttribute('aria-pressed', 'true');
                currentSort = btn.dataset.sort;
                applyFilters();
            });
        });
    }

    // --- Nav ---
    function setupNav() {
        const links = $$('.nav-link');
        const sections = ['timeline', 'updates', 'products', 'tech', 'about'];
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
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('open')) {
                modal.classList.remove('open');
            }
        });
    }

    // --- Music (Web Audio API ambient pad) ---
    let _masterGain = null;
    let _musicOscs = [];
    let _musicNoise = null;
    let _musicLFOs = [];

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
        stopMusic();
        try {
            musicCtx = new (window.AudioContext || window.webkitAudioContext)();
            const now = musicCtx.currentTime;

            _masterGain = musicCtx.createGain();
            _masterGain.gain.setValueAtTime(0, now);
            _masterGain.gain.linearRampToValueAtTime(0.06, now + 3);
            _masterGain.connect(musicCtx.destination);

            const filter = musicCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(500, now);
            filter.Q.setValueAtTime(0.7, now);
            filter.connect(_masterGain);

            // Warm pad: C3, E3, G3 (C major chord, soft)
            const freqs = [130.81, 164.81, 196.00];
            _musicOscs = [];
            _musicLFOs = [];

            freqs.forEach((f, i) => {
                const osc = musicCtx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, now);
                osc.detune.setValueAtTime(i * 3, now);
                const g = musicCtx.createGain();
                g.gain.setValueAtTime(0.25, now);
                osc.connect(g);
                g.connect(filter);
                osc.start(now);
                _musicOscs.push(osc);

                const lfo = musicCtx.createOscillator();
                lfo.type = 'sine';
                lfo.frequency.setValueAtTime(0.03 + i * 0.015, now);
                const lfoG = musicCtx.createGain();
                lfoG.gain.setValueAtTime(2, now);
                lfo.connect(lfoG);
                lfoG.connect(osc.detune);
                lfo.start(now);
                _musicLFOs.push(lfo);
            });

            // Soft noise texture
            const buf = musicCtx.createBuffer(1, musicCtx.sampleRate * 2, musicCtx.sampleRate);
            const ch = buf.getChannelData(0);
            for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * 0.015;
            _musicNoise = musicCtx.createBufferSource();
            _musicNoise.buffer = buf;
            _musicNoise.loop = true;
            const nf = musicCtx.createBiquadFilter();
            nf.type = 'bandpass';
            nf.frequency.setValueAtTime(180, now);
            nf.Q.setValueAtTime(0.8, now);
            _musicNoise.connect(nf);
            nf.connect(_masterGain);
            _musicNoise.start(now);
        } catch (e) {
            console.warn('Music init failed:', e);
        }
    }

    function stopMusic() {
        if (_masterGain && musicCtx) {
            try {
                const now = musicCtx.currentTime;
                _masterGain.gain.linearRampToValueAtTime(0, now + 0.5);
                const ctx = musicCtx;
                setTimeout(() => { try { ctx.close(); } catch {} }, 600);
            } catch {}
        }
        _masterGain = null;
        _musicOscs = [];
        _musicLFOs = [];
        _musicNoise = null;
        musicCtx = null;
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

    // --- Image Error Handling (event delegation) ---
    function setupImageErrorHandling() {
        document.addEventListener('error', (e) => {
            if (e.target.tagName !== 'IMG' || !e.target.dataset.phCat) return;
            const cat = e.target.dataset.phCat;
            const mode = e.target.dataset.phMode;
            if (mode === 'featured') {
                // Replace with placeholder for featured cards
                const wrap = e.target.closest('.featured-card-img');
                if (wrap) wrap.innerHTML = generatePlaceholder(cat);
            } else {
                // Replace with placeholder for timeline cards
                const wrap = e.target.parentElement;
                if (wrap) wrap.innerHTML = generatePlaceholder(cat);
            }
        }, true); // use capture phase for error events
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
        // Re-observe after dynamic content loads, then auto-disconnect
        const mutObs = new MutationObserver(() => {
            observeAll();
            clearTimeout(mutObs._timer);
            mutObs._timer = setTimeout(() => mutObs.disconnect(), 8000);
        });
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
            renderUpdates();
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
                ? `<div class="featured-card-img"><img src="${esc(item.image)}" alt="${esc(item.title)}" loading="lazy" data-ph-cat="${item.category}" data-ph-mode="featured"></div>`
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
        if (loading) loading.style.display = 'none';
        if (filteredNews.length === 0) {
            container.innerHTML = '';
            if (empty) empty.style.display = 'flex';
            return;
        }
        if (empty) empty.style.display = 'none';
        container.innerHTML = '';
        displayedCount = 0;
        loadMoreItems();
    }

    function loadMoreItems() {
        const container = $('#timelineContainer');
        if (!container) return;
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
            ? `<img src="${esc(item.image)}" alt="${esc(item.title)}" loading="lazy" data-ph-cat="${cat}">`
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

    // --- Placeholder Image Generation (Xiaomi-inspired) ---
    const PLACEHOLDER_CONFIGS = {
        auto: {
            gradient: ['#0D0D1A', '#1A0A2E', '#2D1B69'],
            accent: '#FF6900',
            accentLight: '#FF8533',
            icon: 'M8 28h32M8 28a3 3 0 01-3-3v-6a3 3 0 013-3h32a3 3 0 013 3v6a3 3 0 01-3 3M8 28l-2 4h36l-2-4',
            label: 'XIAOMI AUTO',
            sub: 'SU7 / YU7 / YU9'
        },
        phone: {
            gradient: ['#0A0A1A', '#1A0A3E', '#2D1B69'],
            accent: '#6C5CE7',
            accentLight: '#A29BFE',
            icon: 'M17 6h14a3 3 0 013 3v30a3 3 0 01-3 3H17a3 3 0 01-3-3V9a3 3 0 013-3z M21 36h6',
            label: 'XIAOMI',
            sub: 'Smartphone'
        },
        iot: {
            gradient: ['#0A1628', '#0A2E3D', '#0D4F4F'],
            accent: '#00B894',
            accentLight: '#55EFC4',
            icon: 'M24 18a6 6 0 100 12 6 6 0 000-12z M24 10v4 M24 34v4 M10 24h4 M34 24h4',
            label: 'MI IoT',
            sub: 'Smart Home'
        },
        software: {
            gradient: ['#0A0A2E', '#0C1E4A', '#0A3D7D'],
            accent: '#0984E3',
            accentLight: '#74B9FF',
            icon: 'M18 14l-8 10 8 10 M30 14l8 10-8 10',
            label: 'HyperOS',
            sub: 'System Update'
        },
        ai: {
            gradient: ['#1A0A2E', '#2D0A3E', '#4A0E5C'],
            accent: '#E84393',
            accentLight: '#FD79A8',
            icon: 'M24 14a8 8 0 100 16 8 8 0 000-16z M16 32c0-4.4 3.6-8 8-8s8 3.6 8 8',
            label: 'MiMo AI',
            sub: 'Intelligence'
        },
        people: {
            gradient: ['#1A1A1A', '#2D2D2D', '#3D3D3D'],
            accent: '#FDCB6E',
            accentLight: '#FFEAA7',
            icon: 'M24 16a7 7 0 100 14 7 7 0 000-14z M14 40c0-5.5 4.5-10 10-10s10 4.5 10 10',
            label: 'XIAOMI',
            sub: 'Leadership'
        }
    };

    // Unique ID counter for SVG patterns
    let _phId = 0;

    function generatePlaceholderSVG(category) {
        const cfg = PLACEHOLDER_CONFIGS[category] || PLACEHOLDER_CONFIGS.phone;
        const id = 'ph' + (++_phId);
        return `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${cfg.gradient[0]}"/><stop offset="50%" stop-color="${cfg.gradient[1]}"/><stop offset="100%" stop-color="${cfg.gradient[2]}"/></linearGradient></defs>
            <rect width="48" height="48" rx="8" fill="url(#${id})"/>
            <circle cx="24" cy="24" r="12" stroke="${cfg.accent}" stroke-width="1" opacity="0.3" fill="none"/>
            <g transform="translate(12,12) scale(0.5)" stroke="${cfg.accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.8"><path d="${cfg.icon}"/></g>
        </svg>`;
    }

    function generatePlaceholder(category) {
        const cfg = PLACEHOLDER_CONFIGS[category] || PLACEHOLDER_CONFIGS.phone;
        const id = 'p' + (++_phId);
        return `<div class="placeholder-img placeholder-${category}">
            <svg viewBox="0 0 400 280" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
                <defs>
                    <linearGradient id="${id}-bg" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="${cfg.gradient[0]}"/>
                        <stop offset="50%" stop-color="${cfg.gradient[1]}"/>
                        <stop offset="100%" stop-color="${cfg.gradient[2]}"/>
                    </linearGradient>
                    <radialGradient id="${id}-glow" cx="30%" cy="40%" r="60%">
                        <stop offset="0%" stop-color="${cfg.accent}" stop-opacity="0.2"/>
                        <stop offset="100%" stop-color="${cfg.accent}" stop-opacity="0"/>
                    </radialGradient>
                    <radialGradient id="${id}-glow2" cx="80%" cy="70%" r="40%">
                        <stop offset="0%" stop-color="${cfg.accentLight}" stop-opacity="0.1"/>
                        <stop offset="100%" stop-color="${cfg.accentLight}" stop-opacity="0"/>
                    </radialGradient>
                    <pattern id="${id}-dots" width="24" height="24" patternUnits="userSpaceOnUse">
                        <circle cx="12" cy="12" r="0.6" fill="${cfg.accent}" opacity="0.12"/>
                    </pattern>
                    <pattern id="${id}-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M40 0L0 0 0 40" fill="none" stroke="${cfg.accent}" stroke-width="0.3" opacity="0.08"/>
                    </pattern>
                    <clipPath id="${id}-clip"><rect width="400" height="280" rx="0"/></clipPath>
                </defs>
                <g clip-path="url(#${id}-clip)">
                    <rect width="400" height="280" fill="url(#${id}-bg)"/>
                    <rect width="400" height="280" fill="url(#${id}-grid)"/>
                    <rect width="400" height="280" fill="url(#${id}-dots)"/>
                    <rect width="400" height="280" fill="url(#${id}-glow)"/>
                    <rect width="400" height="280" fill="url(#${id}-glow2)"/>
                    <circle cx="200" cy="130" r="50" stroke="${cfg.accent}" stroke-width="0.8" fill="none" opacity="0.15"/>
                    <circle cx="200" cy="130" r="35" stroke="${cfg.accent}" stroke-width="0.5" fill="none" opacity="0.1"/>
                    <circle cx="200" cy="130" r="70" stroke="${cfg.accent}" stroke-width="0.3" fill="none" opacity="0.08"/>
                    <g transform="translate(180,110) scale(1.2)" stroke="${cfg.accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.7"><path d="${cfg.icon}"/></g>
                    <text x="200" y="200" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="14" font-weight="700" letter-spacing="3" fill="${cfg.accent}" opacity="0.6">${cfg.label}</text>
                    <text x="200" y="218" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="10" font-weight="400" letter-spacing="1" fill="${cfg.accentLight}" opacity="0.35">${cfg.sub}</text>
                    <line x1="160" y1="230" x2="240" y2="230" stroke="${cfg.accent}" stroke-width="0.5" opacity="0.15"/>
                    <text x="200" y="252" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="9" font-weight="500" letter-spacing="2" fill="${cfg.accent}" opacity="0.2">IMI</text>
                </g>
            </svg>
        </div>`;
    }

    // --- Utilities ---
    function formatDateGroup(dateStr) {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '未知日期';
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const diffDays = Math.round((today - itemDate) / 86400000);
        if (diffDays === 0) return '今天';
        if (diffDays === 1) return '昨天';
        if (diffDays === 2) return '前天';
        if (diffDays < 7) return `${diffDays}天前`;
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
