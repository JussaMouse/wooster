# Frontend WIP: HTMX + Alpine.js

## Setup & Install Steps

1. **Install Express and TypeScript types**
   ```sh
   pnpm add express @types/express
   ```
   Adds the Express web server and its TypeScript definitions for serving the frontend and handling endpoints.

2. **Create the server entry point**
   - Place your server code in `src/server/index.ts`.
   - This file sets up the Express server, serves static files, and defines endpoints for project management.

3. **Create the public HTML file**
   - Place your main HTML file at `src/server/public/index.html`.
   - This file includes HTMX and Alpine.js via CDN and provides the UI skeleton.

4. **Install the `trash` package**
   ```sh
   pnpm add trash
   ```
   This package is used to move deleted project folders to the system's recycle bin (for safe deletion from the UI).

5. **Run the server**
   ```sh
   pnpm tsx src/server/index.ts
   ```
   Starts the frontend server on `http://localhost:3000` by default.

---

A zero-build, hyper-lightweight approach to adding interactivity on top of server-driven HTML.

## 1. Include the scripts

Add the following to your `<head>`:
```html
<script src="https://unpkg.com/htmx.org@1.9.2"></script>
<script src="https://unpkg.com/alpinejs@3.x.x" defer></script>
```

## 2. Server-driven endpoints

- Build endpoints that return HTML snippets, not JSON.
- Example `GET /projects/list` returns:
  ```html
  <ul id="project-list">
    <li hx-get="/projects/delete/a-cool-drink" hx-confirm="Really delete?" hx-swap="outerHTML">
      Test Shmoodly
    </li>
    <!-- … -->
  </ul>
  ```
- HTMX attributes:
  - `hx-get`, `hx-post`, `hx-delete` to issue requests
  - `hx-target` to choose which element to update
  - `hx-swap` to control how the response is inserted

## 3. Local state & UI with Alpine.js

Wrap interactive regions in an Alpine component:
```html
<div x-data="{ showNew: false }">
  <button @click="showNew = true">+ New</button>

  <div x-show="showNew" class="modal" @click.away="showNew = false">
    <form
      hx-post="/projects/create"
      hx-target="#project-list"
      hx-swap="innerHTML"
    >
      <input name="name" placeholder="Project name" />
      <button type="submit">Create</button>
    </form>
  </div>

  <div
    id="project-list"
    hx-get="/projects/list"
    hx-trigger="load"
    hx-swap="innerHTML"
  ></div>
</div>
```

### Key points

- **Server drives state**: keep logic in your backend and return ready-to-render HTML.
- **Minimal JS**: Alpine handles local UI state and transitions; HTMX handles all XHR.
- **Zero bundler**: ship a single HTML page with two script tags and no build step.

*This page is a work in progress; adapt endpoints and selectors to match your Wooster API.* 