import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { log, LogLevel } from '../logger';

export interface RssFeedConfig {
  enabled: boolean;
  filePath: string; // absolute or relative to project root
  title: string;
  siteUrl: string; // used as feed <id> and base link
}

export interface AnnouncementEntry {
  id?: string; // optional stable id
  title: string;
  content: string; // plain text or HTML (wrapped as CDATA)
  link?: string; // optional permalink
  updated?: string; // ISO8601
}

interface StoredEntry {
  id: string;
  title: string;
  content: string;
  link?: string;
  updated: string;
}

export class FeedService {
  private config: RssFeedConfig;
  private jsonPath: string;

  constructor(config: RssFeedConfig) {
    this.config = config;
    const feedFile = path.resolve(this.config.filePath);
    const feedDir = path.dirname(feedFile);
    if (!fsSync.existsSync(feedDir)) {
      fsSync.mkdirSync(feedDir, { recursive: true });
    }
    this.jsonPath = feedFile.replace(/\.xml$/i, '') + '.json';
  }

  async publish(entry: AnnouncementEntry): Promise<void> {
    if (!this.config.enabled) {
      log(LogLevel.INFO, 'FeedService: RSS feed disabled; skipping publish');
      return;
    }
    const nowIso = new Date().toISOString();
    const id = entry.id || `urn:wooster:announce:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const stored: StoredEntry = {
      id,
      title: entry.title || 'Announcement',
      content: entry.content || '',
      link: entry.link,
      updated: entry.updated || nowIso,
    };

    const entries = await this.readEntries();
    entries.unshift(stored);
    // keep last 500
    const trimmed = entries.slice(0, 500);
    await this.writeEntries(trimmed);
    await this.writeAtom(trimmed);
  }

  private async readEntries(): Promise<StoredEntry[]> {
    try {
      const buf = await fs.readFile(this.jsonPath, 'utf8');
      const arr = JSON.parse(buf) as StoredEntry[];
      if (Array.isArray(arr)) return arr;
      return [];
    } catch {
      return [];
    }
  }

  private async writeEntries(entries: StoredEntry[]): Promise<void> {
    await fs.writeFile(this.jsonPath, JSON.stringify(entries, null, 2), 'utf8');
  }

  private async writeAtom(entries: StoredEntry[]): Promise<void> {
    const feedFile = path.resolve(this.config.filePath);
    const updated = entries[0]?.updated || new Date().toISOString();
    const xml = this.renderAtom(entries, updated);
    await fs.writeFile(feedFile, xml, 'utf8');
    log(LogLevel.INFO, `FeedService: Wrote RSS/Atom feed to ${feedFile}`);
  }

  private escape(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private cdata(str: string): string {
    // Avoid closing CDATA inside content
    return `<![CDATA[${str.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;
  }

  private renderAtom(entries: StoredEntry[], feedUpdated: string): string {
    const feedId = this.config.siteUrl || 'urn:wooster:feed';
    const feedTitle = this.escape(this.config.title || 'Wooster Announcements');
    const items = entries
      .map((e) => {
        const title = this.escape(e.title || 'Announcement');
        const id = this.escape(e.id);
        const updated = this.escape(e.updated);
        const link = e.link ? `<link href="${this.escape(e.link)}" />` : '';
        const content = this.cdata(e.content || '');
        return (
          `  <entry>\n` +
          `    <title>${title}</title>\n` +
          `    <id>${id}</id>\n` +
          `    <updated>${updated}</updated>\n` +
          (link ? `    ${link}\n` : '') +
          `    <content type="html">${content}</content>\n` +
          `  </entry>`
        );
      })
      .join('\n');

    return (
      `<?xml version="1.0" encoding="utf-8"?>\n` +
      `<feed xmlns="http://www.w3.org/2005/Atom">\n` +
      `  <title>${feedTitle}</title>\n` +
      `  <id>${this.escape(feedId)}</id>\n` +
      `  <updated>${this.escape(feedUpdated)}</updated>\n` +
      (this.config.siteUrl ? `  <link href="${this.escape(this.config.siteUrl)}" />\n` : '') +
      (items ? items + '\n' : '') +
      `</feed>\n`
    );
  }
}


