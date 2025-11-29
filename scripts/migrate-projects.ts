import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import slugify from 'slugify';

const projectsRoot = path.join(process.cwd(), 'projects');
const notesRoot = path.join(process.cwd(), 'notes');

// Ensure notes root exists
if (!fs.existsSync(notesRoot)) {
  fs.mkdirSync(notesRoot, { recursive: true });
}

function migrateProjects() {
  console.log('Starting project migration...');
  
  if (!fs.existsSync(projectsRoot)) {
    console.log('No projects directory found.');
    return;
  }

  const entries = fs.readdirSync(projectsRoot, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    const projectName = entry.name;
    const projectDir = path.join(projectsRoot, projectName);
    const projectNotePath = path.join(notesRoot, `proj-${projectName}.md`);
    
    // Check for existing journal/note in project dir
    const journalPath = path.join(projectDir, `${projectName}.md`);
    const promptPath = path.join(projectDir, 'prompt.txt');
    
    console.log(`Migrating project: ${projectName}`);

    let body = '';
    if (fs.existsSync(journalPath)) {
        body = fs.readFileSync(journalPath, 'utf-8');
        // Strip existing frontmatter if any? For simplicity, just append.
    } else {
        body = `# ${projectName}\n\nProject migrated from folder structure.`;
    }

    let prompt = '';
    if (fs.existsSync(promptPath)) {
        prompt = fs.readFileSync(promptPath, 'utf-8').trim();
    }

    const id = uuidv4();
    const now = Date.now();
    const created = fs.existsSync(journalPath) ? fs.statSync(journalPath).birthtimeMs : now;
    const updated = fs.existsSync(journalPath) ? fs.statSync(journalPath).mtimeMs : now;

    const frontmatter = `---
id: ${id}
type: project
title: ${projectName}
status: active
created: ${created}
updated: ${updated}
tags: ["project"]
assets_dir: projects/${projectName}
prompt: |
${prompt.split('\n').map(line => '  ' + line).join('\n')}
---
`;

    const finalContent = `${frontmatter}\n${body}`;
    
    if (!fs.existsSync(projectNotePath)) {
        fs.writeFileSync(projectNotePath, finalContent);
        console.log(`  -> Created project note: ${projectNotePath}`);
    } else {
        console.log(`  -> Project note already exists: ${projectNotePath}`);
    }
  }
  
  console.log('Migration complete.');
}

migrateProjects();

