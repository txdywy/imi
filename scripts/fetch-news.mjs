/**
 * IMI News Fetcher v2
 * Fetches Xiaomi-related news from multiple sources
 * Extracts article images via og:image from resolved Google News URLs
 * Run via GitHub Actions every hour
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, '..', 'data', 'news.json');

// --- Configuration ---
const SOURCES = {
    googleNewsEN: {
        url: 'https://news.google.com/rss/search?q=Xiaomi+OR+%22Mi+Mo%22+OR+%22Lei+Jun%22+OR+HyperOS+OR+%22Xiaomi+SU7%22+OR+%22Xiaomi+YU7%22&hl=en&gl=US&ceid=US:en',
        name: 'Google News EN',
        type: 'rss'
    },
    googleNewsCN: {
        url: 'https://news.google.com/rss/search?q=%E5%B0%8F%E7%B1%B3+OR+%E9%9B%B7%E5%86%9B+OR+HyperOS+OR+MiMo+OR+%E5%B0%8F%E7%B1%B3%E6%B1%BD%E8%BD%A6&hl=zh-CN&gl=CN&ceid=CN:zh-Hans',
        name: 'Google News CN',
        type: 'rss'
    },
    kr36: {
        url: 'https://36kr.com/feed',
        name: '36kr',
        type: 'rss',
        keywordFilter: true
    },
    xiaomiGitHub: {
        url: 'https://github.com/Xiaomi.atom',
        name: 'GitHub Xiaomi',
        type: 'atom'
    },
    xiaomiMiMoGitHub: {
        url: 'https://github.com/XiaomiMiMo.atom',
        name: 'GitHub XiaomiMiMo',
        type: 'atom'
    },
    // Software update dedicated sources
    hyperOSUpdate: {
        url: 'https://news.google.com/rss/search?q=%22HyperOS%22+update+OR+rollout+OR+OTA&hl=en&gl=US&ceid=US:en',
        name: 'HyperOS Updates',
        type: 'rss',
        isUpdate: true
    },
    miuiUpdate: {
        url: 'https://news.google.com/rss/search?q=%22MIUI%22+update+OR+rollout+OR+OTA&hl=en&gl=US&ceid=US:en',
        name: 'MIUI Updates',
        type: 'rss',
        isUpdate: true
    },
    hyperOSUpdateCN: {
        url: 'https://news.google.com/rss/search?q=HyperOS+%E6%9B%B4%E6%96%B0+OR+%E6%8E%A8%E9%80%81+OR+OTA+OR+%E5%8D%87%E7%BA%A7&hl=zh-CN&gl=CN&ceid=CN:zh-Hans',
        name: 'HyperOS 更新',
        type: 'rss',
        isUpdate: true
    },
    xdaXiaomi: {
        url: 'https://www.xda-developers.com/feed/tag/xiaomi/',
        name: 'XDA Xiaomi',
        type: 'rss',
        keywordFilter: true,
        isUpdate: true
    },
    ximitime: {
        url: 'https://ximitime.com/feed/',
        name: 'XimiTime',
        type: 'rss',
        isUpdate: true
    }
};

const FETCH_TIMEOUT = 15000;
const MAX_ITEMS_PER_SOURCE = 30;
const MAX_AGE_DAYS = 30;
const IMAGE_RESOLVE_CONCURRENCY = 5;
const IMAGE_RESOLVE_DELAY = 500; // ms between requests

// --- Main ---
async function main() {
    console.log(`[IMI] Starting news fetch at ${new Date().toISOString()}`);

    let existingNews = [];
    if (existsSync(DATA_PATH)) {
        try {
            existingNews = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
            console.log(`[IMI] Loaded ${existingNews.length} existing items`);
        } catch {
            console.log('[IMI] Could not parse existing data, starting fresh');
        }
    }

    const allItems = [];
    const fetchPromises = Object.entries(SOURCES).map(([key, source]) =>
        fetchSource(key, source).catch((err) => {
            console.error(`[IMI] Failed to fetch ${source.name}: ${err.message}`);
            return [];
        })
    );

    const results = await Promise.all(fetchPromises);
    results.forEach((items) => allItems.push(...items));

    // Resolve images for new items (only items without cached images)
    const existingImageMap = new Map();
    for (const item of existingNews) {
        if (item.image && item.link) {
            existingImageMap.set(normalizeUrl(item.link), item.image);
        }
    }

    await resolveImages(allItems, existingImageMap);

    // Merge with existing (dedup by link)
    const seen = new Set();
    const merged = [];
    for (const item of allItems) {
        const key = normalizeUrl(item.link);
        if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
        }
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
    for (const item of existingNews) {
        const key = normalizeUrl(item.link);
        if (!seen.has(key) && new Date(item.date) > cutoff) {
            seen.add(key);
            merged.push(item);
        }
    }

    merged.sort((a, b) => new Date(b.date) - new Date(a.date));
    const final = merged.slice(0, 500);

    writeFileSync(DATA_PATH, JSON.stringify(final, null, 2), 'utf-8');
    console.log(`[IMI] Wrote ${final.length} items to news.json (${allItems.length} new fetched)`);
}

// --- Image Resolution ---
async function resolveImages(items, existingImageMap) {
    // Only resolve for items missing images that are Google News links
    const toResolve = items.filter((item) => {
        if (item.image) return false;
        const cached = existingImageMap.get(normalizeUrl(item.link));
        if (cached) { item.image = cached; return false; }
        return item.link?.includes('news.google.com/rss/articles/');
    });

    if (toResolve.length === 0) {
        console.log('[IMI] No images to resolve');
        return;
    }

    console.log(`[IMI] Resolving images for ${toResolve.length} items...`);
    let resolved = 0;

    // Try to load google-news-url-decoder
    let GoogleDecoder;
    try {
        const mod = await import('google-news-url-decoder');
        GoogleDecoder = mod.GoogleDecoder;
    } catch {
        console.log('[IMI] google-news-url-decoder not available, skipping image resolution');
        return;
    }

    const decoder = new GoogleDecoder();

    // Process in batches with rate limiting
    for (let i = 0; i < toResolve.length; i += IMAGE_RESOLVE_CONCURRENCY) {
        const batch = toResolve.slice(i, i + IMAGE_RESOLVE_CONCURRENCY);
        const promises = batch.map(async (item) => {
            try {
                const imageUrl = await resolveArticleImage(decoder, item.link);
                if (imageUrl) {
                    item.image = imageUrl;
                    resolved++;
                }
            } catch {}
        });
        await Promise.all(promises);
        if (i + IMAGE_RESOLVE_CONCURRENCY < toResolve.length) {
            await sleep(IMAGE_RESOLVE_DELAY);
        }
    }

    console.log(`[IMI] Resolved ${resolved}/${toResolve.length} images`);
}

async function resolveArticleImage(decoder, googleNewsUrl) {
    try {
        const { status, decoded_url } = await decoder.decode(googleNewsUrl);
        if (!status || !decoded_url) return '';

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const resp = await fetch(decoded_url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'text/html'
            }
        });
        clearTimeout(timeout);

        if (!resp.ok) return '';

        const html = await resp.text();
        // Extract og:image
        const m = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
        return m ? m[1] : '';
    } catch {
        return '';
    }
}

// --- Fetch a single source ---
async function fetchSource(key, source) {
    console.log(`[IMI] Fetching ${source.name}...`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
        const resp = await fetch(source.url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'IMI-Bot/1.0 (+https://github.com/imi)',
                'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
            }
        });
        clearTimeout(timeout);
        if (!resp.ok) { console.log(`[IMI] ${source.name} returned ${resp.status}`); return []; }
        const text = await resp.text();
        return source.type === 'atom' ? parseAtom(text, source) : parseRSS(text, source);
    } catch (err) {
        clearTimeout(timeout);
        throw err;
    }
}

// --- Parse RSS ---
function parseRSS(xml, source) {
    const items = [];
    const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];

    for (const raw of itemMatches.slice(0, MAX_ITEMS_PER_SOURCE)) {
        const title = extractTag(raw, 'title');
        const link = extractTag(raw, 'link');
        const description = stripHtml(extractTag(raw, 'description') || extractTag(raw, 'content:encoded'));
        const pubDate = extractTag(raw, 'pubDate');
        const sourceName = extractTag(raw, 'source') || source.name;

        if (source.keywordFilter && !isXiaomiRelated(title + ' ' + description)) continue;
        if (!title || !link) continue;

        const image = extractImage(raw);
        const cleanTitle = cleanSourceFromText(stripHtml(title), sourceName);
        const cleanDesc = cleanSourceFromText(stripHtml(description), sourceName);
        const date = safeDate(pubDate);

        const fullText = title + ' ' + description;
        const category = source.isUpdate ? 'software' : classify(fullText);
        const versionInfo = source.isUpdate ? extractVersionInfo(fullText) : null;

        const item = {
            title: cleanTitle,
            description: cleanDesc.slice(0, 300),
            link: cleanLink(link),
            date,
            source: cleanText(sourceName),
            image: image || '',
            category
        };
        if (versionInfo) Object.assign(item, versionInfo);
        items.push(item);
    }

    console.log(`[IMI] ${source.name}: ${items.length} items`);
    return items;
}

// --- Parse Atom ---
function parseAtom(xml, source) {
    const items = [];
    const entryMatches = xml.match(/<entry>([\s\S]*?)<\/entry>/gi) || [];

    for (const raw of entryMatches.slice(0, MAX_ITEMS_PER_SOURCE)) {
        const title = extractTag(raw, 'title');
        const linkMatch = raw.match(/<link[^>]*href="([^"]+)"/i);
        const link = linkMatch ? linkMatch[1] : '';
        const content = stripHtml(extractTag(raw, 'content') || extractTag(raw, 'summary'));
        const updated = extractTag(raw, 'updated') || extractTag(raw, 'published');

        if (!title || !link) continue;

        items.push({
            title: cleanText(title),
            description: cleanText(content).slice(0, 300),
            link: cleanLink(link),
            date: safeDate(updated),
            source: source.name,
            image: '',
            category: classify(title + ' ' + content)
        });
    }

    console.log(`[IMI] ${source.name}: ${items.length} items`);
    return items;
}

// --- Classification ---
function classify(text) {
    const lower = text.toLowerCase();
    const scores = {};
    const rules = {
        auto: ['su7', 'yu7', 'yu9', '小米汽车', 'xiaomi auto', 'xiaomi car', 'xiaomi ev', '纽北', 'nurburgring', '电动车', 'electric vehicle', 'xiaomi suv', ' ev ', 'ev launch', 'ev push', 'automotive', '充电桩', '小米车'],
        phone: ['xiaomi 16', 'xiaomi 15', 'xiaomi 14', 'redmi', 'poco', 'mix ', '小米手机', 'smartphone', 'xiaomi pad', '小米平板'],
        iot: ['iot', '智能家居', '手环', 'band', 'watch', '电视', 'tv', '路由器', 'router', '米家', 'mi home', 'smart home', '穿戴', 'wearable', '耳机', 'earbuds', 'xiaomi buds'],
        software: ['hyperos', 'miui', '澎湃os', '系统更新', 'system update', 'ota', 'android', '澎湃'],
        ai: ['mimo', ' ai ', '人工智能', '大模型', 'llm', '机器学习', 'machine learning', '深度学习', 'deep learning', 'ml ', 'transformer'],
        people: ['雷军', 'lei jun', '罗福莉', 'luo fuli', '林斌', '卢伟冰']
    };

    for (const [cat, keywords] of Object.entries(rules)) {
        scores[cat] = 0;
        for (const kw of keywords) {
            if (lower.includes(kw)) scores[cat]++;
        }
    }

    let best = 'phone';
    let bestScore = 0;
    for (const [cat, score] of Object.entries(scores)) {
        if (score > bestScore) { bestScore = score; best = cat; }
    }
    return best;
}

// --- Version Info Extraction ---
function extractVersionInfo(text) {
    const info = {};
    const lower = text.toLowerCase();

    // Extract version number (e.g., HyperOS 3.1, MIUI 15, V14.0.2, 2.0.301.0)
    const versionMatch = text.match(/(?:HyperOS|MIUI|澎湃OS)\s*(\d+(?:\.\d+)*)/i)
        || text.match(/[vV](\d+(?:\.\d+){1,3})/i)
        || text.match(/(\d+\.\d+\.\d+(?:\.\d+)?)/);
    if (versionMatch) info.updateVersion = versionMatch[1];

    // Detect OS type
    if (/hyperos/i.test(lower)) info.osType = 'HyperOS';
    else if (/miui/i.test(lower)) info.osType = 'MIUI';
    else if (/澎湃os/i.test(lower)) info.osType = '澎湃OS';
    else if (/android\s*\d+/i.test(lower)) info.osType = 'Android';

    // Detect update type
    if (/stable|正式版|稳定版|正式/i.test(lower)) info.updateType = 'stable';
    else if (/beta|测试版|内测|公测/i.test(lower)) info.updateType = 'beta';
    else if (/security|安全补丁|安全更新/i.test(lower)) info.updateType = 'security';
    else if (/firmware|固件/i.test(lower)) info.updateType = 'firmware';
    else info.updateType = 'update';

    // Extract device name
    const deviceMatch = text.match(/(Xiaomi\s+\d+\s*(?:Ultra|Pro)?|Redmi\s+\w+(?:\s+\w+)?|POCO\s+\w+(?:\s+\w+)?|Mi\s+\d+\s*(?:Ultra|Pro|T)?|MIX\s+\w+|Pad\s+\d+\s*\w*|K\s*Pad\s*\w*)/i);
    if (deviceMatch) info.device = deviceMatch[1].trim();

    // Mark as software update
    info.isUpdate = true;

    return info;
}

// --- Helpers ---
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTag(xml, tag) {
    const cdataMatch = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'));
    if (cdataMatch) return cdataMatch[1].trim();
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return match ? match[1].trim() : '';
}

function extractImage(xml) {
    const mediaMatch = xml.match(/<media:content[^>]*url="([^"]+)"/i);
    if (mediaMatch) return mediaMatch[1];
    const thumbMatch = xml.match(/<media:thumbnail[^>]*url="([^"]+)"/i);
    if (thumbMatch) return thumbMatch[1];
    const encMatch = xml.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/i);
    if (encMatch) return encMatch[1];
    const imgMatch = xml.match(/<img[^>]*src="([^"]+)"/i);
    if (imgMatch) return imgMatch[1];
    return '';
}

function stripHtml(html) {
    if (!html) return '';
    return html
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<\/p>/gi, ' ')
        .replace(/<\/div>/gi, ' ')
        .replace(/<\/li>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&hellip;/g, '...')
        .replace(/&#\d+;/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/\s*-\s*Google\s*News$/i, '')
        .replace(/\s*-\s*Google\s*新闻$/i, '')
        .trim();
}

function cleanSourceFromText(text, sourceName) {
    if (!text) return '';
    let cleaned = text;
    if (sourceName) {
        const srcPattern = new RegExp(`\\s*[-–—]\\s*${escapeRegex(sourceName)}$`, 'i');
        cleaned = cleaned.replace(srcPattern, '');
        cleaned = cleaned.replace(new RegExp(`\\s*${escapeRegex(sourceName)}$`, 'i'), '');
    }
    cleaned = cleaned.replace(/\s*-\s*Google\s*News$/i, '').replace(/\s*-\s*Google\s*新闻$/i, '');
    return cleaned.trim();
}

function safeDate(dateStr) {
    if (!dateStr) return new Date().toISOString();
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
}

function cleanLink(link) {
    if (!link) return '';
    if (link.includes('news.google.com/rss/articles/')) {
        try {
            const id = link.split('/articles/')[1]?.split('?')[0];
            if (id) {
                const decoded = Buffer.from(id, 'base64').toString('utf-8');
                const urlMatch = decoded.match(/https?:\/\/[^\s\x00-\x1f]+/);
                if (urlMatch) return urlMatch[0].replace(/[^\x20-\x7E]+$/, '');
            }
        } catch {}
        return link;
    }
    const match = link.match(/url=([^&]+)/);
    if (match) return decodeURIComponent(match[1]);
    return link.trim();
}

function normalizeUrl(url) {
    if (!url) return '';
    try {
        const u = new URL(url);
        return (u.hostname + u.pathname).toLowerCase().replace(/\/+$/, '');
    } catch {
        return url.toLowerCase().replace(/\/+$/, '');
    }
}

function isXiaomiRelated(text) {
    const lower = text.toLowerCase();
    return ['小米', 'xiaomi', 'mi ', 'redmi', 'poco', 'mix ', 'su7', 'yu7', 'yu9',
        'hyperos', 'miui', 'mimo', '雷军', 'lei jun', '罗福莉', 'luo fuli',
        '澎湃', '米家', 'miloco', 'xiaomi auto', 'xiaomi car', 'xiaomi ev',
        '卢伟冰', '林斌', '小米汽车', '小米手机'
    ].some((kw) => lower.includes(kw));
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// --- Run ---
main().catch((err) => {
    console.error('[IMI] Fatal error:', err);
    process.exit(1);
});
