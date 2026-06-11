# How to Use Force Rename

Obsidian has strict rules about file naming. It prevents you from using characters like `#`, `^`, `[`, `]`, and `|` because these characters can break Markdown linking. 

However, when managing a library of PDFs or comic books, you might *want* these characters in your file names (for example, `[Group] Manga Title v01.cbz`). 

Shiori Bookshelf provides a "Force Rename" feature that bypasses Obsidian's restrictions specifically for your library files.

## Enabling Force Rename

1. Open Obsidian **Settings** -> **Shiori Bookshelf**.
2. Toggle on **"Enable Force Rename"**.

*Warning: Renaming a file with restricted characters means you will not be able to easily link to it from other markdown notes using `[[Link]]`. This feature is designed specifically for library files that you do not intend to cross-link.*

## Using Force Rename

1. In the Obsidian file explorer, **Right-click** on the folder or file you want to rename.
2. At the bottom of the context menu, just above Obsidian's default "Rename..." option, click on **Force Rename...**.
3. A popup window will appear with text boxes.

### Renaming a Folder
If you right-clicked a folder, you will see a single long text box.
- Simply type the new name, including any special characters you want (e.g., `[TranslationGroup] Series Name`).
- Press `Enter` or click the **Force Rename** button.

### Renaming a File
If you right-clicked a file (like a `.pdf` or `.cbz`), you will see **two text boxes** separated by a dot (`.`).
- **Left Box:** This is the name of the file. Type your new name here.
- **Right Box:** This is the file extension (e.g., `pdf`, `cbz`). It is usually best to leave this alone unless you need to fix a broken extension.
- Press `Enter` from either box, or click the **Force Rename** button.

*(Imagine screenshot here: The Force Rename popup showing the two text boxes for file name and extension)*

## Automated Syncing

When you use Force Rename on a book file, the plugin does more than just rename the PDF/CBZ! It automatically finds the associated `_cover.jpg` and `.md` metadata files and renames them to match the new file name exactly. This ensures your Bookshelf gallery never breaks.
