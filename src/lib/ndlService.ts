/**
 * 國立國會圖書館 (NDL) サーチ OpenSearch API 照會服務
 * 官方免金鑰，CORS 完全允許，直接從前端查詢
 */

export interface NdlRecord {
  url: string;
  title: string;
  volume?: string;
  creators: string[];
  publisher: string;
  year: number | null;
  extent?: string;
  pid?: string;
  iiifManifestUrl?: string;
}

const OPENSEARCH_URL = 'https://ndlsearch.ndl.go.jp/api/opensearch';

export async function searchNdl(query: string, until = 1950): Promise<NdlRecord[]> {
  const cleanQuery = query
    .replace(/[《》〈〉［］\[\]（）()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanQuery) return [];

  const params = new URLSearchParams({
    any: cleanQuery,
    mediatype: 'books',
    cnt: '8',
    until: String(until),
  });

  try {
    const res = await fetch(`${OPENSEARCH_URL}?${params}`);
    if (!res.ok) throw new Error(`NDL HTTP ${res.status}`);
    const xml = await res.text();
    return parseNdlXml(xml);
  } catch (err) {
    console.warn('NDL 國會圖書館檢索出錯:', err);
    return [];
  }
}

function parseNdlXml(xml: string): NdlRecord[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const items = Array.from(doc.getElementsByTagName('item'));

  return items.map((item) => {
    const link = item.getElementsByTagName('link')[0]?.textContent?.trim() || '';
    const title = getTagText(item, 'title') || item.getElementsByTagName('title')[0]?.textContent?.trim() || '';
    const publisher = getTagText(item, 'publisher');
    const dateStr = getTagText(item, 'date');
    const extent = getTagText(item, 'extent');
    const volume = getTagText(item, 'volume');

    const creators: string[] = [];
    const creatorNodes = item.getElementsByTagName('creator');
    for (let i = 0; i < creatorNodes.length; i++) {
      const c = creatorNodes[i].textContent?.trim();
      if (c && !creators.includes(c)) creators.push(c);
    }

    // 取得 NDL デジタルコレクション永續 ID (pid)
    let pid: string | undefined;
    const seeAlsoNodes = item.getElementsByTagName('seeAlso');
    for (let i = 0; i < seeAlsoNodes.length; i++) {
      const res = seeAlsoNodes[i].getAttribute('rdf:resource') || seeAlsoNodes[i].textContent || '';
      const match = res.match(/dl\.ndl\.go\.jp\/(?:info:ndljp\/)?pid\/(\d+)/);
      if (match) {
        pid = match[1];
        break;
      }
    }

    const yearMatch = dateStr.match(/\d{4}/);
    const year = yearMatch ? parseInt(yearMatch[0], 10) : null;

    return {
      url: link,
      title,
      volume,
      creators,
      publisher,
      year,
      extent,
      pid,
      iiifManifestUrl: pid ? `https://dl.ndl.go.jp/api/iiif/${pid}/manifest.json` : undefined,
    };
  }).sort((a, b) => Number(Boolean(b.pid)) - Number(Boolean(a.pid)));
}

function getTagText(parent: Element, tagName: string): string {
  const tags = parent.getElementsByTagName(tagName);
  if (tags.length > 0 && tags[0].textContent) {
    return tags[0].textContent.trim();
  }
  // Try with namespace
  const all = parent.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName === tagName && all[i].textContent) {
      return all[i].textContent!.trim();
    }
  }
  return '';
}
