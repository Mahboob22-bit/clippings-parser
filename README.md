# Clippings Parser

A desktop app for browsing, filtering, and exporting your Kindle highlights and notes — built with **Tauri 2**, **Rust**, **React** and **TypeScript**.

## Features

- **Load** your `My Clippings.txt` file directly from the app
- **Filter by book** — pick any title from a dropdown
- **Filter by date range** — narrow highlights to a specific period
- **View** highlights and notes side by side with metadata (page, position, date)
- **Export** filtered results to a clean `.txt` file

## Tech Stack

| Layer     | Technology                         |
|-----------|------------------------------------|
| Shell     | [Tauri 2](https://tauri.app) (Rust)|
| Parser    | Rust (`src-tauri/src/parser.rs`)   |
| Frontend  | React 19 + TypeScript              |
| Bundler   | Vite 8                             |

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs) (stable toolchain)
- [Node.js](https://nodejs.org) 18+
- [Tauri CLI prerequisites](https://tauri.app/start/prerequisites/) for your OS

### Install & Run

```bash
# Install frontend dependencies
npm install

# Start in development mode
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

The installer will be placed under `src-tauri/target/release/bundle/`.

## Usage

1. Click **"Datei laden"** and select your `My Clippings.txt` file (from your Kindle or a backup).
2. Use the **book dropdown** to select a specific title (or leave it on "Alle Bücher").
3. Optionally set a **date range** with the date pickers.
4. Browse your highlights and notes in the list.
5. Click **"Exportieren"** to save the filtered results as a `.txt` file.

## Clippings File Format

The app parses the standard Kindle clippings format:

```
==========
Book Title (Author Name)
- Ihre Markierung auf Seite 42 | bei Position 640-641 | Hinzugefügt am ...
The highlighted text goes here.
==========
```

Both German and English Kindle UI variants are supported.

## License

MIT
