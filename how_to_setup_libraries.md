# How to Setup Libraries

Shiori Bookshelf uses "Libraries" to determine which folders in your vault contain your books. You can categorize your folders into two types of libraries: **Series Libraries** and **Single Libraries**.

## Series vs. Single Libraries

- **Series Libraries:** Folders added here will automatically group books into "Series" based on their immediate parent subfolder. For example, if you add the `Manga` folder as a Series Library, the books inside `Manga/One Piece` will be grouped into a series named "One Piece".
- **Single Libraries:** Folders added here will treat every book as an individual, standalone item. Subfolders are ignored for grouping purposes. This is perfect for standalone Ebooks or textbooks.

## Method 1: Setting up via the Context Menu (Recommended)

The easiest way to add folders to your libraries is directly from the Obsidian file explorer.

1. Locate the folder you want to use as a library in Obsidian's file explorer on the left.
2. **Right-click** the folder.
3. In the context menu, you will see two options:
   - **Add to Series Libraries**
   - **Add to Single Libraries**
4. Click the appropriate option. You will see a notice confirming that the folder has been added.

*(Imagine screenshot here: Right-clicking a folder showing the "Add to Series Libraries" and "Add to Single Libraries" options)*

## Method 2: Setting up via Plugin Settings

You can also manage your libraries manually in the plugin settings.

1. Open Obsidian **Settings** (gear icon).
2. Scroll down to **Community Plugins** and click on **Shiori Bookshelf**.
3. Locate the **Series Libraries** and **Single Libraries** text boxes.
4. Type or paste the exact paths to your folders, **one folder per line**. 
   - *Example:*
     ```
     Libraries/Manga
     Libraries/Comics
     ```
5. The plugin automatically saves your changes as you type.

*(Imagine screenshot here: The settings page showing the text areas for Series and Single libraries)*

## Ignoring Folders

If you have specific subfolders inside your libraries that you do not want to be scanned (e.g., a folder containing assets or templates), you can add them to the ignore list.

1. Open the Shiori Bookshelf **Settings**.
2. Scroll down to **Ignore Folders**.
3. Enter a comma-separated list of folder names to ignore. By default, `_ignore` is already added.
4. Any folder with this exact name will be completely skipped during the scanning process.
