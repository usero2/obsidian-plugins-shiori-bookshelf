# Shiori Bookshelf

Shiori Bookshelf is a powerful Obsidian plugin that transforms your vault into a beautiful, fully-featured digital library. It allows you to organize, browse your PDF, EPUB, and CBZ files natively inside Obsidian, complete with automatic cover extraction and metadata management.

## ✨ Features

- **Library Organization:**
  - **Series Libraries:** Automatically group books into series based on their subfolders.
  - **Single Libraries:** Manage standalone books independently, regardless of folder structure.
- **Beautiful Bookshelf View:**
  - A visually rich, grid-based gallery view displaying your books and series covers.
  - Search by Title or Writer.
  - Filter by reading status (*All*, *Read*, *Unread*, *Reading*).
  - Automatically sorts series by the last updated book.
  - Lazy loading with infinite scroll (loads 50 items at a time for optimal performance).
- **Automated Metadata & Covers:**
  - Automatically extracts cover images (`_cover.jpg`) from your book files.
  - Automatically generates a companion markdown (`.md`) file for each book to store reading status, writer, and title.
- **Context Menu Integration:**
  - **Add to Libraries:** Quickly add folders to your Series or Single libraries via right-click.
  - **Scan:** Manually trigger cover extraction for all books inside a folder.
  - **Open Metadata file:** Quickly jump to the hidden `.md` metadata file of any book to edit its properties.
  - **Force Rename:** Bypass Obsidian's restrictive character limits to rename files using characters like `#`, `^`, `[`, `]`, `|`. Automatically syncs the new name to the companion metadata and cover files.
- **Clean File Explorer:**
  - Options in settings to automatically hide the extracted `_cover.jpg` and metadata `.md` files from your Obsidian file explorer to keep your workspace clutter-free.

## 🚀 Installation

*Note: This plugin is currently in development and can be installed manually.*

1. Download the latest release from the GitHub repository.
2. Extract the contents (`main.js`, `manifest.json`, `styles.css`) into your Obsidian vault's plugin directory: `[Vault]/.obsidian/plugins/obsidian-plugins-shiori-bookshelf/`.
3. Open Obsidian Settings -> **Community Plugins**.
4. Refresh the plugin list and enable **Shiori Bookshelf**.

## 📖 Documentation & Guides

For detailed, step-by-step instructions on how to use specific features, please refer to the following guides:

- [How to Setup Libraries](how_to_setup_libraries.md)
- [How to Use the Bookshelf View](how_to_use_bookshelf_view.md)
- [How to Manage Metadata and Covers](how_to_manage_metadata_and_covers.md)
- [How to Use Force Rename](how_to_use_force_rename.md)

## ❤️ Support & Donate

If this plugin has improved your Obsidian workflow, saved you time, or you just want to support its continued development, please consider donating! 

Your support is incredibly appreciated, helps fix bugs, and keeps this project alive and growing. 🙏

https://buymeacoffee.com/endofday

<a href="https://www.buymeacoffee.com/endofday" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>
---
**Built with ❤️ for the Obsidian Community**
