import express from 'express';
import path from 'path';
import fs from 'fs';
import { loadConfig } from '../configLoader';
import trash from 'trash';

const app = express();
const port = 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Convert a slug (hyphens/underscores) into spaced, capitalized words
function formatProjectName(slug: string): string {
    return slug
      .split(/[-_]/g)
      .map(token => token.charAt(0).toUpperCase() + token.slice(1))
      .join(' ');
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/projects/list', (req, res) => {
    const config = loadConfig();
    const projectsBaseDir = config.gtd?.projectsDir ? path.resolve(config.gtd.projectsDir) : path.join(process.cwd(), 'projects');

    if (!fs.existsSync(projectsBaseDir)) {
        console.error(`Error: Projects base directory '${projectsBaseDir}' not found.`);
        res.status(500).send('Error: Projects directory not found.');
        return;
    }

    try {
        const projectSlugs = fs.readdirSync(projectsBaseDir).filter(name =>
            fs.statSync(path.join(projectsBaseDir, name)).isDirectory()
        );

        if (projectSlugs.length === 0) {
            res.send('<ul><li>No projects found.</li></ul>');
            return;
        }
        
        const projectListItems = projectSlugs.map(slug => {
            const humanName = formatProjectName(slug);
            return `<li hx-get="/projects/delete/${slug}" hx-confirm="Really delete ${humanName}?" hx-swap="outerHTML">${humanName}</li>`;
        }).join('');

        res.send(`<ul id="project-list">${projectListItems}</ul>`);

    } catch (err: any) {
        console.error(`Error reading project directories from ${projectsBaseDir}: ${err.message}`);
        res.status(500).send('Error: Could not list project directories.');
    }
});

app.get('/projects/delete/:slug', async (req, res) => {
    const { slug } = req.params;
    const config = loadConfig();
    const projectsBaseDir = config.gtd?.projectsDir ? path.resolve(config.gtd.projectsDir) : path.join(process.cwd(), 'projects');
    const projectDir = path.join(projectsBaseDir, slug);

    if (!fs.existsSync(projectDir)) {
        res.status(404).send('Project not found.');
        return;
    }

    try {
        await trash([projectDir]);
        res.send(''); // HTMX will remove the element
    } catch (err: any) {
        console.error(`Error deleting project ${slug}: ${err.message}`);
        res.status(500).send('Error deleting project.');
    }
});

app.post('/projects/create', (req, res) => {
    const name = req.body.name?.trim();
    if (!name) {
        res.status(400).send('Project name required');
        return;
    }
    const config = loadConfig();
    const projectsBaseDir = config.gtd?.projectsDir ? path.resolve(config.gtd.projectsDir) : path.join(process.cwd(), 'projects');
    if (!fs.existsSync(projectsBaseDir)) {
        fs.mkdirSync(projectsBaseDir, { recursive: true });
    }
    // Slugify: lowercase, replace spaces with hyphens, remove non-alphanum
    const slug = name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
    const projectDir = path.join(projectsBaseDir, slug);
    if (fs.existsSync(projectDir)) {
        res.status(409).send('Project already exists');
        return;
    }
    fs.mkdirSync(projectDir);
    // Create a journal file (optional, matches terminal behavior)
    const journalPath = path.join(projectDir, 'journal.md');
    fs.writeFileSync(journalPath, `# Journal for ${name}\n\n`);
    // Return updated project list
    const projectSlugs = fs.readdirSync(projectsBaseDir).filter(n => fs.statSync(path.join(projectsBaseDir, n)).isDirectory());
    const projectListItems = projectSlugs.map(slug => {
        const humanName = formatProjectName(slug);
        return `<li hx-get=\"/projects/delete/${slug}\" hx-confirm=\"Really delete ${humanName}?\" hx-swap=\"outerHTML\">${humanName}</li>`;
    }).join('');
    res.send(`<ul id=\"project-list\">${projectListItems}</ul>`);
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
}); 