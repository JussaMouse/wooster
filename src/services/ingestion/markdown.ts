import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export interface ParsedDocument {
  title: string;
  frontmatter: any;
  blocks: ParsedBlock[];
  links: ParsedLink[];
  tags: string[];
}

export interface ParsedBlock {
  id?: string; // Will be generated if not present
  kind: 'paragraph' | 'heading' | 'code' | 'list_item' | 'blockquote';
  text: string;
  start_offset: number;
  end_offset: number;
  heading_path: string[]; // Stack of headings above this block
}

export interface ParsedLink {
  text: string;
  target: string;
  type: 'wikilink' | 'transclusion' | 'url';
  blockIndex: number; // Index in the blocks array
}

export function parseMarkdown(content: string): ParsedDocument {
  // 1. Frontmatter
  const { data, content: body } = matter(content);
  
  // Default title from frontmatter or first heading or filename (passed from outside usually, but here just fallback)
  let title = data.title || '';
  const tags: string[] = data.tags || [];
  
  // 2. Parse AST
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm);
    
  const tree = processor.parse(body);
  
  const blocks: ParsedBlock[] = [];
  const links: ParsedLink[] = [];
  const headingStack: { depth: number; text: string }[] = [];
  
  // Helper to get heading path
  const getHeadingPath = () => headingStack.map(h => h.text);

  // Helper to extract text from a node (simplified)
  const getText = (node: any): string => {
    if (node.value) return node.value;
    if (node.children) return node.children.map(getText).join('');
    return '';
  };

  // 3. Traverse AST to build blocks
  visit(tree, (node: any) => {
    const start = node.position?.start?.offset || 0;
    const end = node.position?.end?.offset || 0;
    
    // Adjust offsets for frontmatter (gray-matter strips it, but we might want original offsets if we passed full file? 
    // matter.content is the body. The offsets in 'tree' are relative to 'body'.
    // If we want global offsets, we need the length of frontmatter.
    // For now, we'll stick to body-relative offsets or just store text.
    // Storing text is safer for now.
    
    if (node.type === 'heading') {
      const text = getText(node);
      // Manage stack
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].depth >= node.depth) {
        headingStack.pop();
      }
      headingStack.push({ depth: node.depth, text });
      
      // Headings are also blocks? Yes.
      blocks.push({
        kind: 'heading',
        text,
        start_offset: start,
        end_offset: end,
        heading_path: getHeadingPath()
      });
      
      if (!title && node.depth === 1) title = text;
    } 
    else if (node.type === 'paragraph') {
      const text = getText(node);
      // Check for empty paragraphs
      if (text.trim()) {
        blocks.push({
          kind: 'paragraph',
          text,
          start_offset: start,
          end_offset: end,
          heading_path: getHeadingPath()
        });
      }
    }
    else if (node.type === 'code') {
      blocks.push({
        kind: 'code',
        text: node.value || '',
        start_offset: start,
        end_offset: end,
        heading_path: getHeadingPath()
      });
    }
    // Capture links (simple regex or AST visit inside blocks?)
    // AST visit is better but complex if we want to associate with blocks.
    // We can scan the text of blocks for wikilinks [[...]] since remark might not parse them native without plugin.
    // We'll assume standard wikilink syntax is text in standard remark.
  });

  // 4. Extract links from blocks text
  // Using regex for wikilinks [[target|alias]] or [[target]]
  const wikilinkRegex = /\[\[([^\]]+)\]\]/g;
  
  blocks.forEach((block, index) => {
    let match;
    while ((match = wikilinkRegex.exec(block.text)) !== null) {
      const content = match[1];
      const [target, alias] = content.split('|');
      links.push({
        text: alias || target,
        target: target,
        type: 'wikilink',
        blockIndex: index
      });
    }
  });

  return {
    title,
    frontmatter: data,
    blocks,
    links,
    tags
  };
}

export function computeHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

