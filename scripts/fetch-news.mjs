/**
 * IMI News Fetcher
 * Fetches Xiaomi-related news from multiple sources
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
    }
};

const XIAOMI_KEYWORDS = [
    '小米', 'xiaomi', 'mi ', 'redmi', 'poco', 'mix ', 'su7', 'yu7', 'yu9',
    'hyperos', 'miui', 'mimo', '雷军', 'lei jun', '罗福莉', 'luo fuli',
    '澎湃', '米家', 'miloco', 'xiaomi auto', 'xiaomi car', 'xiaomi ev',
    '卢伟冰', '林斌', '小米汽车', '小米手机'
];

const FETCH_TIMEOUT = 15000;
const MAX_ITEMS_PER_SOURCE = 30;
const MAX_AGE_DAYS = 30;

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

    // Merge with existing (dedup by link)
    const seen = new Set();
    const merged = [];

    // Add new items first
    for (const item of allItems) {
        const key = normalizeUrl(item.link);
        if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
        }
    }

    // Add existing items not yet expired
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);

    for (const item of existingNews) {
        const key = normalizeUrl(item.link);
        if (!seen.has(key) && new Date(item.date) > cutoff) {
            seen.add(key);
            merged.push(item);
        }
    }

    // Sort by date descending
    merged.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Limit total items
    const final = merged.slice(0, 500);

    writeFileSync(DATA_PATH, JSON.stringify(final, null, 2), 'utf-8');
    console.log(`[IMI] Wrote ${final.length} items to news.json (${allItems.length} new fetched)`);
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

        if (!resp.ok) {
            console.log(`[IMI] ${source.name} returned ${resp.status}`);
            return [];
        }

        const text = await resp.text();

        if (source.type === 'atom') {
            return parseAtom(text, source);
        }
        return parseRSS(text, source);
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

        // For 36kr, filter by Xiaomi keywords
        if (source.keywordFilter && !isXiaomiRelated(title + ' ' + description)) {
            continue;
        }

        if (!title || !link) continue;

        // Try to extract image from description or media:content
        const image = extractImage(raw);

        // Use actual source name to strip it from title/description
        let cleanTitle = stripHtml(title);
        let cleanDesc = stripHtml(description);
        if (sourceName) {
            const srcPattern = new RegExp(`\\s*[-–—]\\s*${escapeRegex(sourceName)}$`, 'i');
            cleanTitle = cleanTitle.replace(srcPattern, '');
            cleanDesc = cleanDesc.replace(new RegExp(`\\s*${escapeRegex(sourceName)}$`, 'i'), '');
        }
        // Fallback: remove Google News source suffix patterns
        cleanTitle = cleanTitle.replace(/\s*-\s*Google\s*News$/i, '').replace(/\s*-\s*Google\s*新闻$/i, '');
        cleanDesc = cleanDesc.replace(/\s*-\s*Google\s*News$/i, '').replace(/\s*-\s*Google\s*新闻$/i, '');

        items.push({
            title: cleanTitle.trim(),
            description: cleanDesc.slice(0, 300).trim(),
            link: cleanLink(link),
            date: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
            source: cleanText(sourceName),
            image: image || '',
            category: classify(title + ' ' + description)
        });
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
            date: updated ? new Date(updated).toISOString() : new Date().toISOString(),
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
    const scores = {
        auto: 0,
        phone: 0,
        iot: 0,
        software: 0,
        ai: 0,
        people: 0
    };

    const rules = {
        auto: ['su7', 'yu7', 'yu9', '小米汽车', 'xiaomi auto', 'xiaomi car', 'xiaomi ev', '纽北', 'nurburgring', '电动车', 'electric vehicle', 'xiaomi suv', ' ev ', 'ev launch', 'ev push', 'automotive', '充电桩', '小米车'],
        phone: ['xiaomi 16', 'xiaomi 15', 'xiaomi 14', 'redmi', 'poco', 'mix ', '小米手机', 'smartphone', 'xiaomi pad', '小米平板'],
        iot: ['iot', '智能家居', '手环', 'band', 'watch', '电视', 'tv', '路由器', 'router', '米家', 'mi home', 'smart home', '穿戴', 'wearable', '耳机', 'earbuds', 'xiaomi buds'],
        software: ['hyperos', 'miui', '澎湃os', '系统更新', 'system update', 'ota', 'android', '澎湃'],
        ai: ['mimo', ' ai ', '人工智能', '大模型', 'llm', '机器学习', 'machine learning', '深度学习', 'deep learning', 'ml ', 'transformer', 'milmo', 'milnm'],
        people: ['雷军', 'lei jun', '罗福莉', 'luo fuli', '林斌', '卢伟冰']
    };

    for (const [cat, keywords] of Object.entries(rules)) {
        for (const kw of keywords) {
            if (lower.includes(kw)) scores[cat] += 1;
        }
    }

    let best = 'phone';
    let bestScore = 0;
    for (const [cat, score] of Object.entries(scores)) {
        if (score > bestScore) {
            bestScore = score;
            best = cat;
        }
    }

    return best;
}

// --- Helpers ---
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTag(xml, tag) {
    // Handle CDATA
    const cdataMatch = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'));
    if (cdataMatch) return cdataMatch[1].trim();

    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return match ? match[1].trim() : '';
}

function extractImage(xml) {
    // media:content
    const mediaMatch = xml.match(/<media:content[^>]*url="([^"]+)"/i);
    if (mediaMatch) return mediaMatch[1];

    // media:thumbnail
    const thumbMatch = xml.match(/<media:thumbnail[^>]*url="([^"]+)"/i);
    if (thumbMatch) return thumbMatch[1];

    // enclosure
    const encMatch = xml.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/i);
    if (encMatch) return encMatch[1];

    // img in description
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

function cleanLink(link) {
    if (!link) return '';
    // Google News article redirects
    if (link.includes('news.google.com/rss/articles/')) {
        // Try to decode the base64-encoded article ID
        try {
            const id = link.split('/articles/')[1]?.split('?')[0];
            if (id) {
                const decoded = Buffer.from(id, 'base64').toString('utf-8');
                // Extract URL from decoded content (format: bytes\x12\x1bURL...)
                const urlMatch = decoded.match(/https?:\/\/[^\s\x00-\x1f]+/);
                if (urlMatch) return urlMatch[0].replace(/[^\x20-\x7E]+$/, '');
            }
        } catch {}
        return link;
    }
    // Regular URL with query param
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
    return XIAOMI_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

// --- Run ---
main().catch((err) => {
    console.error('[IMI] Fatal error:', err);
    process.exit(1);
});
