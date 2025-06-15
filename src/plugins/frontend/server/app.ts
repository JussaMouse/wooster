import express, { RequestHandler } from 'express';
import path from 'path';
import fs from 'fs';
import slugify from 'slugify';
import trash from 'trash';
import type { AppConfig, CoreServices } from '../../../types/plugin';
import { LogLevel } from '../../../types/plugin';
import http from 'http';

function formatProjectName(slug: string): string {
    return slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export function startServer(config: AppConfig, services: CoreServices): Promise<http.Server> {
    const app = express();
    const pluginConfig = config.plugins.frontend;

    if (typeof pluginConfig !== 'object' || pluginConfig === null || !pluginConfig.enabled) {
        return Promise.reject(new Error('Frontend plugin configuration is missing, invalid, or disabled.'));
    }

    const port = pluginConfig.port || 3000;
    
    if (!config.gtd?.projectsDir) {
        throw new Error('GTD projectsDir is not defined in the configuration.');
    }
    const projectsBaseDir = path.resolve(config.gtd.projectsDir);

    app.use(express.static(path.join(__dirname, 'public')));
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());

    app.get('/projects/list', (req, res) => {
        if (!fs.existsSync(projectsBaseDir)) {
            fs.mkdirSync(projectsBaseDir, { recursive: true });
        }
        const projectSlugs = fs.readdirSync(projectsBaseDir).filter(name => {
            const projectPath = path.join(projectsBaseDir, name);
            return fs.statSync(projectPath).isDirectory() && !name.startsWith('.');
        });
        const projectListItems = projectSlugs.map(slug => {
            const humanName = formatProjectName(slug);
            const deleteUrl = `/projects/delete/${slug}`;
            return `<li id="project-item-${slug}">${humanName} <button hx-delete="${deleteUrl}" hx-confirm="Are you sure you want to delete ${humanName}?" hx-target="#project-item-${slug}" hx-swap="outerHTML">Delete</button></li>`;
        }).join('');
        res.send(`<ul id="project-list">${projectListItems}</ul>`);
    });

    app.post('/projects/create', (req, res) => {
        const name = req.body.name?.trim();
        if (!name) {
            res.status(400).send('<div style="color:red">Project name required</div>');
            return;
        }

        const slug = slugify(name, { lower: true, strict: true });
        const projectDir = path.join(projectsBaseDir, slug);

        if (fs.existsSync(projectDir)) {
            res.status(409).send('<div style="color:red">Project already exists</div>');
            return;
        }

        fs.mkdirSync(projectDir, { recursive: true });
        const journalPath = path.join(projectDir, 'journal.md');
        fs.writeFileSync(journalPath, `# Journal for ${name}\n\n`);

        const projectSlugs = fs.readdirSync(projectsBaseDir).filter(n => fs.statSync(path.join(projectsBaseDir, n)).isDirectory());
        const projectListItems = projectSlugs.map(s => {
            const humanName = formatProjectName(s);
            const deleteUrl = `/projects/delete/${s}`;
            return `<li id="project-item-${s}">${humanName} <button hx-delete="${deleteUrl}" hx-confirm="Are you sure you want to delete ${humanName}?" hx-target="#project-item-${s}" hx-swap="outerHTML">Delete</button></li>`;
        }).join('');
        res.send(`<ul id="project-list">${projectListItems}</ul>`);
    });

    app.delete('/projects/delete/:slug', (async (req, res) => {
        const slug = req.params.slug;
        const projectDir = path.join(projectsBaseDir, slug);
        const humanName = formatProjectName(slug);

        if (!fs.existsSync(projectDir)) {
            return res.status(404).send('Project not found.');
        }

        try {
            await trash(projectDir);
            services.log(LogLevel.INFO, `Project '${humanName}' moved to trash.`);
            res.send('');
        } catch (error) {
            services.log(LogLevel.ERROR, `Error deleting project ${humanName}:`, { error: error instanceof Error ? error.message : String(error) });
            res.status(500).send(`Error deleting project: ${humanName}`);
        }
    }) as RequestHandler);

    return new Promise((resolve, reject) => {
        try {
            const server = app.listen(port, () => {
                resolve(server);
            });
            server.on('error', (err) => {
                reject(err);
            });
        } catch (error) {
            reject(error);
        }
    });
} 