# How to Manage Metadata and Covers

Shiori Bookshelf relies on two "companion" files for every book to make the library function perfectly: a Cover Image and a Metadata file.

## 1. Automated Cover Extraction

When you add a new PDF, EPUB, or CBZ file to a folder that is part of your library, the plugin will automatically attempt to extract its cover.

- The extracted cover is saved in the exact same folder as the book.
- It is named `[Book Name]_cover.jpg`.
- This image is what you see in the beautiful Bookshelf gallery view.

### Manual Scanning
Sometimes you might add hundreds of books at once, or a cover extraction might fail. You can manually force the plugin to scan a folder and extract any missing covers:

1. Right-click on the folder in the Obsidian file explorer.
2. Select **Scan**.
3. A notice will appear in the top right corner indicating how many missing covers were successfully extracted.

*(Imagine screenshot here: Right-clicking a library folder and selecting "Scan")*

## 2. The Metadata File

To keep track of details like the author and whether you have finished reading a book, the plugin creates a companion markdown (`.md`) file.

- It is named exactly the same as your book (e.g., `MyBook.pdf` will have a metadata file called `MyBook.md`).
- This file contains YAML frontmatter where the data is stored.

### Editing Metadata
You can edit this data directly from the Bookshelf View using the dropdowns and inputs below the cover, OR you can manually edit the file.

To quickly open a book's metadata file:
1. Right-click on the book file (e.g., the PDF or EPUB) in the Obsidian file explorer.
2. Click **Open Metadata file**.
3. The `.md` file will open in a new tab, allowing you to edit properties like `writer`, `status`, and `title`.

*(Imagine screenshot here: Right-clicking a PDF and selecting "Open Metadata file")*

## 3. Hiding Companion Files

Having a `_cover.jpg` and a `.md` file for every single book can quickly clutter your Obsidian file explorer. You can hide them to keep your workspace clean!

1. Open Obsidian **Settings** -> **Shiori Bookshelf**.
2. Toggle on **"Hide cover images in file explorer"**.
3. Toggle on **"Hide book metadata files"**.

Once enabled, these files will become completely invisible in the left sidebar, but they will still exist and power your library perfectly in the background.
