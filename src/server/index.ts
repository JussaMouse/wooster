import express from 'express';
import path from 'path';
import fs from 'fs';
import { loadConfig } from '../configLoader';

const app = express();
const port = 3000;

app.use(express.static(path.join(__dirname, 'public')));

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

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
}); 