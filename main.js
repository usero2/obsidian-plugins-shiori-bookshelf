const { Plugin, PluginSettingTab, Setting, ItemView, Notice, Modal, requestUrl } = require('obsidian');

const VIEW_TYPE_BOOKSHELF = "bookshelf-view";
const VIEW_TYPE_SERIES_DETAILS = "series-details-view";
const VIEW_TYPE_DUMMY_EXT = "bookshelf-dummy-ext-view";

const DEFAULT_SETTINGS = {
    libraries: "Lite Novel\nManga",
    singleLibraries: "",
    extensions: "pdf,epub,cbz,cbr,mobi",
    hideCoverFiles: true,
    setAsHomepage: false,
    hideBookMdFiles: false,
    ignoreFolders: "_ignore",
    enableForceRename: false,
    geminiApiKey: "",
    geminiModel: "gemini-1.5-flash",
    enableWebServer: false,
    webServerPort: 7070
};

// --- Helper Functions ---
function applyGridStyle(grid) {
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(140px, 1fr))";
    grid.style.gap = "20px";
}

function applyCardStyle(card) {
    card.style.border = "1px solid var(--background-modifier-border)";
    card.style.borderRadius = "8px";
    card.style.padding = "10px";
    card.style.cursor = "pointer";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.background = "var(--background-secondary)";
    card.style.transition = "transform 0.2s, box-shadow 0.2s";
    card.style.height = "100%";
    card.onmouseover = () => {
        card.style.transform = "translateY(-4px)";
        card.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
    };
    card.onmouseout = () => {
        card.style.transform = "translateY(0)";
        card.style.boxShadow = "none";
    };
}

function applyCoverStyle(cover) {
    cover.style.position = "relative";
    cover.style.width = "100%";
    cover.style.aspectRatio = "2/3";
    cover.style.backgroundColor = "var(--background-modifier-active-hover)";
    cover.style.borderRadius = "4px";
    cover.style.marginBottom = "10px";
    cover.style.display = "flex";
    cover.style.alignItems = "center";
    cover.style.justifyContent = "center";
    cover.style.overflow = "hidden";
}

function getCoverUrl(plugin, coverImg, contextPath) {
    if (!coverImg) return null;
    if (coverImg.startsWith("http")) return coverImg;
    let coverFile = plugin.app.metadataCache.getFirstLinkpathDest(coverImg, contextPath);
    if (coverFile) {
        return plugin.app.vault.getResourcePath(coverFile);
    }
    
    if (coverImg.includes("/")) {
        let filename = coverImg.split("/").pop();
        let fallbackFile = plugin.app.metadataCache.getFirstLinkpathDest(filename, contextPath);
        if (fallbackFile) {
            return plugin.app.vault.getResourcePath(fallbackFile);
        }
    }
    
    return null;
}

function openBook(plugin, bookFile) {
    if (!bookFile) return;
    const ext = bookFile.extension ? bookFile.extension.toLowerCase() : "";
    const viewType = plugin.app.viewRegistry ? plugin.app.viewRegistry.getTypeByExtension(ext) : null;
    
    if (viewType && viewType !== VIEW_TYPE_DUMMY_EXT) {
        plugin.app.workspace.getLeaf(false).openFile(bookFile);
    } else {
        plugin.app.openWithDefaultApp(bookFile.path);
    }
}

function attachBookContextMenu(element, book, plugin) {
    element.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        const { Menu, Notice, Modal } = require("obsidian");
        const menu = new Menu();
        
        menu.addItem((item) => {
            item.setTitle("Open in new windows")
                .setIcon("popup-open")
                .onClick(() => {
                    plugin.app.workspace.getLeaf('window').openFile(book.file);
                });
        });
        
        menu.addSeparator();
        
        menu.addItem((item) => {
            item.setTitle("Copy path");
            item.setIcon("link");
            if (item.setSubmenu) {
                const sub = item.setSubmenu();
                sub.addItem((s) => s.setTitle("as Obsidian URL").onClick(() => {
                    const url = `obsidian://open?vault=${encodeURIComponent(plugin.app.vault.getName())}&file=${encodeURIComponent(book.file.path)}`;
                    navigator.clipboard.writeText(url);
                    new Notice("Obsidian URL copied");
                }));
                sub.addItem((s) => s.setTitle("from vault folder").onClick(() => {
                    navigator.clipboard.writeText(book.file.path);
                    new Notice("Vault path copied");
                }));
                sub.addItem((s) => s.setTitle("from system root").onClick(() => {
                    const absPath = plugin.app.vault.adapter.getBasePath() + "/" + book.file.path;
                    navigator.clipboard.writeText(absPath.replace(/\\/g, '/'));
                    new Notice("System root path copied");
                }));
            }
        });
        
        menu.addSeparator();
        
        menu.addItem((item) => {
            item.setTitle("Open in default app")
                .setIcon("popup-open")
                .onClick(() => {
                    plugin.app.openWithDefaultApp(book.file.path);
                });
        });
        
        menu.addItem((item) => {
            item.setTitle("Show in system explorer")
                .setIcon("folder")
                .onClick(() => {
                    plugin.app.showInFolder(book.file.path);
                });
        });
        
        menu.addItem((item) => {
            item.setTitle("Reveal file in navigation")
                .setIcon("folder")
                .onClick(() => {
                    const fileExplorer = plugin.app.internalPlugins.getPluginById("file-explorer");
                    if (fileExplorer && fileExplorer.instance) {
                        fileExplorer.instance.revealInFolder(book.file);
                    }
                });
        });
        
        menu.addSeparator();
        
        menu.addItem((item) => {
            item.setTitle("Regenerate Cover")
                .setIcon("image-file")
                .onClick(async () => {
                    new Notice("Regenerating cover for " + book.file.name + "...");
                    try {
                        await plugin.extractCover(book.file);
                        new Notice("Cover regenerated!");
                    } catch(e) {
                        new Notice("Failed: " + e.message);
                    }
                    const bsLeaves = plugin.app.workspace.getLeavesOfType("bookshelf-view");
                    bsLeaves.forEach(l => l.view.renderBookshelf());
                    const sdLeaves = plugin.app.workspace.getLeavesOfType("series-details-view");
                    sdLeaves.forEach(l => l.view.renderDetails());
                });
        });
        
        menu.addItem((item) => {
            item.setTitle("Open Metadata file")
                .setIcon("file-text")
                .onClick(async () => {
                    let mdFile = plugin.app.vault.getAbstractFileByPath(book.metadataFile);
                    if (mdFile instanceof require('obsidian').TFile) {
                        plugin.app.workspace.getLeaf(false).openFile(mdFile);
                    } else {
                        new Notice("Metadata file not found.");
                    }
                });
        });
        
        menu.addItem((item) => {
            item.setTitle("Force Rename...")
                .setIcon("pencil")
                .onClick(() => {
                    new ForceRenameModal(plugin.app, book.file, plugin).open();
                });
        });
        
        menu.addSeparator();
        
        menu.addItem((item) => {
            item.setTitle("Rename...")
                .setIcon("pencil")
                .onClick(() => {
                    new BasicRenameModal(plugin.app, book.file, plugin).open();
                });
        });
        
        menu.addItem((item) => {
            item.setTitle("Delete")
                .setIcon("trash")
                .onClick(async () => {
                    const confirm = new Modal(plugin.app);
                    confirm.contentEl.createEl("h3", { text: `Delete ${book.basename}?` });
                    const btnRow = confirm.contentEl.createDiv({ cls: "modal-button-container" });
                    btnRow.style.display = "flex"; btnRow.style.gap = "10px"; btnRow.style.marginTop = "20px";
                    const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
                    cancelBtn.onclick = () => confirm.close();
                    const delBtn = btnRow.createEl("button", { text: "Delete", cls: "mod-warning" });
                    delBtn.onclick = async () => {
                        await plugin.app.fileManager.trashFile(book.file);
                        new Notice(book.file.name + " deleted.");
                        confirm.close();
                        const bsLeaves = plugin.app.workspace.getLeavesOfType("bookshelf-view");
                        bsLeaves.forEach(l => l.view.renderBookshelf());
                        const sdLeaves = plugin.app.workspace.getLeavesOfType("series-details-view");
                        sdLeaves.forEach(l => l.view.renderDetails());
                    };
                    confirm.open();
                });
        });
        
        menu.showAtMouseEvent(ev);
    });
}

function attachSeriesContextMenu(element, series, plugin) {
    if (series.id.startsWith("standalone-") && series.books.length > 0) {
        attachBookContextMenu(element, series.books[0], plugin);
        return;
    }
    
    element.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        const { Menu, Notice, Modal, TFile } = require("obsidian");
        const menu = new Menu();
        
        let targetFolder = plugin.app.vault.getAbstractFileByPath(series.id);
        
        menu.addItem((item) => {
            item.setTitle("Open in new windows")
                .setIcon("popup-open")
                .onClick(async () => {
                    const leaf = plugin.app.workspace.getLeaf('window');
                    await leaf.setViewState({
                        type: "series-details-view",
                        active: true,
                        state: { seriesId: series.id }
                    });
                });
        });
        
        menu.addSeparator();
        
        menu.addItem((item) => {
            item.setTitle("Copy path");
            item.setIcon("link");
            if (item.setSubmenu) {
                const sub = item.setSubmenu();
                sub.addItem((s) => s.setTitle("as Obsidian URL").onClick(() => {
                    const url = `obsidian://open?vault=${encodeURIComponent(plugin.app.vault.getName())}&file=${encodeURIComponent(series.id)}`;
                    navigator.clipboard.writeText(url);
                    new Notice("Obsidian URL copied");
                }));
                sub.addItem((s) => s.setTitle("from vault folder").onClick(() => {
                    navigator.clipboard.writeText(series.id);
                    new Notice("Vault path copied");
                }));
                sub.addItem((s) => s.setTitle("from system root").onClick(() => {
                    const absPath = plugin.app.vault.adapter.getBasePath() + "/" + series.id;
                    navigator.clipboard.writeText(absPath.replace(/\\/g, '/'));
                    new Notice("System root path copied");
                }));
            }
        });
        
        menu.addSeparator();
        
        menu.addItem((item) => {
            item.setTitle("Show in system explorer")
                .setIcon("folder")
                .onClick(() => {
                    plugin.app.showInFolder(series.id);
                });
        });
        
        menu.addItem((item) => {
            item.setTitle("Reveal in navigation")
                .setIcon("folder")
                .onClick(() => {
                    if (targetFolder) {
                        const fileExplorer = plugin.app.internalPlugins.getPluginById("file-explorer");
                        if (fileExplorer && fileExplorer.instance) {
                            fileExplorer.instance.revealInFolder(targetFolder);
                        }
                    } else {
                        new Notice("Folder not found in vault.");
                    }
                });
        });
        
        menu.addSeparator();
        
        menu.addItem((item) => {
            item.setTitle("Regenerate Cover")
                .setIcon("image-file")
                .onClick(async () => {
                    if (targetFolder) {
                        await plugin.extractMissingCoversForFolder(targetFolder);
                    }
                });
        });
        
        menu.addItem((item) => {
            item.setTitle("Open Metadata file")
                .setIcon("file-text")
                .onClick(async () => {
                    let seriesMdPath = `${series.id}/${series.name}.md`;
                    let mdFile = plugin.app.vault.getAbstractFileByPath(seriesMdPath);
                    if (mdFile instanceof TFile) {
                        plugin.app.workspace.getLeaf(false).openFile(mdFile);
                    } else {
                        new Notice("Series metadata file not found.");
                    }
                });
        });

        if (targetFolder) {
            menu.addItem((item) => {
                item.setTitle("Force Rename...")
                    .setIcon("pencil")
                    .onClick(() => {
                        new ForceRenameModal(plugin.app, targetFolder, plugin).open();
                    });
            });
            
            menu.addSeparator();
            
            menu.addItem((item) => {
                item.setTitle("Rename...")
                    .setIcon("pencil")
                    .onClick(() => {
                        new BasicRenameModal(plugin.app, targetFolder, plugin).open();
                    });
            });
            
            menu.addItem((item) => {
                item.setTitle("Delete")
                    .setIcon("trash")
                    .onClick(async () => {
                        const confirm = new Modal(plugin.app);
                        confirm.contentEl.createEl("h3", { text: `Delete folder ${targetFolder.name}?` });
                        const btnRow = confirm.contentEl.createDiv({ cls: "modal-button-container" });
                        btnRow.style.display = "flex"; btnRow.style.gap = "10px"; btnRow.style.marginTop = "20px";
                        const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
                        cancelBtn.onclick = () => confirm.close();
                        const delBtn = btnRow.createEl("button", { text: "Delete", cls: "mod-warning" });
                        delBtn.onclick = async () => {
                            await plugin.app.fileManager.trashFile(targetFolder);
                            new Notice(targetFolder.name + " deleted.");
                            confirm.close();
                            const bsLeaves = plugin.app.workspace.getLeavesOfType("bookshelf-view");
                            bsLeaves.forEach(l => l.view.renderBookshelf());
                        };
                        confirm.open();
                    });
            });
        }
        
        menu.showAtMouseEvent(ev);
    });
}

function renderBooks(grid, books, plugin) {
    grid.empty();
    for (let book of books) {
        let card = grid.createDiv({ cls: "bookshelf-card" });
        applyCardStyle(card);

        let cover = card.createDiv({ cls: "bookshelf-cover" });
        applyCoverStyle(cover);
        
        let coverImg = book.metadata.cover || null;
        let coverUrl = getCoverUrl(plugin, coverImg, book.file.path);

        if (coverUrl) {
            let img = cover.createEl("img");
            img.src = coverUrl;
            img.style.width = "100%";
            img.style.height = "100%";
            img.style.objectFit = "cover";
        } else {
            let fallback = cover.createEl("span", { text: book.extension.toUpperCase() });
            fallback.style.color = "var(--text-muted)";
            fallback.style.fontWeight = "bold";
            fallback.style.fontSize = "24px";
        }

        // Distinct styling for Book cards
        card.style.background = "var(--background-primary)";
        card.style.border = "1px solid var(--background-modifier-border)";

        let titleText = book.metadata.title || book.basename;
        let title = card.createEl("div", { text: titleText, cls: "bookshelf-item-title" });
        title.style.fontWeight = "bold";
        title.style.wordBreak = "break-word";
        title.style.fontSize = "14px";
        title.style.lineHeight = "1.2";
        title.style.maxHeight = "2.4em";
        title.style.overflow = "hidden";
        title.style.textOverflow = "ellipsis";
        title.style.display = "-webkit-box";
        title.style.webkitLineClamp = "2";
        title.style.webkitBoxOrient = "vertical";
        
        let authorText = book.metadata.author || "";
        if (authorText) {
            let author = card.createEl("div", { text: authorText, cls: "bookshelf-item-author" });
            author.style.fontSize = "12px";
            author.style.color = "var(--text-muted)";
            author.style.marginTop = "4px";
            author.style.overflow = "hidden";
            author.style.textOverflow = "ellipsis";
            author.style.whiteSpace = "nowrap";
        }

        let footer = card.createDiv();
        footer.style.marginTop = "auto";
        footer.style.paddingTop = "8px";

        let extLabel = footer.createEl("span", { text: book.extension, cls: "bookshelf-ext" });
        extLabel.style.fontSize = "10px";
        extLabel.style.color = "var(--text-faint)";
        extLabel.style.textTransform = "uppercase";
        extLabel.style.padding = "2px 6px";
        extLabel.style.background = "var(--background-modifier-border)";
        extLabel.style.borderRadius = "4px";

        card.onclick = () => {
            openBook(plugin, book.file);
        };
        
        attachBookContextMenu(card, book, plugin);
    }
}
class BasicRenameModal extends Modal {
    constructor(app, targetFile, plugin) {
        super(app);
        this.targetFile = targetFile;
        this.plugin = plugin;
    }
    onOpen() {
        const {contentEl} = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: `Rename` });
        const input = contentEl.createEl("input", { type: "text", value: this.targetFile.basename });
        input.style.width = "100%";
        input.style.marginBottom = "15px";
        const btnRow = contentEl.createDiv();
        btnRow.style.cssText = "display:flex; justify-content:flex-end; gap:10px;";
        const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
        cancelBtn.onclick = () => this.close();
        const renameBtn = btnRow.createEl("button", { text: "Rename", cls: "mod-cta" });
        
        const doRename = async () => {
            if (input.value && input.value !== this.targetFile.basename) {
                try {
                    let newPath = "";
                    if (this.targetFile.parent.path === "/") newPath = input.value + "." + this.targetFile.extension;
                    else newPath = this.targetFile.parent.path + "/" + input.value + "." + this.targetFile.extension;
                    await this.plugin.app.fileManager.renameFile(this.targetFile, newPath);
                    new (require("obsidian").Notice)("Renamed to " + input.value);
                } catch(e) {
                    new (require("obsidian").Notice)("Failed to rename: " + e.message);
                }
            }
            this.close();
            const bsLeaves = this.plugin.app.workspace.getLeavesOfType("bookshelf-view");
            bsLeaves.forEach(l => l.view.renderBookshelf());
            const sdLeaves = this.plugin.app.workspace.getLeavesOfType("series-details-view");
            sdLeaves.forEach(l => l.view.renderDetails());
        };
        renameBtn.onclick = doRename;
        input.addEventListener("keydown", (e) => { if(e.key==="Enter") doRename(); });
    }
    onClose() { this.contentEl.empty(); }
}

class ForceRenameModal extends Modal {
    constructor(app, targetFile, plugin) {
        super(app);
        this.targetFile = targetFile;
        this.plugin = plugin;
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: `Force Rename` });
        
        contentEl.createEl("p", { text: `Warning: Force renaming to include restricted characters (#, ^, [, ], |) will break markdown links to this file.` }).style.color = "var(--text-error)";
        contentEl.createEl("p", { text: `This is an override for Series/Single libraries only.` }).style.fontSize = "12px";

        const currentName = this.targetFile.name;
        const isFolder = !!this.targetFile.children;
        const currentBase = isFolder ? currentName : (this.targetFile.basename || currentName.substring(0, currentName.lastIndexOf('.')) || currentName);
        const currentExt = isFolder ? "" : this.targetFile.extension;
        
        const inputRow = contentEl.createDiv();
        inputRow.style.cssText = "display:flex; align-items:center; gap:5px; margin-bottom:15px;";

        const nameInput = inputRow.createEl("input", { type: "text" });
        nameInput.value = currentBase;
        nameInput.style.flex = "1";

        let extInput = null;
        if (!isFolder && currentExt !== undefined) {
            inputRow.createEl("span", { text: "." });
            extInput = inputRow.createEl("input", { type: "text" });
            extInput.value = currentExt;
            extInput.style.width = "60px";
        }

        const btnRow = contentEl.createDiv();
        btnRow.style.cssText = "display:flex; justify-content:flex-end; gap:10px;";
        
        const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
        cancelBtn.onclick = () => this.close();
        
        const renameBtn = btnRow.createEl("button", { text: "Force Rename" });
        renameBtn.style.background = "var(--interactive-normal)";
        renameBtn.style.color = "var(--text-error)";
        renameBtn.style.border = "1px solid var(--text-error)";
        renameBtn.onclick = async () => {
            const newBaseName = nameInput.value.trim();
            const newExt = extInput ? extInput.value.trim() : "";
            const newName = newExt ? `${newBaseName}.${newExt}` : newBaseName;

            if (!newName || newName === currentName) {
                this.close();
                return;
            }
            
            renameBtn.disabled = true;
            renameBtn.innerText = "Renaming...";
            
            try {
                let parentPath = this.targetFile.parent ? this.targetFile.parent.path : "";
                let newPath = parentPath === "/" || !parentPath ? newName : parentPath + "/" + newName;
                
                let oldBase = this.targetFile.basename || currentName.substring(0, currentName.lastIndexOf('.'));
                let newBase = newName;
                if (newName.includes('.')) {
                    newBase = newName.substring(0, newName.lastIndexOf('.'));
                }

                let renameFile = async (oPath, nPath) => {
                    if (this.app.vault.adapter.rename) {
                        try {
                            if (await this.app.vault.adapter.exists(oPath)) {
                                await this.app.vault.adapter.rename(oPath, nPath);
                            }
                        } catch (e) {}
                    } else if (this.app.vault.adapter.getBasePath) {
                        let fs = require('fs');
                        let path = require('path');
                        let basePath = this.app.vault.adapter.getBasePath();
                        let oldP = path.join(basePath, oPath);
                        let newP = path.join(basePath, nPath);
                        if (fs.existsSync(oldP)) fs.renameSync(oldP, newP);
                    }
                };

                // Rename main file
                await renameFile(this.targetFile.path, newPath);

                if (!this.targetFile.children) {
                    let oldMd = (parentPath === "/" || !parentPath) ? oldBase + ".md" : parentPath + "/" + oldBase + ".md";
                    let newMd = (parentPath === "/" || !parentPath) ? newBase + ".md" : parentPath + "/" + newBase + ".md";
                    await renameFile(oldMd, newMd);

                    let safeOld = oldBase.replace(/[/\\?%*:|"<>]/g, '-');
                    let safeNew = newBase.replace(/[/\\?%*:|"<>]/g, '-');
                    let oldCov = (parentPath === "/" || !parentPath) ? safeOld + "_cover.jpg" : parentPath + "/" + safeOld + "_cover.jpg";
                    let newCov = (parentPath === "/" || !parentPath) ? safeNew + "_cover.jpg" : parentPath + "/" + safeNew + "_cover.jpg";
                    await renameFile(oldCov, newCov);
                }
                
                new Notice("Force renamed successfully.");
                this.close();
            } catch (e) {
                console.error("Force rename failed", e);
                new Notice("Force rename failed: " + e.message);
                renameBtn.disabled = false;
                renameBtn.innerText = "Force Rename";
            }
        };

        const handleEnter = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                renameBtn.click();
            }
        };
        nameInput.addEventListener("keydown", handleEnter);
        if (extInput) extInput.addEventListener("keydown", handleEnter);
    }
    
    onClose() {
        this.contentEl.empty();
    }
}

// -----------------------

class EditSeriesMetadataModal extends Modal {
    constructor(app, series, seriesMeta, plugin) {
        super(app);
        this.series = series;
        this.seriesMeta = seriesMeta;
        this.plugin = plugin;
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.empty();
        
        const headerContainer = contentEl.createDiv();
        headerContainer.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;";
        headerContainer.createEl("h2", { text: `Edit Metadata: ${this.series.name}` }).style.margin = "0";
        
        const autoFillBtn = headerContainer.createEl("button", { text: "✨ Auto Fill" });
        autoFillBtn.style.cssText = "padding: 6px 12px; font-weight: bold; border-radius: 4px; background: var(--interactive-accent); color: var(--text-on-accent); cursor: pointer; border: none;";

        const data = this.plugin.getLibraryData();
        let allGenres = new Set();
        let allTags = new Set();
        data.series.forEach(s => {
            if (s.metadata) {
                let g1 = s.metadata.genres;
                if (Array.isArray(g1)) g1.forEach(x => allGenres.add(String(x).trim()));
                else if (typeof g1 === "string") g1.split(",").forEach(x => allGenres.add(x.trim()));
                let g2 = s.metadata.genre;
                if (Array.isArray(g2)) g2.forEach(x => allGenres.add(String(x).trim()));
                else if (typeof g2 === "string") g2.split(",").forEach(x => allGenres.add(x.trim()));
                
                let t1 = s.metadata.tags;
                if (Array.isArray(t1)) t1.forEach(x => allTags.add(String(x).trim()));
                else if (typeof t1 === "string") t1.split(",").forEach(x => allTags.add(x.trim()));
                let t2 = s.metadata.tag;
                if (Array.isArray(t2)) t2.forEach(x => allTags.add(String(x).trim()));
                else if (typeof t2 === "string") t2.split(",").forEach(x => allTags.add(x.trim()));
            }
        });
        allGenres.delete("");
        allTags.delete("");
        let sortedGenres = Array.from(allGenres).sort((a,b) => a.localeCompare(b));
        let sortedTags = Array.from(allTags).sort((a,b) => a.localeCompare(b));

        const form = contentEl.createDiv({ cls: "bookshelf-edit-form" });
        form.style.cssText = "display:flex; flex-direction:column; gap:10px; max-height: 60vh; overflow-y: auto; padding-right: 10px;";

        const createInput = (label, value, isTextArea = false, suggestions = null) => {
            const row = form.createDiv();
            row.style.cssText = "display:flex; flex-direction:column; gap:4px;";
            row.createEl("label", { text: label }).style.fontWeight = "bold";
            
            const inputContainer = row.createDiv();
            inputContainer.style.cssText = "position:relative; width:100%; display:flex; flex-direction:column;";
            
            let input;
            if (isTextArea) {
                input = inputContainer.createEl("textarea");
                input.rows = 4;
            } else {
                input = inputContainer.createEl("input", { type: "text" });
            }
            input.value = value || "";
            input.style.width = "100%";
            
            if (suggestions && suggestions.length > 0) {
                const suggDiv = row.createDiv();
                suggDiv.style.cssText = "display:flex; flex-wrap:wrap; gap:4px; margin-top:2px;";
                suggestions.forEach(s => {
                    const pill = suggDiv.createEl("span", { text: s });
                    pill.style.cssText = "font-size:10px; padding:2px 6px; background:var(--background-secondary); border:1px solid var(--background-modifier-border); border-radius:4px; cursor:pointer; color:var(--text-muted); transition:color 0.15s;";
                    pill.onmouseover = () => pill.style.color = "var(--text-normal)";
                    pill.onmouseout = () => pill.style.color = "var(--text-muted)";
                    pill.onclick = () => {
                        let parts = input.value.split(",").map(x => x.trim()).filter(x => x);
                        if (!parts.includes(s)) {
                            parts.push(s);
                            input.value = parts.join(", ");
                        }
                    };
                });
                
                const dropdown = inputContainer.createDiv();
                dropdown.style.cssText = "display:none; position:absolute; top:calc(100% + 2px); left:0; width:100%; max-height:150px; overflow-y:auto; background:var(--background-primary); border:1px solid var(--background-modifier-border); border-radius:4px; z-index:100; box-shadow:0 4px 10px rgba(0,0,0,0.2);";
                
                let activeIndex = -1;
                let currentMatches = [];
                let dropdownItems = [];
                let currentWord = "";
                let currentWordStart = 0;
                let currentWordEnd = 0;

                const closeDropdown = () => { 
                    dropdown.style.display = "none"; 
                    activeIndex = -1;
                    currentMatches = [];
                    dropdownItems = [];
                };

                const selectItem = (m) => {
                    const fullText = input.value;
                    const pre = fullText.substring(0, currentWordStart);
                    const post = fullText.substring(currentWordEnd);
                    
                    let preClean = pre.trim();
                    if (preClean.length > 0 && !preClean.endsWith(",")) preClean += ", ";
                    else if (preClean.endsWith(",")) preClean += " ";
                    
                    let postClean = post.trim();
                    if (postClean.startsWith(",")) postClean = postClean.substring(1).trim();
                    if (postClean.length > 0) postClean = ", " + postClean;
                    
                    input.value = preClean + m + postClean;
                    closeDropdown();
                    input.focus();
                };

                const updateDropdownVisuals = () => {
                    dropdownItems.forEach((el, i) => {
                        if (i === activeIndex) {
                            el.style.background = "var(--background-modifier-hover)";
                            el.scrollIntoView({ block: "nearest" });
                        } else {
                            el.style.background = "transparent";
                        }
                    });
                };

                input.addEventListener("keydown", (ev) => {
                    if (dropdown.style.display === "block" && currentMatches.length > 0) {
                        if (ev.key === "ArrowDown") {
                            ev.preventDefault();
                            activeIndex = (activeIndex + 1) % currentMatches.length;
                            updateDropdownVisuals();
                        } else if (ev.key === "ArrowUp") {
                            ev.preventDefault();
                            activeIndex = (activeIndex - 1 + currentMatches.length) % currentMatches.length;
                            updateDropdownVisuals();
                        } else if (ev.key === "Enter") {
                            ev.preventDefault();
                            if (activeIndex >= 0 && activeIndex < currentMatches.length) {
                                selectItem(currentMatches[activeIndex]);
                            } else {
                                selectItem(currentMatches[0]);
                            }
                        } else if (ev.key === "Escape") {
                            closeDropdown();
                        }
                    }
                });
                
                input.addEventListener("input", () => {
                    const cursor = input.selectionStart;
                    const text = input.value;
                    const beforeCursor = text.substring(0, cursor);
                    const lastComma = beforeCursor.lastIndexOf(",");
                    currentWordStart = lastComma === -1 ? 0 : lastComma + 1;
                    
                    const afterCursor = text.substring(cursor);
                    const nextComma = afterCursor.indexOf(",");
                    currentWordEnd = nextComma === -1 ? text.length : cursor + nextComma;
                    
                    currentWord = text.substring(currentWordStart, cursor).trim().toLowerCase();
                    
                    if (currentWord.length === 0) {
                        closeDropdown();
                        return;
                    }
                    
                    currentMatches = suggestions.filter(s => s.toLowerCase().includes(currentWord));
                    if (currentMatches.length > 0) {
                        activeIndex = -1;
                        dropdown.empty();
                        dropdownItems = [];
                        dropdown.style.display = "block";
                        
                        currentMatches.forEach((m, idx) => {
                            const item = dropdown.createDiv();
                            item.style.cssText = "padding:6px 10px; cursor:pointer; font-size:13px; color:var(--text-normal); border-bottom:1px solid var(--background-modifier-border);";
                            
                            const lowerM = m.toLowerCase();
                            const matchIndex = lowerM.indexOf(currentWord);
                            if (matchIndex >= 0) {
                                const before = m.substring(0, matchIndex);
                                const matchStr = m.substring(matchIndex, matchIndex + currentWord.length);
                                const after = m.substring(matchIndex + currentWord.length);
                                
                                item.appendChild(document.createTextNode(before));
                                const highlight = item.createEl("strong");
                                highlight.style.color = "var(--text-accent)";
                                highlight.innerText = matchStr;
                                item.appendChild(document.createTextNode(after));
                            } else {
                                item.innerText = m;
                            }
                            
                            item.onmouseover = () => {
                                activeIndex = idx;
                                updateDropdownVisuals();
                            };
                            item.onmouseout = () => {
                                if (activeIndex === idx) activeIndex = -1;
                                updateDropdownVisuals();
                            };
                            item.onmousedown = (ev) => {
                                ev.preventDefault(); 
                                selectItem(m);
                            };
                            dropdownItems.push(item);
                        });
                    } else {
                        closeDropdown();
                    }
                });
                
                input.addEventListener("blur", () => {
                    setTimeout(closeDropdown, 150);
                });
            }
            return input;
        };

        const titleInput = createInput("Title (Display Name)", this.seriesMeta.title || "");
        const aliasesInput = createInput("Aliases (comma separated)", this.seriesMeta.aliases ? this.seriesMeta.aliases.join(", ") : "");
        const summaryInput = createInput("Summary", this.seriesMeta.summary || "", true);
        const writersInput = createInput("Writers (comma separated)", this.seriesMeta.writers ? this.seriesMeta.writers.join(", ") : "");
        const publisherInput = createInput("Publisher", this.seriesMeta.publisher || "");
        const releaseYearInput = createInput("Release Year", this.seriesMeta.releaseDate || "");
        const genresInput = createInput("Genres (comma separated)", this.seriesMeta.genres ? this.seriesMeta.genres.join(", ") : "", false, sortedGenres);
        const tagsInput = createInput("Tags (comma separated)", this.seriesMeta.tags ? this.seriesMeta.tags.join(", ") : "", false, sortedTags);
        const ageRatingInput = createInput("Age Rating", this.seriesMeta.ageRating || "");

        autoFillBtn.onclick = async (ev) => {
            ev.preventDefault();
            const apiKey = (this.plugin.settings.geminiApiKey || "").trim();
            if (!apiKey) {
                new Notice("Please set your Gemini API Key in the Shiori Bookshelf plugin settings first.");
                return;
            }
            
            const currentTitle = titleInput.value.trim() || this.series.name;
            if (!currentTitle) {
                new Notice("Please enter a title to search for.");
                return;
            }
            
            autoFillBtn.disabled = true;
            autoFillBtn.innerText = "✨ Fetching...";
            
            try {
                const prompt = `Provide metadata for the manga/light novel series "${currentTitle}". Return ONLY a valid JSON object (do not wrap in markdown \`\`\` blocks, just the raw JSON text) with these exact keys: "aliases" (array of strings, MUST include the original Japanese title, Romaji title, and English title if available), "summary" (string, short description), "writers" (array of strings), "publisher" (string), "releaseYear" (string, year only), "genres" (array of strings), "tags" (array of strings), "ageRating" (string).`;
                
                const model = (this.plugin.settings.geminiModel || "gemini-1.5-flash").trim();
                const { requestUrl } = require('obsidian');
                const response = await requestUrl({
                    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }]
                    }),
                    throw: false
                });
                
                if (response.status !== 200) {
                    let errMsg = "Unknown error";
                    try { errMsg = response.json.error.message; } catch(e) { errMsg = response.text || "Status " + response.status; }
                    throw new Error(errMsg + " (Status " + response.status + ")");
                }
                
                const data = response.json;
                const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                
                let parsed;
                try {
                    const cleaned = textOutput.replace(/^```(json)?\n?/i, '').replace(/\n?```$/, '').trim();
                    parsed = JSON.parse(cleaned);
                } catch (err) {
                    throw new Error("Failed to parse JSON response from Gemini.");
                }
                
                if (parsed.aliases && Array.isArray(parsed.aliases) && parsed.aliases.length > 0) {
                    const existing = aliasesInput.value ? aliasesInput.value.split(",").map(s => s.trim()).filter(s => s) : [];
                    const combined = [...new Set([...existing, ...parsed.aliases])];
                    aliasesInput.value = combined.join(", ");
                }
                if (parsed.summary && !summaryInput.value) summaryInput.value = parsed.summary;
                if (parsed.writers && Array.isArray(parsed.writers) && parsed.writers.length > 0 && !writersInput.value) writersInput.value = parsed.writers.join(", ");
                if (parsed.publisher && !publisherInput.value) publisherInput.value = parsed.publisher;
                if (parsed.releaseYear && !releaseYearInput.value) releaseYearInput.value = parsed.releaseYear;
                if (parsed.genres && Array.isArray(parsed.genres) && parsed.genres.length > 0 && !genresInput.value) genresInput.value = parsed.genres.join(", ");
                if (parsed.tags && Array.isArray(parsed.tags) && parsed.tags.length > 0 && !tagsInput.value) tagsInput.value = parsed.tags.join(", ");
                if (parsed.ageRating && !ageRatingInput.value) ageRatingInput.value = parsed.ageRating;
                
                new Notice("✨ Auto Fill complete!");
            } catch (err) {
                console.error("Gemini Auto Fill Error:", err);
                new Notice("Error: " + err.message);
            } finally {
                autoFillBtn.disabled = false;
                autoFillBtn.innerText = "✨ Auto Fill";
            }
        };
        
        const statusRow = form.createDiv();
        statusRow.style.cssText = "display:flex; flex-direction:column; gap:4px;";
        statusRow.createEl("label", { text: "Publication Status" }).style.fontWeight = "bold";
        const statusInput = statusRow.createEl("select");
        statusInput.style.padding = "4px";
        const statuses = ["", "Ongoing", "Completed", "Hiatus", "Cancelled"];
        statuses.forEach(s => {
            const opt = statusInput.createEl("option", { value: s, text: s || "Any" });
            if (this.seriesMeta.status === s || (s === "" && !this.seriesMeta.status)) {
                opt.selected = true;
            }
        });

        const btnRow = contentEl.createDiv();
        btnRow.style.cssText = "display:flex; justify-content:flex-end; gap:10px; margin-top:15px; padding-top:10px; border-top:1px solid var(--background-modifier-border);";
        
        const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
        cancelBtn.onclick = () => this.close();
        
        const saveBtn = btnRow.createEl("button", { text: "Save", cls: "mod-cta" });
        saveBtn.onclick = async () => {
            saveBtn.disabled = true;
            saveBtn.innerText = "Saving...";
            
            let fmData = {
                title: titleInput.value.trim(),
                aliases: aliasesInput.value.split(",").map(s => s.trim()).filter(s => s),
                summary: summaryInput.value.trim(),
                writers: writersInput.value.split(",").map(s => s.trim()).filter(s => s),
                publisher: publisherInput.value.trim(),
                year: releaseYearInput.value.trim(),
                genres: genresInput.value.split(",").map(s => s.trim()).filter(s => s),
                tags: tagsInput.value.split(",").map(s => s.trim()).filter(s => s),
                "age rating": ageRatingInput.value.trim(),
                status: statusInput.value
            };
            
            Object.keys(fmData).forEach(k => {
                if (!fmData[k] || (Array.isArray(fmData[k]) && fmData[k].length === 0)) {
                    delete fmData[k];
                }
            });

            try {
                let notePath = "";
                let targetFile = null;
                
                if (!this.series.id.startsWith("standalone-")) {
                    notePath = `${this.series.id}/${this.series.name}.md`;
                } else {
                    notePath = this.series.books[0].file.path;
                }
                
                targetFile = this.app.vault.getAbstractFileByPath(notePath);
                
                if (!targetFile && !this.series.id.startsWith("standalone-")) {
                    targetFile = await this.app.vault.create(notePath, "");
                }
                
                if (targetFile) {
                    await this.app.fileManager.processFrontMatter(targetFile, (fm) => {
                        const keysToClear = ["title", "aliases", "summary", "description", "writers", "publisher", "year", "release date", "genres", "tags", "age rating", "agerating", "status"];
                        keysToClear.forEach(k => delete fm[k]);
                        Object.assign(fm, fmData);
                    });
                    new Notice("Metadata saved successfully!");
                } else {
                    new Notice("Failed to find or create target file.");
                }
            } catch (e) {
                console.error(e);
                new Notice("Error saving metadata.");
            }
            
            this.close();
        };
    }

    onClose() {
        this.contentEl.empty();
    }
}

class SeriesDetailsView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.seriesId = null;
    }

    getViewType() { return VIEW_TYPE_SERIES_DETAILS; }

    getDisplayText() {
        if (this.seriesId) {
            const data = this.plugin.getLibraryData();
            const series = data.series.find(s => s.id === this.seriesId);
            if (series) return series.name;
        }
        return "Series Details";
    }

    getIcon() { return "library"; }

    async setState(state, result) {
        if (state && state.seriesId) {
            this.seriesId = state.seriesId;
        }
        await super.setState(state, result);
        this.renderDetails();
    }

    getState() {
        return { seriesId: this.seriesId };
    }

    async onOpen() {
        this.registerEvent(this.plugin.app.metadataCache.on("changed", () => {
            this.renderDetails();
        }));
    }

    renderDetails() {
        const container = this.containerEl.children[1];
        container.empty();
        container.style.userSelect = "text";
        container.style.webkitUserSelect = "text";

        if (!this.seriesId) {
            container.createEl("div", { text: "No series selected." });
            return;
        }

        const data = this.plugin.getLibraryData();
        const series = data.series.find(s => s.id === this.seriesId);

        if (!series) {
            container.createEl("div", { text: "Series not found." });
            return;
        }

        // ── Extract Metadata ────────────────────────────────────────
        let seriesMeta = { summary: "", writers: [], publisher: "", releaseDate: "", genres: [], tags: [], ageRating: "", aliases: [] };
        
        const getFirstStr = (keys) => {
            if (series.metadata) {
                for (let k of keys) {
                    if (series.metadata[k]) return String(series.metadata[k]);
                }
            }
            for (let b of series.books) {
                for (let k of keys) {
                    if (b.metadata[k]) return String(b.metadata[k]);
                }
            }
            return "";
        };
        
        const getMergedArr = (keys) => {
            let s = new Set();
            if (series.metadata) {
                for (let k of keys) {
                    let v = series.metadata[k];
                    if (v) {
                        if (Array.isArray(v)) v.forEach(x => s.add(String(x).trim()));
                        else if (typeof v === "string") v.split(",").map(x => x.trim()).forEach(x => s.add(x));
                    }
                }
            }
            for (let b of series.books) {
                for (let k of keys) {
                    let v = b.metadata[k];
                    if (v) {
                        if (Array.isArray(v)) v.forEach(x => s.add(String(x).trim()));
                        else if (typeof v === "string") v.split(",").map(x => x.trim()).forEach(x => s.add(x));
                    }
                }
            }
            return Array.from(s).filter(x => x);
        };

        seriesMeta.summary = getFirstStr(["summary", "description"]);
        seriesMeta.publisher = getFirstStr(["publisher", "publishers"]);
        seriesMeta.ageRating = getFirstStr(["age rating", "agerating"]);
        seriesMeta.status = getFirstStr(["status", "publication status"]);
        
        let rd = getFirstStr(["release date", "publication date", "year", "date"]);
        if (rd) {
            let ym = rd.match(/\b(19|20)\d{2}\b/);
            seriesMeta.releaseDate = ym ? ym[0] : rd;
        }
        
        seriesMeta.writers = getMergedArr(["writers", "writer", "creators", "creator", "author", "authors"]);
        seriesMeta.genres = getMergedArr(["genres", "genre", "subjects", "subject"]);
        seriesMeta.tags = getMergedArr(["tags", "tag"]);

        if (series.metadata && series.metadata.aliases) {
            let a = series.metadata.aliases;
            if (Array.isArray(a)) seriesMeta.aliases = a.map(x => String(x).trim()).filter(x => x);
            else if (typeof a === "string") seriesMeta.aliases = a.split(",").map(x => x.trim()).filter(x => x);
        }

        // ── Header/Metadata Area ────────────────────────────────────
        const header = container.createDiv();
        header.style.cssText = "display:flex;gap:20px;margin-bottom:24px;align-items:flex-start;flex-wrap:wrap;";
        
        const coverBox = header.createDiv();
        coverBox.style.cssText = "width:160px;flex-shrink:0;border-radius:8px;overflow:hidden;background:var(--background-modifier-active-hover);aspect-ratio:2/3;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.1);";
        let coverUrl = getCoverUrl(this.plugin, series.coverImg, series.books.length > 0 ? series.books[0].file.path : null);
        if (coverUrl) {
            let img = coverBox.createEl("img");
            img.src = coverUrl;
            img.style.cssText = "width:100%;height:100%;object-fit:cover;";
        } else {
            coverBox.createEl("span", { text: "SERIES" }).style.cssText = "font-weight:bold;color:var(--text-muted);";
        }
        
        const infoBox = header.createDiv();
        infoBox.style.cssText = "flex:1;min-width:250px;display:flex;flex-direction:column;gap:12px;";
        
        const titleRow = infoBox.createDiv();
        titleRow.style.cssText = "display:flex; align-items:center; gap:12px; flex-wrap:wrap;";
        
        let displayTitle = series.metadata && series.metadata.title ? String(series.metadata.title) : series.name;
        titleRow.createEl("h1", { text: displayTitle }).style.cssText = "margin:0;font-size:28px;font-weight:800;line-height:1.2;color:var(--text-normal);";
        
        const editBtn = titleRow.createEl("button", { text: "✏️ Edit Metadata" });
        editBtn.style.cssText = "padding:4px 8px; font-size:12px; cursor:pointer; border-radius:4px; background:var(--interactive-normal); color:var(--text-normal); border:1px solid var(--background-modifier-border);";
        editBtn.onclick = () => {
            // Include 'title' in seriesMeta to prepopulate
            seriesMeta.title = series.metadata && series.metadata.title ? String(series.metadata.title) : "";
            new EditSeriesMetadataModal(this.plugin.app, series, seriesMeta, this.plugin).open();
        };

        const scanBtn = titleRow.createEl("button", { text: "🔍 Scan" });
        scanBtn.style.cssText = "padding:4px 8px; font-size:12px; cursor:pointer; border-radius:4px; background:var(--interactive-normal); color:var(--text-normal); border:1px solid var(--background-modifier-border);";
        scanBtn.onclick = async () => {
            scanBtn.innerText = "Scanning...";
            scanBtn.disabled = true;
            if (this.plugin.extractMissingCoversForSeries) {
                await this.plugin.extractMissingCoversForSeries(series);
            }
            scanBtn.innerText = "🔍 Scan";
            scanBtn.disabled = false;
        };

        const getTargetFile = () => {
            return series.id.startsWith("standalone-") && series.books.length > 0 
                ? series.books[0].file 
                : this.plugin.app.vault.getAbstractFileByPath(series.id);
        };

        if (this.plugin.settings.enableForceRename) {
            const forceRenameBtn = titleRow.createEl("button", { text: "⚠️ Force Rename" });
            forceRenameBtn.title = "Force rename folder/file bypassing Obsidian restrictions";
            forceRenameBtn.style.cssText = "padding:4px 8px; font-size:12px; cursor:pointer; border-radius:4px; background:var(--interactive-normal); color:var(--text-error); border:1px solid var(--background-modifier-border);";
            forceRenameBtn.onclick = () => {
                let target = getTargetFile();
                if (target) {
                    new ForceRenameModal(this.plugin.app, target, this.plugin).open();
                }
            };
        }

        const revealBtn = titleRow.createEl("button", { text: "🎯" });
        revealBtn.title = "Reveal to navigate";
        revealBtn.style.cssText = "padding:4px 8px; font-size:16px; cursor:pointer; border-radius:4px; background:transparent; border:none; box-shadow:none;";
        revealBtn.onclick = () => {
            let target = getTargetFile();
            if (target) {
                let explorerLeaves = this.plugin.app.workspace.getLeavesOfType("file-explorer");
                if (explorerLeaves.length > 0 && explorerLeaves[0].view.revealInFolder) {
                    this.plugin.app.workspace.revealLeaf(explorerLeaves[0]);
                    explorerLeaves[0].view.revealInFolder(target);
                }
            }
        };

        const sysFolderBtn = titleRow.createEl("button", { text: "📁" });
        sysFolderBtn.title = "Show in system folder";
        sysFolderBtn.style.cssText = "padding:4px 8px; font-size:16px; cursor:pointer; border-radius:4px; background:transparent; border:none; box-shadow:none;";
        sysFolderBtn.onclick = () => {
            let target = getTargetFile();
            if (target && this.plugin.app.showInFolder) {
                this.plugin.app.showInFolder(target.path);
            }
        };
        
        if (seriesMeta.aliases.length > 0) {
            infoBox.createEl("div", { text: seriesMeta.aliases.join(" • ") }).style.cssText = "font-size:14px;color:var(--text-muted);margin-top:-8px;font-weight:600;";
        }
        
        const metaGrid = infoBox.createDiv();
        metaGrid.style.cssText = "display:flex;flex-wrap:wrap;gap:16px;font-size:13px;color:var(--text-muted);";
        
        const addMeta = (label, value) => {
            if (!value || (Array.isArray(value) && value.length === 0)) return;
            const text = Array.isArray(value) ? value.join(", ") : value;
            const el = metaGrid.createDiv();
            el.innerHTML = `<strong style="color:var(--text-normal);">${label}:</strong> ${text}`;
        };
        
        addMeta("Writers", seriesMeta.writers);
        addMeta("Publisher", seriesMeta.publisher);
        addMeta("Release Year", seriesMeta.releaseDate);
        addMeta("Status", seriesMeta.status);
        addMeta("Age Rating", seriesMeta.ageRating);
        addMeta("Genres", seriesMeta.genres);
        addMeta("Tags", seriesMeta.tags);
        
        if (seriesMeta.summary) {
            const summaryBox = infoBox.createDiv();
            summaryBox.style.cssText = "margin-top:4px;font-size:14px;line-height:1.6;color:var(--text-normal);max-height:140px;overflow-y:auto;padding-right:8px;border-left:3px solid var(--interactive-accent);padding-left:12px;background:var(--background-secondary);padding-top:8px;padding-bottom:8px;border-radius:0 8px 8px 0;";
            summaryBox.innerText = seriesMeta.summary;
        }

        let target = getTargetFile();
        if (target) {
            let systemPath = target.path;
            if (this.plugin.app.vault.adapter.getBasePath) {
                let basePath = this.plugin.app.vault.adapter.getBasePath();
                systemPath = basePath + "/" + target.path;
                if (basePath.includes("\\")) {
                    systemPath = systemPath.replace(/\//g, "\\");
                }
            }
            
            const rowWrapper = container.createDiv();
            rowWrapper.style.cssText = "display: flex; align-items: center; gap: 8px; margin-bottom: 8px;";
            
            const pathBox = rowWrapper.createDiv({ text: systemPath });
            pathBox.style.cssText = "flex: 1; padding: 4px 8px; background: var(--background-secondary); border-radius: 4px; font-family: monospace; font-size: 11px; color: var(--text-muted); word-break: break-all; border: 1px solid var(--background-modifier-border); user-select: all;";
            
            const copyBtn = rowWrapper.createEl("button", { text: "📋 Copy" });
            copyBtn.style.cssText = "padding: 4px 8px; font-size: 11px; cursor: pointer; border-radius: 4px; background: var(--interactive-normal); border: 1px solid var(--background-modifier-border); color: var(--text-normal); flex-shrink: 0;";
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(systemPath);
                copyBtn.innerText = "✅ Copied!";
                setTimeout(() => copyBtn.innerText = "📋 Copy", 2000);
            };
        }

        // ── UI state ────────────────────────────────────────────────
        let currentViewMode = this.plugin.settings.seriesViewMode || "list";
        let currentSort     = this.plugin.settings.seriesSort || "volume";
        let currentFilter   = this.plugin.settings.seriesFilter || "";

        // ── Toolbar ─────────────────────────────────────────────────
        const toolbar = container.createDiv();
        toolbar.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;padding:12px 0;border-bottom:1px solid var(--background-modifier-border);border-top:1px solid var(--background-modifier-border);";

        const countEl = toolbar.createDiv({ text: `${series.books.length} book(s)` });
        countEl.style.cssText = "font-weight:600;font-size:14px;color:var(--text-normal);";

        const controls = toolbar.createDiv();
        controls.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;";

        const selectCss = "padding:4px 8px;border-radius:5px;font-size:12px;cursor:pointer;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);";

        const allExts = [...new Set(series.books.map(b => b.extension.toLowerCase()))].sort();
        if (allExts.length > 1) {
            const filterSel = controls.createEl("select");
            filterSel.style.cssText = selectCss;
            filterSel.createEl("option", { text: "All types", value: "" });
            allExts.forEach(ext => filterSel.createEl("option", { text: ext.toUpperCase(), value: ext }));
            filterSel.onchange = async () => { currentFilter = filterSel.value; this.plugin.settings.seriesFilter = currentFilter; await this.plugin.saveSettings(); renderContent(); };
        }

        const sortSel = controls.createEl("select");
        sortSel.style.cssText = selectCss;
        [["volume","Sort: Volume"],["name","Sort: Name"],["added","Sort: Date Added"]].forEach(([v,t]) => {
            sortSel.createEl("option", { text: t, value: v });
        });
        sortSel.onchange = async () => { currentSort = sortSel.value; this.plugin.settings.seriesSort = currentSort; await this.plugin.saveSettings(); renderContent(); };

        const viewBtns = controls.createDiv();
        viewBtns.style.cssText = "display:flex;gap:2px;";
        const modes = [
            { id: "thumbnail", icon: "⊞", title: "Thumbnail" },
            { id: "card",      icon: "▣", title: "Card"      },
            { id: "list",      icon: "☰", title: "List"      },
            { id: "detail",    icon: "⊟", title: "Detail"    },
        ];
        const btnMap = {};
        const btnBase = "padding:4px 8px;border-radius:4px;font-size:14px;cursor:pointer;border:1px solid var(--background-modifier-border);transition:background .15s;";
        modes.forEach(m => {
            const btn = viewBtns.createEl("button", { text: m.icon, title: m.title });
            btn.style.cssText = btnBase + "background:var(--background-secondary);color:var(--text-normal);";
            btn.onclick = async () => {
                currentViewMode = m.id;
                Object.values(btnMap).forEach(b => b.style.background = "var(--background-secondary)");
                btn.style.background = "var(--interactive-accent)";
                this.plugin.settings.seriesViewMode = currentViewMode;
                await this.plugin.saveSettings();
                zoomBtns.style.display = currentViewMode === "thumbnail" ? "flex" : "none";
                renderContent();
            };
            btnMap[m.id] = btn;
        });
        btnMap[currentViewMode].style.background = "var(--interactive-accent)";

        const zoomBtns = controls.createDiv();
        zoomBtns.style.cssText = "display:none;gap:2px;margin-left:8px;";
        let currentThumbSize = this.plugin.settings.thumbnailSize || 100;
        
        const btnMinus = zoomBtns.createEl("button", { text: "-" });
        const btnReset = zoomBtns.createEl("button", { text: "reset" });
        const btnPlus = zoomBtns.createEl("button", { text: "+" });
        [btnMinus, btnReset, btnPlus].forEach(b => {
            b.style.cssText = btnBase + "background:var(--background-secondary);color:var(--text-normal);padding:4px 6px;font-size:12px;";
        });
        
        const saveZoom = async () => {
            this.plugin.settings.thumbnailSize = currentThumbSize;
            await this.plugin.saveSettings();
            renderContent();
        };
        btnMinus.onclick = () => { currentThumbSize = Math.max(50, currentThumbSize - 20); saveZoom(); };
        btnReset.onclick = () => { currentThumbSize = 100; saveZoom(); };
        btnPlus.onclick = () => { currentThumbSize = Math.min(300, currentThumbSize + 20); saveZoom(); };
        zoomBtns.style.display = currentViewMode === "thumbnail" ? "flex" : "none";

        // ── Content area ────────────────────────────────────────────
        const content = container.createDiv();
        const plugin = this.plugin;

        function naturalSort(a, b) {
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
        }

        const renderContent = () => {
            content.empty();
            let books = series.books.filter(b => !currentFilter || b.extension.toLowerCase() === currentFilter);

            if (currentSort === "name")   books.sort((a,b) => naturalSort(a.metadata.title || a.basename, b.metadata.title || b.basename));
            if (currentSort === "volume") books.sort((a,b) => naturalSort(a.basename, b.basename));
            if (currentSort === "added")  books.sort((a,b) => b.ctime - a.ctime);

            if (books.length === 0) { content.createEl("div", { text: "No books match the selected filter." }); return; }

            if (currentViewMode === "thumbnail") renderThumbnailView(content, books);
            else if (currentViewMode === "card") renderCardView(content, books);
            else if (currentViewMode === "list") renderListView(content, books);
            else                                 renderDetailView(content, books);
        };

        // ── Thumbnail ───────────────────────────────────────────────
        const renderThumbnailView = (wrap, books) => {
            const grid = wrap.createDiv();
            grid.style.cssText = `display:grid;grid-template-columns:repeat(auto-fill,minmax(${currentThumbSize}px,1fr));gap:10px;`;
            books.forEach(book => {
                const card = grid.createDiv();
                card.style.cssText = "cursor:pointer;border-radius:6px;overflow:hidden;transition:transform .2s;";
                card.title = book.metadata.title || book.basename;
                card.onmouseover = () => card.style.transform = "scale(1.05)";
                card.onmouseout  = () => card.style.transform = "scale(1)";
                const img = card.createDiv();
                img.style.cssText = "width:100%;aspect-ratio:2/3;background:var(--background-modifier-active-hover);display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:6px;";
                const url = getCoverUrl(plugin, book.metadata.cover, book.file.path);
                if (url) { const i = img.createEl("img"); i.src = url; i.style.cssText = "width:100%;height:100%;object-fit:cover;"; }
                else img.createEl("span", { text: book.extension.toUpperCase() }).style.cssText = "font-weight:bold;color:var(--text-muted);font-size:11px;";
                card.onclick = () => openBook(plugin, book.file);
                attachBookContextMenu(card, book, plugin);
            });
        };

        // ── Card ────────────────────────────────────────────────────
        const renderCardView = (wrap, books) => {
            const grid = wrap.createDiv();
            grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:16px;";
            renderBooks(grid, books, plugin);
        };

        // ── List ────────────────────────────────────────────────────
        const renderListView = (wrap, books) => {
            const list = wrap.createDiv();
            list.style.cssText = "display:flex;flex-direction:column;gap:6px;";
            books.forEach(book => {
                const row = list.createDiv();
                row.style.cssText = "display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--background-modifier-border);border-radius:7px;background:var(--background-secondary);cursor:pointer;transition:background .15s;";
                row.onmouseover = () => row.style.background = "var(--background-modifier-hover)";
                row.onmouseout  = () => row.style.background = "var(--background-secondary)";

                const thumb = row.createDiv();
                thumb.style.cssText = "width:36px;height:52px;border-radius:4px;flex-shrink:0;overflow:hidden;background:var(--background-modifier-active-hover);display:flex;align-items:center;justify-content:center;";
                const url = getCoverUrl(plugin, book.metadata.cover, book.file.path);
                if (url) { const i = thumb.createEl("img"); i.src = url; i.style.cssText = "width:100%;height:100%;object-fit:cover;"; }
                else thumb.createEl("span", { text: book.extension.toUpperCase() }).style.cssText = "font-size:9px;font-weight:bold;color:var(--text-muted);";

                const info = row.createDiv();
                info.style.cssText = "flex:1;min-width:0;";
                info.createEl("div", { text: book.metadata.title || book.basename }).style.cssText = "font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
                if (book.metadata.author) info.createEl("div", { text: book.metadata.author }).style.cssText = "font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

                const rightContainer = row.createDiv();
                rightContainer.style.cssText = "display:flex;align-items:center;gap:6px;flex-shrink:0;";

                if (book.file && book.file.stat && book.file.stat.size) {
                    let bytes = book.file.stat.size;
                    let sizeStr = "";
                    if (bytes < 1024) sizeStr = bytes + " B";
                    else if (bytes < 1024*1024) sizeStr = (bytes/1024).toFixed(1) + " KB";
                    else if (bytes < 1024*1024*1024) sizeStr = (bytes/(1024*1024)).toFixed(1) + " MB";
                    else sizeStr = (bytes/(1024*1024*1024)).toFixed(1) + " GB";
                    rightContainer.createEl("span", { text: sizeStr }).style.cssText = "font-size:10px;padding:2px 6px;border-radius:4px;color:var(--text-muted);background:var(--background-modifier-border);";
                }

                rightContainer.createEl("span", { text: book.extension.toUpperCase() }).style.cssText = "font-size:10px;padding:2px 6px;border-radius:4px;background:var(--background-modifier-border);color:var(--text-faint);";
                row.onclick = () => openBook(plugin, book.file);
                attachBookContextMenu(row, book, plugin);
            });
        };

        // ── Detail ──────────────────────────────────────────────────
        const renderDetailView = (wrap, books) => {
            const grid = wrap.createDiv();
            grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;";
            books.forEach(book => {
                const card = grid.createDiv();
                card.style.cssText = "display:flex;gap:12px;padding:12px;border:1px solid var(--background-modifier-border);border-radius:8px;background:var(--background-secondary);cursor:pointer;transition:box-shadow .2s,transform .2s;";
                card.onmouseover = () => { card.style.boxShadow = "0 4px 14px rgba(0,0,0,0.2)"; card.style.transform = "translateY(-2px)"; };
                card.onmouseout  = () => { card.style.boxShadow = "none"; card.style.transform = "none"; };

                const cw = card.createDiv();
                cw.style.cssText = "width:70px;height:100px;flex-shrink:0;border-radius:4px;overflow:hidden;background:var(--background-modifier-active-hover);display:flex;align-items:center;justify-content:center;";
                const url = getCoverUrl(plugin, book.metadata.cover, book.file.path);
                if (url) { const i = cw.createEl("img"); i.src = url; i.style.cssText = "width:100%;height:100%;object-fit:cover;"; }
                else cw.createEl("span", { text: book.extension.toUpperCase() }).style.cssText = "font-weight:bold;color:var(--text-muted);font-size:11px;";

                const info = card.createDiv();
                info.style.cssText = "flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;";
                info.createEl("div", { text: book.metadata.title || book.basename }).style.cssText = "font-weight:700;font-size:15px;line-height:1.3;";
                if (book.metadata.author) info.createEl("div", { text: `✍ ${book.metadata.author}` }).style.cssText = "font-size:12px;color:var(--text-muted);";
                if (book.metadata.genre)  info.createEl("div", { text: `🏷 ${book.metadata.genre}` }).style.cssText  = "font-size:12px;color:var(--text-muted);";
                if (book.metadata.description) {
                    const d = info.createEl("div", { text: book.metadata.description });
                    d.style.cssText = "font-size:11px;color:var(--text-faint);margin-top:4px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;";
                }
                info.createEl("span", { text: book.extension.toUpperCase() }).style.cssText = "margin-top:auto;align-self:flex-start;font-size:10px;padding:2px 6px;border-radius:4px;background:var(--background-modifier-border);color:var(--text-faint);";
                card.onclick = () => openBook(plugin, book.file);
                attachBookContextMenu(card, book, plugin);
            });
        };

        renderContent();

        // ── Other Media ─────────────────────────────────────────────
        let folderPath = "";
        if (!series.id.startsWith("standalone-")) {
            folderPath = series.id;
        }

        if (folderPath) {
            let folder = this.plugin.app.vault.getAbstractFileByPath(folderPath);
            if (folder && folder.children) {
                const mediaExts = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "mp4", "webm", "mp3", "wav", "ogg"];
                let mediaFiles = folder.children.filter(f => {
                    if (!f.extension) return false;
                    return mediaExts.includes(f.extension.toLowerCase());
                });
                
                if (series.coverImg) {
                    let coverFile = this.plugin.app.metadataCache.getFirstLinkpathDest(series.coverImg, folderPath + "/");
                    if (coverFile) {
                        mediaFiles = mediaFiles.filter(f => f.path !== coverFile.path);
                    }
                }
                
                let bookCoverPaths = new Set();
                series.books.forEach(b => {
                    if (b.metadata && b.metadata.cover) {
                        let cf = this.plugin.app.metadataCache.getFirstLinkpathDest(b.metadata.cover, folderPath + "/");
                        if (cf) bookCoverPaths.add(cf.path);
                    }
                });
                mediaFiles = mediaFiles.filter(f => !bookCoverPaths.has(f.path));
                mediaFiles = mediaFiles.filter(f => !f.basename.toLowerCase().endsWith("_cover"));

                if (mediaFiles.length > 0) {
                    const mediaSection = container.createDiv();
                    mediaSection.style.cssText = "margin-top:40px; border-top:1px solid var(--background-modifier-border); padding-top:20px;";
                    mediaSection.createEl("h3", { text: "Media Files" }).style.cssText = "margin-top:0; margin-bottom:16px; font-weight:700;";
                    
                    const mediaGrid = mediaSection.createDiv();
                    mediaGrid.style.cssText = "display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); gap:16px;";
                    
                    mediaFiles.forEach(f => {
                        const mCard = mediaGrid.createDiv();
                        mCard.style.cssText = "border:1px solid var(--background-modifier-border); border-radius:8px; overflow:hidden; background:var(--background-secondary); display:flex; flex-direction:column; cursor:pointer; transition:transform 0.15s, box-shadow 0.15s;";
                        mCard.onmouseover = () => { mCard.style.transform = "translateY(-2px)"; mCard.style.boxShadow = "0 4px 10px rgba(0,0,0,0.15)"; };
                        mCard.onmouseout = () => { mCard.style.transform = "none"; mCard.style.boxShadow = "none"; };
                        
                        const mPrev = mCard.createDiv();
                        mPrev.style.cssText = "width:100%; aspect-ratio:1; background:var(--background-modifier-active-hover); display:flex; align-items:center; justify-content:center; overflow:hidden;";
                        
                        let resourceUrl = this.plugin.app.vault.getResourcePath(f);
                        const ext = f.extension.toLowerCase();
                        
                        if (["png", "jpg", "jpeg", "gif", "bmp", "webp"].includes(ext)) {
                            let img = mPrev.createEl("img");
                            img.src = resourceUrl;
                            img.style.cssText = "width:100%; height:100%; object-fit:cover;";
                        } else if (["mp4", "webm"].includes(ext)) {
                            let vid = mPrev.createEl("video");
                            vid.src = resourceUrl;
                            vid.style.cssText = "width:100%; height:100%; object-fit:cover;";
                            vid.controls = false;
                        } else if (["mp3", "wav", "ogg"].includes(ext)) {
                            mPrev.createEl("span", { text: "🎵" }).style.fontSize = "32px";
                        }
                        
                        const mInfo = mCard.createDiv();
                        mInfo.style.cssText = "padding:8px; font-size:11px; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
                        mInfo.innerText = f.name;
                        
                        mCard.onclick = () => this.plugin.app.workspace.getLeaf(false).openFile(f);
                    });
                }
            }
        }
    }
}

class BookshelfView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
    }
    
    getViewType() { return VIEW_TYPE_BOOKSHELF; }
    getDisplayText() { return "Shiori Bookshelf"; }
    getIcon() { return "library"; }

    async onOpen() {
        this.renderBookshelf();
        this.registerEvent(this.plugin.app.metadataCache.on("changed", () => {
            this.renderBookshelf();
        }));
    }
    
    async renderBookshelf() {
        const container = this.containerEl.children[1];
        container.empty();
        const data = this.plugin.getLibraryData();
        this.renderHome(container, data);
    }

    renderHome(container, data) {
        const header = container.createDiv({ cls: "bookshelf-header" });
        header.style.display = "flex";
        header.style.justifyContent = "space-between";
        header.style.alignItems = "center";
        header.style.marginBottom = "20px";
        header.style.flexWrap = "wrap";
        header.style.gap = "10px";

        let titleEl = header.createEl("h2", { cls: "bookshelf-title" });
        titleEl.innerHTML = "Shiori <span style='font-size:0.7em'>Bookshelf</span>";
        titleEl.style.margin = "0";

        const searchContainer = header.createDiv();
        searchContainer.style.display = "flex";
        searchContainer.style.flex = "1";
        searchContainer.style.gap = "10px";
        searchContainer.style.minWidth = "250px";

        const searchInput = searchContainer.createEl("input", { type: "text", placeholder: "Filter by series...", cls: "bookshelf-search" });
        searchInput.style.flex = "1";
        searchInput.style.padding = "8px 12px";
        searchInput.style.borderRadius = "5px";
        searchInput.style.border = "1px solid var(--background-modifier-border)";
        searchInput.style.background = "var(--background-primary)";
        searchInput.style.color = "var(--text-normal)";

        const writerInput = searchContainer.createEl("input", { type: "text", placeholder: "Filter by writer...", cls: "bookshelf-search" });
        writerInput.style.flex = "1";
        writerInput.style.padding = "8px 12px";
        writerInput.style.borderRadius = "5px";
        writerInput.style.border = "1px solid var(--background-modifier-border)";
        writerInput.style.background = "var(--background-primary)";
        writerInput.style.color = "var(--text-normal)";

        const statusSelect = searchContainer.createEl("select", { cls: "bookshelf-search" });
        statusSelect.style.flex = "0 1 auto";
        statusSelect.style.padding = "4px 12px";
        statusSelect.style.borderRadius = "5px";
        statusSelect.style.border = "1px solid var(--background-modifier-border)";
        statusSelect.style.background = "var(--background-primary)";
        statusSelect.style.color = "var(--text-normal)";
        const statuses = ["Any Status", "Ongoing", "Completed", "Hiatus", "Cancelled"];
        statuses.forEach(s => statusSelect.createEl("option", { value: s === "Any Status" ? "" : s, text: s }));


        const advFilterBtn = searchContainer.createEl("button", { text: "Advance Filter", cls: "bookshelf-btn" });
        advFilterBtn.style.marginRight = "8px";

        const extractBtn = searchContainer.createEl("button", { text: "Scan All", cls: "bookshelf-btn mod-cta" });
        extractBtn.title = "Automatically extract covers for PDF and EPUB files that don't have one.";
        extractBtn.onclick = async () => {
            extractBtn.innerText = "Scanning...";
            extractBtn.disabled = true;
            await this.plugin.extractAllMissingCovers();
            extractBtn.innerText = "Scan All";
            extractBtn.disabled = false;
        };

        let allGenres = new Set();
        let allTags = new Set();
        let allLibraries = new Set();
        data.series.forEach(s => {
            if (s.library) allLibraries.add(s.library);
            if (s.metadata) {
                let g1 = s.metadata.genres;
                if (Array.isArray(g1)) g1.forEach(x => allGenres.add(String(x).trim()));
                else if (typeof g1 === "string") g1.split(",").forEach(x => allGenres.add(x.trim()));
                
                let g2 = s.metadata.genre;
                if (Array.isArray(g2)) g2.forEach(x => allGenres.add(String(x).trim()));
                else if (typeof g2 === "string") g2.split(",").forEach(x => allGenres.add(x.trim()));
                
                let t1 = s.metadata.tags;
                if (Array.isArray(t1)) t1.forEach(x => allTags.add(String(x).trim()));
                else if (typeof t1 === "string") t1.split(",").forEach(x => allTags.add(x.trim()));
                
                let t2 = s.metadata.tag;
                if (Array.isArray(t2)) t2.forEach(x => allTags.add(String(x).trim()));
                else if (typeof t2 === "string") t2.split(",").forEach(x => allTags.add(x.trim()));
            }
        });
        allGenres.delete("");
        allTags.delete("");
        let sortedGenres = Array.from(allGenres).sort((a,b) => a.localeCompare(b));
        let sortedTags = Array.from(allTags).sort((a,b) => a.localeCompare(b));
        let sortedLibraries = Array.from(allLibraries).sort((a,b) => a.localeCompare(b));
        
        let includeGenres = new Set();
        let excludeGenres = new Set();
        let includeTags = new Set();
        let excludeTags = new Set();
        let includeLibraries = new Set();
        let excludeLibraries = new Set();
        
        let applyFilters = null; // Will be defined below
        let updateAllPills = [];
        
        const createFilterSection = (title, items, includeSet, excludeSet, addHr = true, parent = container) => {
            if (items.length === 0) return;
            const section = parent.createDiv();
            if (addHr) {
                section.style.cssText = "margin-bottom: 20px; padding-bottom: 15px;";
            } else {
                section.style.cssText = "margin-bottom: 5px;";
            }
            
            const headerRow = section.createDiv();
            headerRow.style.cssText = "display:flex; align-items:center; gap:10px; margin-bottom:10px;";
            headerRow.createEl("h4", { text: title }).style.cssText = "margin:0; color:var(--text-muted); font-size:14px; font-weight:bold;";
            
            const toggleBtn = headerRow.createEl("button", { text: "Hide" });
            toggleBtn.style.cssText = "background:transparent; border:none; box-shadow:none; color:var(--text-accent); font-size:12px; cursor:pointer; padding:0;";
            
            const list = section.createDiv();
            list.style.cssText = "display:flex; flex-wrap:wrap; gap:8px;";
            
            let isVisible = true;
            toggleBtn.onclick = () => {
                isVisible = !isVisible;
                list.style.display = isVisible ? "flex" : "none";
                toggleBtn.innerText = isVisible ? "Hide" : "Show";
            };
            
            items.forEach(item => {
                const pill = list.createEl("button", { text: item });
                const baseStyle = "padding:4px 10px; border-radius:6px; font-size:12px; cursor:pointer; background:var(--background-secondary); transition:all 0.1s; ";
                
                const updatePillStyle = () => {
                    if (includeSet.has(item)) {
                        pill.style.cssText = baseStyle + "color:var(--text-success); border:1px solid var(--text-success);";
                    } else if (excludeSet.has(item)) {
                        pill.style.cssText = baseStyle + "color:var(--text-error); border:1px dashed var(--text-error);";
                    } else {
                        pill.style.cssText = baseStyle + "color:var(--text-normal); border:1px solid var(--background-modifier-border);";
                    }
                };
                updatePillStyle();
                updateAllPills.push(updatePillStyle);
                
                pill.onclick = () => {
                    if (!includeSet.has(item) && !excludeSet.has(item)) {
                        includeSet.add(item);
                    } else if (includeSet.has(item)) {
                        includeSet.delete(item);
                        excludeSet.add(item);
                    } else {
                        excludeSet.delete(item);
                    }
                    updatePillStyle();
                    if (applyFilters) applyFilters();
                };
            });
            if (addHr) section.createEl("hr").style.margin = "15px 0 0 0";
        };
        
        const filtersContainer = container.createDiv();
        filtersContainer.style.display = "none";
        filtersContainer.style.marginBottom = "15px";
        filtersContainer.style.position = "relative";

        const resetAllBtn = filtersContainer.createEl("button", { text: "Reset Filters", cls: "bookshelf-btn" });
        resetAllBtn.style.cssText = "position:absolute; right:0; top:0; font-size:12px; padding:4px 10px;";
        resetAllBtn.onclick = () => {
            includeLibraries.clear(); excludeLibraries.clear();
            includeGenres.clear(); excludeGenres.clear();
            includeTags.clear(); excludeTags.clear();
            updateAllPills.forEach(fn => fn());
            if (applyFilters) applyFilters();
        };

        let isAdvVisible = false;
        advFilterBtn.onclick = () => {
            isAdvVisible = !isAdvVisible;
            filtersContainer.style.display = isAdvVisible ? "block" : "none";
        };

        createFilterSection("Libraries", sortedLibraries, includeLibraries, excludeLibraries, false, filtersContainer);
        createFilterSection("Genres", sortedGenres, includeGenres, excludeGenres, false, filtersContainer);
        createFilterSection("Tags", sortedTags, includeTags, excludeTags, true, filtersContainer);

        let recentContainer = null;
        if (data.recentlyAdded.length > 0) {
            recentContainer = container.createDiv();
            recentContainer.createEl("h3", { text: "New Book Add", cls: "bookshelf-section-title" }).style.marginTop = "0";
            
            const recentGrid = recentContainer.createDiv({ cls: "bookshelf-grid recent-grid" });
            recentGrid.style.display = "flex";
            recentGrid.style.overflowX = "auto";
            recentGrid.style.gap = "20px";
            recentGrid.style.paddingBottom = "10px";
            // Custom scrollbar can be added via CSS if needed
            
            renderBooks(recentGrid, data.recentlyAdded, this.plugin);
            
            // Fix width for cards in recentGrid to prevent shrinking
            Array.from(recentGrid.children).forEach(child => {
                child.style.flex = "0 0 140px";
                child.style.minWidth = "140px";
            });
            
            recentContainer.createEl("hr").style.margin = "30px 0 20px 0";
        }

        let currentSort = "lastUpdate";
        let currentLimit = 50;
        let currentLoadedCount = currentLimit;

        const seriesHeaderContainer = container.createDiv();
        seriesHeaderContainer.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-top:30px; margin-bottom:15px; flex-wrap:wrap; gap:10px;";
        
        const seriesHeader = seriesHeaderContainer.createEl("h3", { text: `Series (${data.series.length})`, cls: "bookshelf-section-title" });
        seriesHeader.style.margin = "0";

        const seriesControls = seriesHeaderContainer.createDiv();
        seriesControls.style.cssText = "display:flex; gap:10px; align-items:center;";

        const sortSelect = seriesControls.createEl("select", { cls: "bookshelf-search" });
        sortSelect.style.cssText = "padding:4px 8px; border-radius:5px; border:1px solid var(--background-modifier-border); background:var(--background-primary); color:var(--text-normal); font-size:12px;";
        sortSelect.createEl("option", { text: "Sort by Last Update", value: "lastUpdate" });
        sortSelect.createEl("option", { text: "Sort by Name", value: "name" });
        sortSelect.value = currentSort;
        sortSelect.onchange = () => {
            currentSort = sortSelect.value;
            applyFilters();
        };

        const seriesGrid = container.createDiv({ cls: "bookshelf-grid series-grid" });
        applyGridStyle(seriesGrid);
        
        let seriesCardElements = [];

        const renderSeriesList = (seriesList) => {
            seriesGrid.empty();
            seriesCardElements = [];
            if (seriesList.length === 0) {
                seriesGrid.createEl("div", { text: "No series found. Check your library settings." });
                return;
            }

            for (let series of seriesList) {
                let card = seriesGrid.createDiv({ cls: "bookshelf-card" });
                seriesCardElements.push({ series, card });
                applyCardStyle(card);

                let cover = card.createDiv({ cls: "bookshelf-cover" });
                applyCoverStyle(cover);
                
                let coverUrl = null;
                if (series.books.length > 0) {
                    coverUrl = getCoverUrl(this.plugin, series.coverImg, series.books[0].file.path);
                }
                
                if (coverUrl) {
                    let img = cover.createEl("img");
                    img.src = coverUrl;
                    img.style.width = "100%";
                    img.style.height = "100%";
                    img.style.objectFit = "cover";
                } else {
                    let fallback = cover.createEl("span", { text: "SERIES" });
                    fallback.style.color = "var(--text-muted)";
                    fallback.style.fontWeight = "bold";
                }

                // Distinct styling for Series cards
                card.style.background = "var(--background-secondary-alt)";
                card.style.border = "1px solid var(--background-modifier-border)";

                let displayTitle = series.metadata && series.metadata.title ? String(series.metadata.title) : series.name;
                let title = card.createEl("div", { text: displayTitle, cls: "bookshelf-item-title" });
                title.style.fontWeight = "bold";
                title.style.fontSize = "14px";
                title.style.wordBreak = "break-word";
                title.style.lineHeight = "1.2";
                title.style.maxHeight = "2.4em";
                title.style.overflow = "hidden";
                title.style.textOverflow = "ellipsis";
                title.style.display = "-webkit-box";
                title.style.webkitLineClamp = "2";
                title.style.webkitBoxOrient = "vertical";
                
                if (series.metadata && series.metadata.aliases) {
                    let a = series.metadata.aliases;
                    let arr = Array.isArray(a) ? a : (typeof a === "string" ? a.split(",") : []);
                    let validAliases = arr.map(x => String(x).trim()).filter(x => x);
                    if (validAliases.length > 0) {
                        let aliasEl = card.createEl("div", { text: validAliases.join(", ") });
                        aliasEl.style.fontSize = "11px";
                        aliasEl.style.color = "var(--text-muted)";
                        aliasEl.style.marginTop = "2px";
                        aliasEl.style.whiteSpace = "nowrap";
                        aliasEl.style.overflow = "hidden";
                        aliasEl.style.textOverflow = "ellipsis";
                    }
                }
                
                let count = card.createEl("div", { text: `${series.books.length} book(s)` });
                count.style.fontSize = "12px";
                count.style.color = "var(--text-muted)";
                count.style.marginTop = "4px";

                let libBadge = card.createEl("div", { text: series.library });
                libBadge.style.fontSize = "10px";
                libBadge.style.color = "var(--text-faint)";
                libBadge.style.marginTop = "auto";
                libBadge.style.paddingTop = "8px";

                card.onclick = async () => {
                    const leaf = this.plugin.app.workspace.getLeaf('tab');
                    await leaf.setViewState({
                        type: VIEW_TYPE_SERIES_DETAILS,
                        active: true,
                        state: { seriesId: series.id }
                    });
                };
                
                attachSeriesContextMenu(card, series, this.plugin);
            }
        };

        renderSeriesList(data.series);
        
        const seriesSentinel = container.createDiv();
        seriesSentinel.style.height = "20px";
        seriesSentinel.style.width = "100%";
        
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                if (currentLoadedCount < seriesCardElements.length) {
                    currentLoadedCount += currentLimit;
                    applyFilters(false);
                }
            }
        }, { threshold: 0.1 });
        observer.observe(seriesSentinel);
        
        const booksSection = container.createDiv();
        booksSection.style.display = "none";
        const booksHeader = booksSection.createEl("h3", { text: "Books", cls: "bookshelf-section-title" });
        booksHeader.style.marginTop = "30px";
        const booksGrid = booksSection.createDiv({ cls: "bookshelf-grid books-grid" });
        applyGridStyle(booksGrid);

        applyFilters = (resetCount = true) => {
            if (resetCount) currentLoadedCount = currentLimit;

            const query = searchInput.value.toLowerCase().trim();
            const writerQuery = writerInput.value.toLowerCase().trim();
            const statusQuery = statusSelect.value;
            const terms = query.split(/\s+/).filter(t => t);
            const writerTerms = writerQuery.split(/\s+/).filter(t => t);
            
            let isFiltering = query || writerQuery || statusQuery || includeGenres.size > 0 || excludeGenres.size > 0 || includeTags.size > 0 || excludeTags.size > 0 || includeLibraries.size > 0 || excludeLibraries.size > 0;
            
            if (recentContainer) {
                recentContainer.style.display = isFiltering ? "none" : "block";
            }
            
            let visibleSeries = 0;
            let matchedSeries = [];
            
            for (let item of seriesCardElements) {
                let s = item.series;
                let match = true;
                
                if (statusQuery) {
                    if (!s.metadata || s.metadata.status !== statusQuery) match = false;
                }
                
                if (match && writerQuery) {
                    let wMatch = false;
                    if (s.metadata && s.metadata.writers) {
                        let w = s.metadata.writers;
                        let arr = Array.isArray(w) ? w : (typeof w === "string" ? w.split(",") : []);
                        if (arr.some(writer => String(writer).toLowerCase().includes(writerQuery))) wMatch = true;
                    }
                    if (!wMatch && !s.metadata) {
                        for (let b of s.books) {
                            if (b.metadata && b.metadata.author && String(b.metadata.author).toLowerCase().includes(writerQuery)) {
                                wMatch = true; break;
                            }
                        }
                    }
                    if (!wMatch) match = false;
                }
                
                if (match && (includeGenres.size > 0 || excludeGenres.size > 0)) {
                    let sGenres = [];
                    if (s.metadata) {
                        let g1 = s.metadata.genres;
                        if (Array.isArray(g1)) sGenres.push(...g1.map(x => String(x).trim().toLowerCase()));
                        else if (typeof g1 === "string") sGenres.push(...g1.split(",").map(x => x.trim().toLowerCase()));
                        let g2 = s.metadata.genre;
                        if (Array.isArray(g2)) sGenres.push(...g2.map(x => String(x).trim().toLowerCase()));
                        else if (typeof g2 === "string") sGenres.push(...g2.split(",").map(x => x.trim().toLowerCase()));
                    }
                    
                    for (let g of excludeGenres) {
                        if (sGenres.includes(g.toLowerCase())) { match = false; break; }
                    }
                    if (match) {
                        for (let g of includeGenres) {
                            if (!sGenres.includes(g.toLowerCase())) { match = false; break; }
                        }
                    }
                }
                
                if (match && (includeTags.size > 0 || excludeTags.size > 0)) {
                    let sTags = [];
                    if (s.metadata) {
                        let t1 = s.metadata.tags;
                        if (Array.isArray(t1)) sTags.push(...t1.map(x => String(x).trim().toLowerCase()));
                        else if (typeof t1 === "string") sTags.push(...t1.split(",").map(x => x.trim().toLowerCase()));
                        let t2 = s.metadata.tag;
                        if (Array.isArray(t2)) sTags.push(...t2.map(x => String(x).trim().toLowerCase()));
                        else if (typeof t2 === "string") sTags.push(...t2.split(",").map(x => x.trim().toLowerCase()));
                    }
                    
                    for (let t of excludeTags) {
                        if (sTags.includes(t.toLowerCase())) { match = false; break; }
                    }
                    if (match) {
                        for (let t of includeTags) {
                            if (!sTags.includes(t.toLowerCase())) { match = false; break; }
                        }
                    }
                }
                
                if (match && (includeLibraries.size > 0 || excludeLibraries.size > 0)) {
                    if (excludeLibraries.has(s.library)) { match = false; }
                    else if (includeLibraries.size > 0 && !includeLibraries.has(s.library)) { match = false; }
                }
                
                if (match && query) {
                    let textMatch = false;
                    if (s.name.toLowerCase().includes(query)) textMatch = true;
                    else if (s.metadata && s.metadata.title && String(s.metadata.title).toLowerCase().includes(query)) textMatch = true;
                    else if (s.metadata && s.metadata.aliases) {
                        let a = s.metadata.aliases;
                        let arr = Array.isArray(a) ? a : (typeof a === "string" ? a.split(",") : []);
                        if (arr.some(al => String(al).toLowerCase().includes(query))) textMatch = true;
                    }
                    if (!textMatch && s.metadata && s.metadata.writers) {
                        let w = s.metadata.writers;
                        let arr = Array.isArray(w) ? w : (typeof w === "string" ? w.split(",") : []);
                        if (arr.some(writer => String(writer).toLowerCase().includes(query))) textMatch = true;
                    }
                    if (!textMatch && !s.metadata) {
                        for (let b of s.books) {
                            if (b.metadata && b.metadata.author && String(b.metadata.author).toLowerCase().includes(query)) {
                                textMatch = true; break;
                            }
                        }
                    }
                    match = textMatch;
                }
                
                if (match) {
                    matchedSeries.push(item);
                } else {
                    item.card.style.display = "none";
                }
            }
            
            if (currentSort === "name") {
                matchedSeries.sort((a, b) => {
                    let nameA = a.series.metadata && a.series.metadata.title ? String(a.series.metadata.title) : a.series.name;
                    let nameB = b.series.metadata && b.series.metadata.title ? String(b.series.metadata.title) : b.series.name;
                    return nameA.localeCompare(nameB);
                });
            } else if (currentSort === "lastUpdate") {
                matchedSeries.sort((a, b) => b.series.lastAdded - a.series.lastAdded);
            }
            
            visibleSeries = matchedSeries.length;
            
            for (let i = 0; i < matchedSeries.length; i++) {
                let item = matchedSeries[i];
                if (i < currentLoadedCount) {
                    seriesGrid.appendChild(item.card); // Re-append in sorted order
                    item.card.style.display = "flex";
                } else {
                    item.card.style.display = "none";
                }
            }
            
            seriesHeader.innerText = isFiltering ? `Series (${visibleSeries} found)` : `Series (${data.series.length})`;
            
            if (isFiltering) {
                booksSection.style.display = "block";
                booksGrid.empty();
                
                let matchedBooks = [];
                for (let s of data.series) {
                    let match = true;
                    
                    if (statusQuery) {
                        if (!s.metadata || s.metadata.status !== statusQuery) match = false;
                    }
                    
                    if (match && writerQuery) {
                        let wMatch = false;
                        if (s.metadata && s.metadata.writers) {
                            let w = s.metadata.writers;
                            let arr = Array.isArray(w) ? w : (typeof w === "string" ? w.split(",") : []);
                            if (arr.some(writer => String(writer).toLowerCase().includes(writerQuery))) wMatch = true;
                        }
                        if (!wMatch && !s.metadata) {
                            for (let b of s.books) {
                                if (b.metadata && b.metadata.author && String(b.metadata.author).toLowerCase().includes(writerQuery)) {
                                    wMatch = true; break;
                                }
                            }
                        }
                        if (!wMatch) match = false;
                    }
                    
                    if (match && (includeGenres.size > 0 || excludeGenres.size > 0)) {
                        let sGenres = [];
                        if (s.metadata) {
                            let g1 = s.metadata.genres;
                            if (Array.isArray(g1)) sGenres.push(...g1.map(x => String(x).trim().toLowerCase()));
                            else if (typeof g1 === "string") sGenres.push(...g1.split(",").map(x => x.trim().toLowerCase()));
                            let g2 = s.metadata.genre;
                            if (Array.isArray(g2)) sGenres.push(...g2.map(x => String(x).trim().toLowerCase()));
                            else if (typeof g2 === "string") sGenres.push(...g2.split(",").map(x => x.trim().toLowerCase()));
                        }
                        for (let g of excludeGenres) {
                            if (sGenres.includes(g.toLowerCase())) { match = false; break; }
                        }
                        if (match) {
                            for (let g of includeGenres) {
                                if (!sGenres.includes(g.toLowerCase())) { match = false; break; }
                            }
                        }
                    }
                    
                    if (match && (includeTags.size > 0 || excludeTags.size > 0)) {
                        let sTags = [];
                        if (s.metadata) {
                            let t1 = s.metadata.tags;
                            if (Array.isArray(t1)) sTags.push(...t1.map(x => String(x).trim().toLowerCase()));
                            else if (typeof t1 === "string") sTags.push(...t1.split(",").map(x => x.trim().toLowerCase()));
                            let t2 = s.metadata.tag;
                            if (Array.isArray(t2)) sTags.push(...t2.map(x => String(x).trim().toLowerCase()));
                            else if (typeof t2 === "string") sTags.push(...t2.split(",").map(x => x.trim().toLowerCase()));
                        }
                        for (let t of excludeTags) {
                            if (sTags.includes(t.toLowerCase())) { match = false; break; }
                        }
                        if (match) {
                            for (let t of includeTags) {
                                if (!sTags.includes(t.toLowerCase())) { match = false; break; }
                            }
                        }
                    }
                    
                    if (match && (includeLibraries.size > 0 || excludeLibraries.size > 0)) {
                        if (excludeLibraries.has(s.library)) { match = false; }
                        else if (includeLibraries.size > 0 && !includeLibraries.has(s.library)) { match = false; }
                    }
                    
                    if (!match) continue;
                    
                    for (let b of s.books) {
                        let isMatch = true;
                        if (terms.length > 0) {
                            let t = (b.metadata.title || b.basename).toLowerCase();
                            let fn = b.file.name.toLowerCase();
                            isMatch = terms.every(term => t.includes(term) || fn.includes(term));
                        }
                        if (isMatch) matchedBooks.push(b);
                    }
                }
                
                booksHeader.innerText = `Books (${matchedBooks.length} found)`;
                
                let displayBooks = matchedBooks.slice(0, 50);
                renderBooks(booksGrid, displayBooks, this.plugin);
                
                if (matchedBooks.length > 50) {
                    let msg = booksGrid.createDiv({ text: `Showing top 50 of ${matchedBooks.length} results.` });
                    msg.style.cssText = "grid-column: 1 / -1; color: var(--text-muted); font-size: 13px; text-align: center; margin-top: 10px; width: 100%;";
                }
            } else {
                booksSection.style.display = "none";
                booksGrid.empty();
            }
        };

        searchInput.addEventListener("input", applyFilters);
        writerInput.addEventListener("input", applyFilters);
        statusSelect.addEventListener("change", applyFilters);
        
        applyFilters();
    }
}

class BookshelfSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async renderHowToTab(container) {
        container.empty();
        container.createEl("p", { text: "Loading instructions..." });

        let fileContents = [
            {
                title: "How to Setup Libraries",
                text: `1. Open Obsidian **Settings** (gear icon).
2. Scroll down to **Community Plugins** and click on **Shiori Bookshelf**.
3. Locate the **Series Libraries** and **Single Libraries** text boxes.
4. Type or paste the exact paths to your folders, **one folder per line**. 
   - *Example:*
     \`\`\`
     Libraries/Manga
     Libraries/Comics
     \`\`\`
5. The plugin automatically saves your changes as you type.

*(Imagine screenshot here: The settings page showing the text areas for Series and Single libraries)*

## Ignoring Folders

If you have specific subfolders inside your libraries that you do not want to be scanned (e.g., a folder containing assets or templates), you can add them to the ignore list.

1. Open the Shiori Bookshelf **Settings**.
2. Scroll down to **Ignore Folders**.
3. Enter a comma-separated list of folder names to ignore. By default, \`_ignore\` is already added.
4. Any folder with this exact name will be completely skipped during the scanning process.`
            },
            {
                title: "How to Use the Bookshelf View",
                text: `The Bookshelf View is the core feature of the Shiori Bookshelf plugin, providing a beautiful, gallery-style interface to browse and manage your digital library.

## Opening the Bookshelf

There are two ways to open the Shiori Bookshelf:

1. **Via the Ribbon Icon:** Click the library icon (looks like a folder/books) in the left sidebar ribbon of Obsidian.
2. **Via the Command Palette:** Press \`Ctrl+P\` (or \`Cmd+P\` on Mac), search for "Open Shiori Bookshelf", and press Enter.

## Setting the Bookshelf as Your Homepage

If you want the Bookshelf to be the first thing you see when you open Obsidian:

1. Open Obsidian **Settings** -> **Shiori Bookshelf**.
2. Toggle on **"Set Shiori Bookshelf as Homepage"**.
3. Now, whenever you launch Obsidian, the Bookshelf view will automatically open and pin itself to your workspace.

## Browsing and Navigation

- **Main View:** Displays all your Series and Single books as large cover cards.
- **Series Sorting:** By default, Series are sorted by "Last Update" (the series containing the most recently added book appears first). 
- **Lazy Loading:** The bookshelf loads 50 items at a time to keep Obsidian running smoothly. Simply scroll to the bottom of the page to load the next 50 items automatically.
- **Opening a Series:** Click on any Series card to open the **Series Details** view. This view will list all the books contained within that specific series.
- **Opening a Book:** Click on any book card (either in the main view or inside a series) to open the actual PDF, EPUB, or CBZ file in a new Obsidian tab for reading.

*(Imagine screenshot here: The main Bookshelf grid view with cover images)*

## Searching and Filtering

At the top of the Bookshelf view, you will find a sticky search bar to quickly locate your books.

- **Title / File Name:** Type in the first search box to instantly filter books and series by their title or file name.
- **Writer:** Type in the second search box to filter by the author/writer. (Note: The writer information must be filled out in the book's metadata file for this to work).
- **Status Filter:** Use the dropdown menu to filter books by their reading status:
  - **All:** Shows everything.
  - **Read:** Shows only books you have marked as finished.
  - **Unread:** Shows new, unread books.
  - **Reading:** Shows books you are currently in the middle of reading.

*(Imagine screenshot here: The top search and filter bar of the Bookshelf)*`
            },
            {
                title: "How to Manage Metadata and Covers",
                text: `Shiori Bookshelf relies on two "companion" files for every book to make the library function perfectly: a Cover Image and a Metadata file.

## 1. Automated Cover Extraction

When you add a new PDF, EPUB, or CBZ file to a folder that is part of your library, the plugin will automatically attempt to extract its cover.

- The extracted cover is saved in the exact same folder as the book.
- It is named \`[Book Name]_cover.jpg\`.
- This image is what you see in the beautiful Bookshelf gallery view.

### Manual Scanning
Sometimes you might add hundreds of books at once, or a cover extraction might fail. You can manually force the plugin to scan a folder and extract any missing covers:

1. Right-click on the folder in the Obsidian file explorer.
2. Select **Scan**.
3. A notice will appear in the top right corner indicating how many missing covers were successfully extracted.

*(Imagine screenshot here: Right-clicking a library folder and selecting "Scan")*

## 2. The Metadata File

To keep track of details like the author and whether you have finished reading a book, the plugin creates a companion markdown (\`.md\`) file.

- It is named exactly the same as your book (e.g., \`MyBook.pdf\` will have a metadata file called \`MyBook.md\`).
- This file contains YAML frontmatter where the data is stored.

### Editing Metadata
You can edit this data directly from the Bookshelf View using the dropdowns and inputs below the cover, OR you can manually edit the file.

To quickly open a book's metadata file:
1. Right-click on the book file (e.g., the PDF or EPUB) in the Obsidian file explorer.
2. Click **Open Metadata file**.
3. The \`.md\` file will open in a new tab, allowing you to edit properties like \`writer\`, \`status\`, and \`title\`.

*(Imagine screenshot here: Right-clicking a PDF and selecting "Open Metadata file")*

## 3. Hiding Companion Files

Having a \`_cover.jpg\` and a \`.md\` file for every single book can quickly clutter your Obsidian file explorer. You can hide them to keep your workspace clean!

1. Open Obsidian **Settings** -> **Shiori Bookshelf**.
2. Toggle on **"Hide cover images in file explorer"**.
3. Toggle on **"Hide book metadata files"**.

Once enabled, these files will become completely invisible in the left sidebar, but they will still exist and power your library perfectly in the background.`
            },
            {
                title: "How to Use Force Rename",
                text: `Obsidian has strict rules about file naming. It prevents you from using characters like \`#\`, \`^\`, \`[\`, \`]\`, and \`|\` because these characters can break Markdown linking. 

However, when managing a library of PDFs or comic books, you might *want* these characters in your file names (for example, \`[Group] Manga Title v01.cbz\`). 

Shiori Bookshelf provides a "Force Rename" feature that bypasses Obsidian's restrictions specifically for your library files.

## Enabling Force Rename

1. Open Obsidian **Settings** -> **Shiori Bookshelf**.
2. Toggle on **"Enable Force Rename"**.

*Warning: Renaming a file with restricted characters means you will not be able to easily link to it from other markdown notes using \`[[Link]]\`. This feature is designed specifically for library files that you do not intend to cross-link.*

## Using Force Rename

1. In the Obsidian file explorer, **Right-click** on the folder or file you want to rename.
2. At the bottom of the context menu, just above Obsidian's default "Rename..." option, click on **Force Rename...**.
3. A popup window will appear with text boxes.

### Renaming a Folder
If you right-clicked a folder, you will see a single long text box.
- Simply type the new name, including any special characters you want (e.g., \`[TranslationGroup] Series Name\`).
- Press \`Enter\` or click the **Force Rename** button.

### Renaming a File
If you right-clicked a file (like a \`.pdf\` or \`.cbz\`), you will see **two text boxes** separated by a dot (\`.\`).
- **Left Box:** This is the name of the file. Type your new name here.
- **Right Box:** This is the file extension (e.g., \`pdf\`, \`cbz\`). It is usually best to leave this alone unless you need to fix a broken extension.
- Press \`Enter\` from either box, or click the **Force Rename** button.

*(Imagine screenshot here: The Force Rename popup showing the two text boxes for file name and extension)*

## Automated Syncing

When you use Force Rename on a book file, the plugin does more than just rename the PDF/CBZ! It automatically finds the associated \`_cover.jpg\` and \`.md\` metadata files and renames them to match the new file name exactly. This ensures your Bookshelf gallery never breaks.`
            }
        ];

        container.empty();
        const { MarkdownRenderer } = require('obsidian');
        
        const detailsElements = [];
        
        for (let i = 0; i < fileContents.length; i++) {
            let item = fileContents[i];
            
            let details = container.createEl("details");
            details.style.cssText = "margin-bottom: 10px; border: 1px solid var(--background-modifier-border); border-radius: 6px; padding: 5px 10px; background: var(--background-secondary);";
            detailsElements.push(details);
            
            // Accordion behavior: auto-collapse others
            details.addEventListener("toggle", (e) => {
                if (details.open) {
                    detailsElements.forEach(d => {
                        if (d !== details && d.open) d.open = false;
                    });
                }
            });

            let summary = details.createEl("summary");
            summary.style.cssText = "font-weight: 600; cursor: pointer; padding: 5px 0; font-size: 1.1em; color: var(--text-normal);";
            summary.innerText = item.title;

            let contentDiv = details.createDiv();
            contentDiv.style.cssText = "margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--background-modifier-border); user-select: text; -webkit-user-select: text;";
            
            await MarkdownRenderer.renderMarkdown(item.text, contentDiv, '', this.plugin);
        }
    }

    async renderRecommendedTab(container) {
        container.empty();
        const md = `> [!TIP]\n> **Recommended Plugin for EPUBs:** \n> Obsidian does not natively support reading \`.epub\` files. To read them directly inside Obsidian, we highly recommend using the **EPUB Reader with TTS** plugin.\n> - **Community Plugin:** [EPUB Reader with TTS](obsidian://show-plugin?id=epub-reader-with-tts)\n> - **GitHub:** [obsidian-plugins-epub-reader-with-tts](https://github.com/usero2/obsidian-plugins-epub-reader-with-tts)\n\n> [!TIP]\n> **Recommended Plugin for CBZs (Manga):** \n> Obsidian does not natively support reading \`.cbz\` or \`.cbr\` files. To read them directly inside Obsidian, we highly recommend using the **CBZ Reader** plugin.\n> - **Community Plugin:** [CBZ Reader](obsidian://show-plugin?id=cbz-reader)\n> - **GitHub:** [obsidian-plugins-cbz-reader](https://github.com/usero2/obsidian-plugins-cbz-reader)`;
        const { MarkdownRenderer } = require('obsidian');
        await MarkdownRenderer.renderMarkdown(md, container, '', this.plugin);
    }

    display() {
        const {containerEl} = this;
        containerEl.empty();
        
        containerEl.createEl("h2").innerHTML = "Shiori <span style='font-size:0.7em'>Bookshelf</span> Settings";

        const tabsContainer = containerEl.createDiv();
        tabsContainer.style.cssText = "display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 5px;";

        const btnGeneral = tabsContainer.createEl("button", { text: "General" });
        const btnWebServer = tabsContainer.createEl("button", { text: "Web Server" });
        const btnHowTo = tabsContainer.createEl("button", { text: "How to" });
        const btnRecommended = tabsContainer.createEl("button", { text: "Recommended Reader" });

        const activeStyle = "background: var(--interactive-accent); color: var(--text-on-accent);";
        const inactiveStyle = "background: transparent; color: var(--text-muted); box-shadow: none;";

        btnGeneral.style.cssText = activeStyle;
        btnWebServer.style.cssText = inactiveStyle;
        btnHowTo.style.cssText = inactiveStyle;
        btnRecommended.style.cssText = inactiveStyle;

        const generalContainer = containerEl.createDiv();
        
        const webServerContainer = containerEl.createDiv();
        webServerContainer.style.display = "none";

        const howToContainer = containerEl.createDiv();
        howToContainer.style.display = "none";
        howToContainer.style.userSelect = "text";
        howToContainer.style.webkitUserSelect = "text";
        
        const recommendedContainer = containerEl.createDiv();
        recommendedContainer.style.display = "none";
        recommendedContainer.style.userSelect = "text";
        recommendedContainer.style.webkitUserSelect = "text";

        btnGeneral.onclick = () => {
            btnGeneral.style.cssText = activeStyle;
            btnWebServer.style.cssText = inactiveStyle;
            btnHowTo.style.cssText = inactiveStyle;
            btnRecommended.style.cssText = inactiveStyle;
            generalContainer.style.display = "block";
            webServerContainer.style.display = "none";
            howToContainer.style.display = "none";
            recommendedContainer.style.display = "none";
        };

        btnWebServer.onclick = () => {
            btnWebServer.style.cssText = activeStyle;
            btnGeneral.style.cssText = inactiveStyle;
            btnHowTo.style.cssText = inactiveStyle;
            btnRecommended.style.cssText = inactiveStyle;
            webServerContainer.style.display = "block";
            generalContainer.style.display = "none";
            howToContainer.style.display = "none";
            recommendedContainer.style.display = "none";
        };

        btnHowTo.onclick = () => {
            btnHowTo.style.cssText = activeStyle;
            btnGeneral.style.cssText = inactiveStyle;
            btnWebServer.style.cssText = inactiveStyle;
            btnRecommended.style.cssText = inactiveStyle;
            howToContainer.style.display = "block";
            generalContainer.style.display = "none";
            webServerContainer.style.display = "none";
            recommendedContainer.style.display = "none";
            if (!this.howToRendered) {
                this.renderHowToTab(howToContainer);
                this.howToRendered = true;
            }
        };

        btnRecommended.onclick = () => {
            btnRecommended.style.cssText = activeStyle;
            btnGeneral.style.cssText = inactiveStyle;
            btnWebServer.style.cssText = inactiveStyle;
            btnHowTo.style.cssText = inactiveStyle;
            recommendedContainer.style.display = "block";
            generalContainer.style.display = "none";
            webServerContainer.style.display = "none";
            howToContainer.style.display = "none";
            if (!this.recommendedRendered) {
                this.renderRecommendedTab(recommendedContainer);
                this.recommendedRendered = true;
            }
        };
        
        let desc = generalContainer.createEl("p", { text: "This plugin supports reading PDF, EPUB, and CBZ files." });
        desc.style.color = "var(--text-muted)";
        desc.style.fontSize = "14px";
        desc.style.marginBottom = "20px";

        new Setting(generalContainer)
            .setName("Set Shiori Bookshelf as Homepage")
            .setDesc("Automatically open and pin the Shiori Bookshelf view when Obsidian starts.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.setAsHomepage)
                .onChange(async (value) => {
                    this.plugin.settings.setAsHomepage = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(generalContainer)
            .setName("Enable Force Rename")
            .setDesc("Adds a 'Force Rename' button to series and books, allowing you to use restricted characters like #, ^, [, ], |. WARNING: This breaks Obsidian's markdown linking.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableForceRename)
                .onChange(async (value) => {
                    this.plugin.settings.enableForceRename = value;
                    await this.plugin.saveSettings();
                }));

        const adjustRows = (el) => {
            const lines = (el.value || "").split('\n').length;
            el.rows = Math.max(4, lines);
        };

        new Setting(generalContainer)
            .setName("Series Libraries")
            .setDesc("List your series library folders here, one per line. Books in these folders will be grouped into series by subfolder.")
            .addTextArea(text => {
                text.setPlaceholder("Lite Novel\nManga")
                    .setValue(this.plugin.settings.libraries)
                    .onChange(async (value) => {
                        this.plugin.settings.libraries = value;
                        adjustRows(text.inputEl);
                        await this.plugin.saveSettings();
                    });
                text.inputEl.cols = 40;
                adjustRows(text.inputEl);
                text.inputEl.addEventListener('input', () => adjustRows(text.inputEl));
            });

        new Setting(generalContainer)
            .setName("Single Libraries")
            .setDesc("List your single library folders here, one per line. Books in these folders will be treated as individual, standalone items, regardless of subfolders.")
            .addTextArea(text => {
                text.setPlaceholder("Ebooks\nTextbooks")
                    .setValue(this.plugin.settings.singleLibraries)
                    .onChange(async (value) => {
                        this.plugin.settings.singleLibraries = value;
                        adjustRows(text.inputEl);
                        await this.plugin.saveSettings();
                    });
                text.inputEl.cols = 40;
                adjustRows(text.inputEl);
                text.inputEl.addEventListener('input', () => adjustRows(text.inputEl));
            });



        new Setting(generalContainer)
            .setName("Hide cover images in file explorer")
            .setDesc("When enabled, automatically extracted cover images (files ending with _cover.jpg) will be hidden from the navigation pane.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.hideCoverFiles)
                .onChange(async (value) => {
                    this.plugin.settings.hideCoverFiles = value;
                    await this.plugin.saveSettings();
                    this.plugin.applyHideCoverCss();
                }));


        new Setting(generalContainer)
            .setName("Hide book metadata files")
            .setDesc("When enabled, metadata .md files that share the exact same name as supported book files will be hidden from the file explorer.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.hideBookMdFiles)
                .onChange(async (value) => {
                    this.plugin.settings.hideBookMdFiles = value;
                    await this.plugin.saveSettings();
                    this.plugin.triggerUpdateHideBookMdCss();
                }));

        new Setting(generalContainer)
            .setName("Ignore Folders")
            .setDesc("Comma-separated list of folder names to ignore during scan. Books in these folders will not be shown.")
            .addText(text => text
                .setPlaceholder("_ignore")
                .setValue(this.plugin.settings.ignoreFolders)
                .onChange(async (value) => {
                    this.plugin.settings.ignoreFolders = value;
                    await this.plugin.saveSettings();
                }));
                
        new Setting(generalContainer)
            .setName("Gemini API Key")
            .setDesc("API Key for Gemini AI to auto-fill series metadata. Get it free from Google AI Studio.")
            .addText(text => text
                .setPlaceholder("AIzaSy...")
                .setValue(this.plugin.settings.geminiApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.geminiApiKey = value;
                    await this.plugin.saveSettings();
                }));
                
        new Setting(generalContainer)
            .setName("Gemini Model")
            .setDesc("The AI model to use. Try 'gemini-2.0-flash', 'gemini-1.5-flash' or 'gemini-pro'.")
            .addText(text => text
                .setPlaceholder("gemini-1.5-flash")
                .setValue(this.plugin.settings.geminiModel)
                .onChange(async (value) => {
                    this.plugin.settings.geminiModel = value;
                    await this.plugin.saveSettings();
                }));

        // Web Server Settings
        webServerContainer.createEl("p", { text: "Access your Bookshelf from a web browser on other devices (e.g. phone or tablet) over your local network." }).style.color = "var(--text-muted)";
        
        new Setting(webServerContainer)
            .setName("Enable Web Server")
            .setDesc("Turn on the local web server. Restart required to apply port changes.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWebServer)
                .onChange(async (value) => {
                    this.plugin.settings.enableWebServer = value;
                    await this.plugin.saveSettings();
                    if (value) {
                        this.plugin.webServer.start();
                    } else {
                        this.plugin.webServer.stop();
                    }
                }));

        new Setting(webServerContainer)
            .setName("Web Server Port")
            .setDesc("The port to run the web server on (default: 7070).")
            .addText(text => text
                .setPlaceholder("7070")
                .setValue(String(this.plugin.settings.webServerPort))
                .onChange(async (value) => {
                    this.plugin.settings.webServerPort = parseInt(value) || 7070;
                    await this.plugin.saveSettings();
                    if (this.plugin.settings.enableWebServer) {
                        this.plugin.webServer.start(); // restarts with new port
                    }
                }));
    }
}

class DummyExtView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
    }
    getViewType() { return VIEW_TYPE_DUMMY_EXT; }
    getDisplayText() { return "Opening file..."; }
    getIcon() { return "document"; }

    async setState(state, result) {
        await super.setState(state, result);
        if (state && state.file) {
            const file = this.plugin.app.vault.getAbstractFileByPath(state.file);
            if (file) {
                this.plugin.app.openWithDefaultApp(file.path);
            }
        }
        setTimeout(() => this.leaf.detach(), 100);
    }
}

class BookshelfPlugin extends Plugin {
    async onload() {
        await this.loadSettings();
        
        this.webServer = new BookshelfServer(this);
        this.webServer.start();

        this.registerView(VIEW_TYPE_BOOKSHELF, (leaf) => new BookshelfView(leaf, this));
        this.registerView(VIEW_TYPE_SERIES_DETAILS, (leaf) => new SeriesDetailsView(leaf, this));
        this.registerView(VIEW_TYPE_DUMMY_EXT, (leaf) => new DummyExtView(leaf, this));
        // Dynamically surrender extensions if another plugin wants them
        this.originalRegisterExtensions = this.app.viewRegistry.registerExtensions.bind(this.app.viewRegistry);
        this.app.viewRegistry.registerExtensions = (exts, type) => {
            if (type !== VIEW_TYPE_DUMMY_EXT) {
                const overlap = exts.filter(e => ["cbz", "cbr", "mobi", "zip", "epub"].includes(e));
                if (overlap.length > 0) {
                    try {
                        if (this.app.viewRegistry.unregisterExtensions) {
                            this.app.viewRegistry.unregisterExtensions(overlap);
                        }
                    } catch (e) {}
                }
            }
            return this.originalRegisterExtensions(exts, type);
        };

        // Dynamically reclaim extensions if another plugin drops them
        if (this.app.viewRegistry.unregisterExtensions) {
            this.originalUnregisterExtensions = this.app.viewRegistry.unregisterExtensions.bind(this.app.viewRegistry);
            this.app.viewRegistry.unregisterExtensions = (exts) => {
                this.originalUnregisterExtensions(exts);
                const reclaim = exts.filter(e => ["cbz", "cbr", "mobi", "zip", "epub"].includes(e));
                if (reclaim.length > 0) {
                    setTimeout(() => {
                        try { this.originalRegisterExtensions(reclaim, VIEW_TYPE_DUMMY_EXT); } catch (e) {}
                    }, 10);
                }
            };
        }

        this.app.workspace.onLayoutReady(() => {
            const extsToRegister = ["cbz", "cbr", "mobi", "zip", "epub"].filter(ext => {
                return !this.app.viewRegistry.getTypeByExtension(ext);
            });
            if (extsToRegister.length > 0) {
                try { this.originalRegisterExtensions(extsToRegister, VIEW_TYPE_DUMMY_EXT); } catch (e) {}
            }
        });

        const handleIntercept = (evt) => {
            if (evt.button !== 0 && evt.button !== 1) return;
            
            let targetPath = null;
            
            const navFileTitle = evt.target.closest('.nav-file-title');
            if (navFileTitle) {
                targetPath = navFileTitle.getAttribute('data-path');
            } else {
                const link = evt.target.closest('.internal-link');
                if (link) {
                    const href = link.getAttribute('data-href');
                    if (href) {
                        const file = this.app.metadataCache.getFirstLinkpathDest(href, "");
                        if (file) targetPath = file.path;
                    }
                }
            }

            if (targetPath) {
                const ext = targetPath.split('.').pop().toLowerCase();
                const viewType = this.app.viewRegistry ? this.app.viewRegistry.getTypeByExtension(ext) : null;
                if (viewType === VIEW_TYPE_DUMMY_EXT) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    this.app.openWithDefaultApp(targetPath);
                }
            }
        };

        this.registerDomEvent(document, 'click', handleIntercept, { capture: true });
        this.registerDomEvent(document, 'auxclick', handleIntercept, { capture: true });

        this.addRibbonIcon('library', 'Open Shiori Bookshelf', () => {
            this.activateView();
        });

        this.addCommand({
            id: 'open-bookshelf',
            name: 'Open Shiori Bookshelf',
            callback: () => {
                this.activateView();
            }
        });
        
        this.addCommand({
            id: 'extract-missing-covers',
            name: 'Extract Missing Covers',
            callback: () => {
                this.extractAllMissingCovers();
            }
        });

        this.addSettingTab(new BookshelfSettingTab(this.app, this));
        this.applyHideCoverCss();
        this.applyHideBookMdCss();

        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {


                if (file && file.children) {
                    let libArr = this.settings.libraries.split("\n").map(l => l.trim()).filter(l => l);
                    let singleArr = this.settings.singleLibraries.split("\n").map(l => l.trim()).filter(l => l);

                    let isInsideLib = false;
                    for (let lib of libArr) {
                        if (file.path === lib || file.path.startsWith(lib + "/")) {
                            isInsideLib = true; break;
                        }
                    }
                    if (!isInsideLib) {
                        for (let lib of singleArr) {
                            if (file.path === lib || file.path.startsWith(lib + "/")) {
                                isInsideLib = true; break;
                            }
                        }
                    }

                    if (!isInsideLib) {
                        menu.addSeparator();
                        menu.addItem((item) => {
                            item.setTitle("Add to Series Libraries")
                                .setIcon("folder-plus")
                                .onClick(async () => {
                                    let libs = this.settings.libraries.split("\n").map(l => l.trim()).filter(l => l);
                                    if (!libs.includes(file.path)) {
                                        libs.push(file.path);
                                        this.settings.libraries = libs.join("\n");
                                        await this.saveSettings();
                                        new Notice("Added to Series Libraries: " + file.path);
                                    }
                                });
                        });

                        menu.addItem((item) => {
                            item.setTitle("Add to Single Libraries")
                                .setIcon("folder-plus")
                                .onClick(async () => {
                                    let libs = this.settings.singleLibraries.split("\n").map(l => l.trim()).filter(l => l);
                                    if (!libs.includes(file.path)) {
                                        libs.push(file.path);
                                        this.settings.singleLibraries = libs.join("\n");
                                        await this.saveSettings();
                                        new Notice("Added to Single Libraries: " + file.path);
                                    }
                                });
                        });
                    }

                    if (isInsideLib) {
                        menu.addSeparator();
                        menu.addItem((item) => {
                            item.setTitle("Scan")
                                .setIcon("refresh-cw")
                                .onClick(async () => {
                                    this.extractMissingCoversForFolder(file);
                                });
                        });
                    }
                } else if (file && !file.children) {
                    const exts = this.settings.extensions.split(",").map(e => e.trim().toLowerCase());
                    if (exts.includes(file.extension.toLowerCase())) {
                        menu.addSeparator();
                        menu.addItem((item) => {
                            item.setTitle("Open Metadata file")
                                .setIcon("file-text")
                                .onClick(async () => {
                                    let mdPath = file.path.substring(0, file.path.lastIndexOf(".")) + ".md";
                                    let mdFile = this.app.vault.getAbstractFileByPath(mdPath);
                                    if (mdFile) {
                                        this.app.workspace.getLeaf(false).openFile(mdFile);
                                    } else {
                                        new Notice("Metadata file not found.");
                                    }
                                });
                        });
                    }
                }

                if (this.settings.enableForceRename) {
                    menu.addItem((item) => {
                        item.setTitle("Force Rename...")
                            .setIcon("pencil")
                            .onClick(() => {
                                new ForceRenameModal(this.app, file, this).open();
                            });
                    });
                }
            })
        );

        this.registerEvent(this.app.vault.on("rename", async (file, oldPath) => {
            if (file && file.children) {
                let oldName = oldPath.split("/").pop();
                let newName = file.name;
                
                setTimeout(async () => {
                    let oldNotePath = `${file.path}/${oldName}.md`;
                    let folderNote = this.app.vault.getAbstractFileByPath(oldNotePath);
                    
                    if (folderNote && folderNote.extension === "md") {
                        let newNotePath = `${file.path}/${newName}.md`;
                        try {
                            await this.app.vault.rename(folderNote, newNotePath);
                        } catch (e) {
                            console.error("Bookshelf: Failed to rename folder note", e);
                        }
                    }
                }, 500);
            } else if (file && !file.children) {
                const exts = this.settings.extensions.split(",").map(e => e.trim().toLowerCase());
                if (exts.includes(file.extension.toLowerCase())) {
                    let oldBase = oldPath.substring(0, oldPath.lastIndexOf('.'));
                    if (oldBase === oldPath) oldBase = oldPath;
                    let oldMdPath = oldBase + ".md";
                    
                    setTimeout(async () => {
                        let mdFile = this.app.vault.getAbstractFileByPath(oldMdPath);
                        if (mdFile && mdFile.extension === "md") {
                            let newBase = file.path.substring(0, file.path.lastIndexOf('.'));
                            let newMdPath = newBase + ".md";
                            try {
                                await this.app.vault.rename(mdFile, newMdPath);
                            } catch (e) {
                                console.error("Bookshelf: Failed to rename book md file", e);
                            }
                        }
                    }, 500);
                }
            }
            
            const mdFiles = this.app.vault.getMarkdownFiles();
            for (let md of mdFiles) {
                const cache = this.app.metadataCache.getFileCache(md);
                if (cache && cache.frontmatter && cache.frontmatter.cover) {
                    let coverPath = String(cache.frontmatter.cover);
                    if (coverPath === oldPath || coverPath.startsWith(oldPath + "/")) {
                        let newCoverPath = file.path + coverPath.substring(oldPath.length);
                        try {
                            await this.app.fileManager.processFrontMatter(md, (fm) => {
                                fm.cover = newCoverPath;
                            });
                        } catch (e) {
                            console.error(`Bookshelf: Failed to update cover path in ${md.path}`, e);
                        }
                    }
                }
            }
            this.triggerUpdateHideBookMdCss();
        }));

        this.registerEvent(this.app.vault.on("create", () => this.triggerUpdateHideBookMdCss()));
        this.registerEvent(this.app.vault.on("delete", () => this.triggerUpdateHideBookMdCss()));

        this.app.workspace.onLayoutReady(async () => {
            if (this.settings.setAsHomepage) {
                const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BOOKSHELF);
                let leaf = null;
                if (leaves.length === 0) {
                    leaf = this.app.workspace.getLeaf(true);
                    await leaf.setViewState({ type: VIEW_TYPE_BOOKSHELF, active: true });
                } else {
                    leaf = leaves[0];
                }
                leaf.setPinned(true);
                this.app.workspace.revealLeaf(leaf);
            }
        });

        this.registerEvent(this.app.workspace.on('layout-change', async () => {
            if (this.settings.setAsHomepage) {
                const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BOOKSHELF);
                if (leaves.length === 0) {
                    let leaf = this.app.workspace.getLeaf(true);
                    await leaf.setViewState({ type: VIEW_TYPE_BOOKSHELF, active: false });
                    leaf.setPinned(true);
                }
            }
        }));
    }

    onunload() {
        if (this.webServer) this.webServer.stop();
        this.applyHideCoverCss(false);
        this.applyHideBookMdCss(false);
        if (this._hideBookMdTimeout) clearTimeout(this._hideBookMdTimeout);
        if (this.originalRegisterExtensions) {
            this.app.viewRegistry.registerExtensions = this.originalRegisterExtensions;
        }
        if (this.originalUnregisterExtensions) {
            this.app.viewRegistry.unregisterExtensions = this.originalUnregisterExtensions;
        }
    }

    applyHideCoverCss(forceShow) {
        const STYLE_ID = "bookshelf-hide-covers-css";
        let existing = document.getElementById(STYLE_ID);
        const shouldHide = (forceShow === false) ? false : this.settings.hideCoverFiles;
        if (shouldHide) {
            if (!existing) {
                existing = document.createElement("style");
                existing.id = STYLE_ID;
                document.head.appendChild(existing);
            }
            existing.textContent = [
                `.nav-file-title[data-path$="_cover.jpg" i], .nav-file:has(.nav-file-title[data-path$="_cover.jpg" i]) { display: none !important; }`,
                `.nav-file-title[data-path$="_cover.jpeg" i], .nav-file:has(.nav-file-title[data-path$="_cover.jpeg" i]) { display: none !important; }`,
                `.nav-file-title[data-path$="_cover.png" i], .nav-file:has(.nav-file-title[data-path$="_cover.png" i]) { display: none !important; }`
            ].join("\n");
        } else {
            if (existing) existing.remove();
        }
        
        // Force DOM redraw to fix Chromium :has() bug
        document.body.style.display = 'none';
        document.body.offsetHeight; // Trigger reflow
        document.body.style.display = '';
    }

    triggerUpdateHideBookMdCss() {
        if (!this.settings.hideBookMdFiles) {
            this.applyHideBookMdCss();
            return;
        }
        if (this._hideBookMdTimeout) clearTimeout(this._hideBookMdTimeout);
        this._hideBookMdTimeout = setTimeout(() => {
            this.applyHideBookMdCss();
        }, 1000);
    }

    applyHideBookMdCss(forceShow) {
        const STYLE_ID = "bookshelf-hide-book-md-css";
        let existing = document.getElementById(STYLE_ID);
        const shouldHide = (forceShow === false) ? false : this.settings.hideBookMdFiles;
        
        if (shouldHide) {
            if (!existing) {
                existing = document.createElement("style");
                existing.id = STYLE_ID;
                document.head.appendChild(existing);
            }
            
            const exts = this.settings.extensions.split(",").map(e => e.trim().toLowerCase());
            let libraryPaths = this.settings.libraries.split("\n").map(l => l.trim().replace(/\\/g, "/")).filter(l => l);
            let singleLibraryPaths = (this.settings.singleLibraries || "").split("\n").map(l => l.trim().replace(/\\/g, "/")).filter(l => l);
            let combinedPaths = libraryPaths.concat(singleLibraryPaths);
            if (combinedPaths.length === 0) combinedPaths = ["/"];
            
            const allFiles = this.app.vault.getFiles();
            let selectors = [];
            
            for (let file of allFiles) {
                if (!exts.includes(file.extension.toLowerCase())) continue;
                
                let matchedLibrary = null;
                for (let lib of combinedPaths) {
                    if (lib === "/" || file.path.startsWith(lib + (lib.endsWith("/") ? "" : "/"))) {
                        matchedLibrary = lib;
                        break;
                    }
                }
                
                if (matchedLibrary !== null) {
                    let mdPath = file.path.substring(0, file.path.lastIndexOf(".")) + ".md";
                    let mdPathEscaped = mdPath.replace(/"/g, '\\"');
                    selectors.push(`.nav-file-title[data-path="${mdPathEscaped}" i], .nav-file:has(.nav-file-title[data-path="${mdPathEscaped}" i])`);
                }
            }
            
            if (selectors.length > 0) {
                existing.textContent = selectors.join(",\n") + " { display: none !important; }";
            } else {
                existing.textContent = "";
            }
        } else {
            if (existing) existing.remove();
        }
        
        document.body.style.display = 'none';
        document.body.offsetHeight;
        document.body.style.display = '';
    }

    async loadSettings() {
        const data = await this.loadData();
        if (data && data.libraryFolder && !data.libraries) {
            data.libraries = data.libraryFolder;
        }
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    }

    async saveSettings() {
        await this.saveData(this.settings);
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BOOKSHELF);
        if (leaves.length > 0) {
            leaves[0].view.renderBookshelf();
        }
    }

    getLibraryData() {
        const exts = this.settings.extensions.split(",").map(e => e.trim().toLowerCase());
        let libraryPaths = this.settings.libraries.split("\n").map(l => l.trim().replace(/\\/g, "/")).filter(l => l);
        let singleLibraryPaths = (this.settings.singleLibraries || "").split("\n").map(l => l.trim().replace(/\\/g, "/")).filter(l => l);
        
        let ignoreFolders = (this.settings.ignoreFolders || "_ignore")
            .split(",")
            .map(i => i.trim().toLowerCase())
            .filter(i => i);
        
        if (libraryPaths.length === 0 && singleLibraryPaths.length === 0) {
            libraryPaths = ["/"];
        }

        const allFilesRaw = this.app.vault.getFiles();
        const allFiles = allFilesRaw.filter(file => {
            const pathParts = file.path.toLowerCase().split("/");
            return !pathParts.some(part => ignoreFolders.includes(part));
        });

        const mdFiles = {};

        for (let file of allFiles) {
            if (file.extension === "md") {
                mdFiles[file.path] = file;
            }
        }

        let seriesMap = new Map();
        let allValidBooks = [];

        for (let file of allFiles) {
            if (!exts.includes(file.extension.toLowerCase())) continue;

            let matchedLibrary = null;
            let isSingle = false;
            
            for (let lib of singleLibraryPaths) {
                if (lib === "/" || file.path.startsWith(lib + (lib.endsWith("/") ? "" : "/"))) {
                    matchedLibrary = lib;
                    isSingle = true;
                    break;
                }
            }
            if (!isSingle) {
                for (let lib of libraryPaths) {
                    if (lib === "/" || file.path.startsWith(lib + (lib.endsWith("/") ? "" : "/"))) {
                        matchedLibrary = lib;
                        break;
                    }
                }
            }

            if (matchedLibrary === null) continue;
            
            let relativePath = matchedLibrary === "/" ? file.path : file.path.substring(matchedLibrary.length + 1);
            let pathParts = relativePath.split("/");
            
            let seriesName = "";
            let seriesId = "";
            
            if (isSingle) {
                seriesName = file.basename;
                seriesId = `standalone-${file.path}`;
            } else if (pathParts.length > 1) {
                seriesName = pathParts[0];
                seriesId = matchedLibrary === "/" ? seriesName : `${matchedLibrary}/${seriesName}`;
            } else {
                seriesName = file.basename;
                seriesId = `standalone-${file.path}`;
            }

            let mdPath = file.path.substring(0, file.path.lastIndexOf(".")) + ".md";
            let metadata = {};
            let mdFile = mdFiles[mdPath];
            if (mdFile) {
                const cache = this.app.metadataCache.getFileCache(mdFile);
                if (cache && cache.frontmatter) {
                    metadata = cache.frontmatter;
                }
            }

            let bookObj = {
                file: file,
                basename: file.basename,
                extension: file.extension,
                metadata: metadata,
                ctime: file.stat.ctime 
            };

            allValidBooks.push(bookObj);

            if (!seriesMap.has(seriesId)) {
                seriesMap.set(seriesId, {
                    id: seriesId,
                    name: seriesName,
                    library: matchedLibrary,
                    books: [],
                    lastAdded: bookObj.ctime
                });
            }

            let series = seriesMap.get(seriesId);
            series.books.push(bookObj);
            if (bookObj.ctime > series.lastAdded) {
                series.lastAdded = bookObj.ctime;
            }
        }
        
        let seriesList = Array.from(seriesMap.values());
        
        seriesList.sort((a, b) => a.name.localeCompare(b.name));
        
        for (let series of seriesList) {
            series.books.sort((a, b) => {
                let tA = a.metadata.title || a.basename;
                let tB = b.metadata.title || b.basename;
                return tA.localeCompare(tB);
            });
            if (series.books.length > 0) {
                series.coverImg = series.books[0].metadata.cover || null;
            }
            
            series.metadata = {};
            if (!series.id.startsWith("standalone-")) {
                let seriesMdPath = `${series.id}/${series.name}.md`;
                let seriesMdFile = mdFiles[seriesMdPath];
                if (seriesMdFile) {
                    const cache = this.app.metadataCache.getFileCache(seriesMdFile);
                    if (cache && cache.frontmatter) {
                        series.metadata = cache.frontmatter;
                        if (cache.frontmatter.cover) {
                            series.coverImg = cache.frontmatter.cover;
                        }
                    }
                }
            }
        }

        let recentlyAdded = [...allValidBooks].sort((a, b) => b.ctime - a.ctime).slice(0, 50);

        return {
            series: seriesList,
            recentlyAdded: recentlyAdded
        };
    }

    async activateView() {
        const { workspace } = this.app;
        
        let leaf = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_BOOKSHELF);
        
        if (leaves.length > 0) {
            leaf = leaves[0];
            leaf.view.renderBookshelf();
        } else {
            leaf = workspace.getLeaf(true);
            await leaf.setViewState({ type: VIEW_TYPE_BOOKSHELF, active: true });
        }
        
        workspace.revealLeaf(leaf);
    }

    async extractPdfCover(file) {
        if (!window.pdfjsLib) return null;
        try {
            const data = await this.app.vault.readBinary(file);
            const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
            const page = await pdf.getPage(1);
            
            const viewport = page.getViewport({ scale: 1.0 });
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            await page.render(renderContext).promise;
            
            return new Promise((resolve) => {
                canvas.toBlob(async (blob) => {
                    if (blob) {
                        const buffer = await blob.arrayBuffer();
                        resolve(buffer);
                    } else {
                        resolve(null);
                    }
                }, "image/jpeg", 0.8);
            });
        } catch (e) {
            console.error("Failed to extract PDF cover", e);
            return null;
        }
    }

    async extractEpubCover(file) {
        try {
            let fflate = window.fflate;
            if (!fflate) {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const pluginDir = this.manifest ? this.manifest.dir : this.app.vault.configDir + "/plugins/obsidian-plugins-shiori-bookshelf";
                    const pluginPath = path.join(this.app.vault.adapter.basePath, pluginDir, "fflate.js");
                    
                    if (fs.existsSync(pluginPath)) {
                        const code = fs.readFileSync(pluginPath, "utf-8");
                        const module = { exports: {} };
                        const fn = new Function('module', 'exports', code + '\nreturn module.exports;');
                        fflate = fn(module, module.exports);
                        window.fflate = fflate;
                    } else {
                        console.error("fflate.js not found at " + pluginPath);
                        return null;
                    }
                } catch (e) {
                    console.error("Failed to load fflate.js via fs:", e);
                    return null;
                }
            }

            const data = await this.app.vault.readBinary(file);
            const zip = fflate.unzipSync(new Uint8Array(data));

            const getZipEntry = (path) => {
                if (!path) return null;
                if (zip[path]) return zip[path];
                const lowerPath = path.toLowerCase();
                const key = Object.keys(zip).find(k => k.toLowerCase() === lowerPath);
                return key ? zip[key] : null;
            };
            
            // Helper to safely get exact ArrayBuffer for the zip entry
            const getBuffer = (entry) => {
                if (!entry) return null;
                if (entry.buffer.byteLength === entry.byteLength) return entry.buffer;
                return entry.buffer.slice(entry.byteOffset, entry.byteOffset + entry.byteLength);
            };

            const readText = (entry) => new TextDecoder().decode(entry);
            const parseAttrs = (tagStr) => {
                const attrs = {};
                const re = /([\w:\-]+)\s*=\s*"([^"]*)"/g;
                let m;
                while ((m = re.exec(tagStr)) !== null) {
                    attrs[m[1].toLowerCase()] = m[2];
                }
                return attrs;
            };

            const containerEntry = getZipEntry("META-INF/container.xml");
            if (!containerEntry) { console.error("No container.xml found in", file.name); return null; }
            
            const containerStr = readText(containerEntry);
            const opfMatch = containerStr.match(/full-path="([^"]+)"/i);
            if (!opfMatch) { console.error("No OPF path in container.xml for", file.name); return null; }

            const opfPath = opfMatch[1];
            const opfDir  = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";
            const opfEntry = getZipEntry(opfPath);
            if (!opfEntry) { console.error("OPF entry not found in zip:", opfPath, "for", file.name); return null; }

            const opfStr = readText(opfEntry);
            const itemMap = {};
            const itemRe = /<item([^>]+)\/?\s*>/gi;
            let itemMatch;
            while ((itemMatch = itemRe.exec(opfStr)) !== null) {
                const attrs = parseAttrs(itemMatch[1]);
                if (attrs.id) itemMap[attrs.id] = attrs;
            }

            let coverHref = null;

            const metaRe = /<meta([^>]+)>/gi;
            let metaM;
            while ((metaM = metaRe.exec(opfStr)) !== null) {
                const ma = parseAttrs(metaM[1]);
                if (ma.name && ma.name.toLowerCase() === "cover" && ma.content) {
                    const item = itemMap[ma.content];
                    if (item && item.href) { coverHref = item.href; break; }
                }
            }

            if (!coverHref) {
                for (const id in itemMap) {
                    const a = itemMap[id];
                    if (a.properties && a.properties.toLowerCase().includes("cover-image") && a.href) {
                        coverHref = a.href; break;
                    }
                }
            }

            if (!coverHref) {
                const imgExts = /\.(jpg|jpeg|png|webp|gif)$/i;
                for (const id in itemMap) {
                    const a = itemMap[id];
                    if (!a.href || !imgExts.test(a.href)) continue;
                    if (/cover/i.test(id) || /cover/i.test(a.href)) {
                        coverHref = a.href; break;
                    }
                }
            }

            if (!coverHref) {
                const spineMatch = opfStr.match(/<itemref[^>]+idref="([^"]+)"/i);
                if (spineMatch) {
                    const spineId = spineMatch[1];
                    const spineItem = itemMap[spineId];
                    if (spineItem && spineItem.href) {
                        const spineDocPath = opfDir + decodeURIComponent(spineItem.href);
                        const spineEntry = getZipEntry(spineDocPath);
                        if (spineEntry) {
                            const spineStr = readText(spineEntry);
                            const imgM = spineStr.match(/<img[^>]+src="([^"]+)"/i) || spineStr.match(/image[^>]+xlink:href="([^"]+)"/i);
                            if (imgM) {
                                const spineDir = spineDocPath.includes("/") ? spineDocPath.substring(0, spineDocPath.lastIndexOf("/") + 1) : "";
                                const imgRel = imgM[1];
                                const imgFull = spineDir + decodeURIComponent(imgRel);
                                const imgEntry = getZipEntry(imgFull);
                                if (imgEntry) return getBuffer(imgEntry);
                            }
                        }
                    }
                }
            }

            if (!coverHref) {
                const imgKey = Object.keys(zip).find(k => /\.(jpg|jpeg|png|webp)$/i.test(k));
                if (imgKey) return getBuffer(zip[imgKey]);
            }

            if (!coverHref) {
                console.error("No cover strategy succeeded for", file.name);
                return null;
            }

            const decodedHref = decodeURIComponent(coverHref);
            const candidates = [
                opfDir + decodedHref,
                decodedHref,
                opfDir + coverHref,
                coverHref,
            ];

            for (const candidate of candidates) {
                const entry = getZipEntry(candidate);
                if (entry) return getBuffer(entry);
            }

            const fname = decodedHref.split("/").pop().toLowerCase();
            const fuzzyKey = Object.keys(zip).find(k => k.toLowerCase().endsWith(fname));
            if (fuzzyKey) return getBuffer(zip[fuzzyKey]);

            console.error("Cover file not found in zip:", coverHref, "for", file.name);
            return null;
        } catch (e) {
            console.error("Failed to extract EPUB cover for", file.name, e);
            return null;
        }
    }

    async extractCbzCover(file) {
        try {
            let fflate = window.fflate;
            if (!fflate) {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const pluginDir = this.manifest ? this.manifest.dir : this.app.vault.configDir + "/plugins/obsidian-plugins-shiori-bookshelf";
                    const pluginPath = path.join(this.app.vault.adapter.basePath, pluginDir, "fflate.js");
                    
                    if (fs.existsSync(pluginPath)) {
                        const code = fs.readFileSync(pluginPath, "utf-8");
                        const module = { exports: {} };
                        const fn = new Function('module', 'exports', code + '\nreturn module.exports;');
                        fflate = fn(module, module.exports);
                        window.fflate = fflate;
                    } else {
                        console.error("fflate.js not found at " + pluginPath);
                        return null;
                    }
                } catch (e) {
                    console.error("Failed to load fflate.js via fs:", e);
                    return null;
                }
            }

            const data = await this.app.vault.readBinary(file);
            const uint8Data = new Uint8Array(data);

            const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
            let imageFiles = [];
            
            // Pass 1: Gather file names without extracting them to save memory
            fflate.unzipSync(uint8Data, {
                filter: (f) => {
                    let lower = f.name.toLowerCase();
                    if (!lower.includes('__macosx') && !lower.endsWith('/')) {
                        if (imageExts.some(ext => lower.endsWith(ext))) {
                            imageFiles.push(f.name);
                        }
                    }
                    return false; // Do not allocate memory for extraction yet
                }
            });

            if (imageFiles.length === 0) {
                return null;
            }

            imageFiles.sort((a, b) => a.localeCompare(b));
            let coverPath = imageFiles[0];
            
            // Pass 2: Extract ONLY the cover image
            const zip = fflate.unzipSync(uint8Data, {
                filter: (f) => f.name === coverPath
            });
            
            let entry = zip[coverPath];

            if (!entry) return null;
            
            let buffer;
            if (entry.buffer.byteLength === entry.byteLength) {
                buffer = entry.buffer;
            } else {
                buffer = entry.buffer.slice(entry.byteOffset, entry.byteOffset + entry.byteLength);
            }
            
            let ext = coverPath.split('.').pop().toLowerCase();
            if (ext === 'jpeg') ext = 'jpg';
            
            return { data: buffer, ext: ext };
        } catch (e) {
            console.error("Failed to extract CBZ cover for", file.name, e);
            return null;
        }
    }

    async extractCover(bookFile) {
        let coverData = null;
        let coverExt = "jpg";
        
        if (bookFile.extension === "pdf") {
            coverData = await this.extractPdfCover(bookFile);
            coverExt = "jpg";
        } else if (bookFile.extension === "epub") {
            coverData = await this.extractEpubCover(bookFile);
            coverExt = "jpg"; 
        } else if (bookFile.extension === "cbz" || bookFile.extension === "zip") {
            let res = await this.extractCbzCover(bookFile);
            if (res) {
                coverData = res.data;
                coverExt = res.ext;
            }
        }
        
        if (coverData) {
            let lastSlash = bookFile.path.lastIndexOf("/");
            let folderPath = lastSlash !== -1 ? bookFile.path.substring(0, lastSlash) : "";
            
            let safeName = bookFile.basename.replace(/[/\\?%*:|"<>]/g, '-');
            let coverFileName = folderPath ? `${folderPath}/${safeName}_cover.${coverExt}` : `${safeName}_cover.${coverExt}`;
            
            let coverFile = this.app.vault.getAbstractFileByPath(coverFileName);
            if (!coverFile) {
                coverFile = await this.app.vault.createBinary(coverFileName, coverData);
            } else {
                await this.app.vault.modifyBinary(coverFile, coverData);
            }
            
            let mdPath = bookFile.path.substring(0, bookFile.path.lastIndexOf(".")) + ".md";
            let mdFile = this.app.vault.getAbstractFileByPath(mdPath);
            if (!mdFile) {
                await this.app.vault.create(mdPath, `---\ncover: "${coverFileName}"\n---\n\n[[${bookFile.name}]]\n`);
            } else {
                await this.app.fileManager.processFrontMatter(mdFile, (frontmatter) => {
                    frontmatter.cover = coverFileName;
                });
            }
            return true;
        }
        return false;
    }

    async extractAllMissingCovers() {
        const data = this.getLibraryData();
        const allBooks = data.series.flatMap(s => s.books);
        let extractedCount = 0;
        
        new Notice("Started scanning missing covers...");
        
        for (let book of allBooks) {
            let existingCover = book.metadata.cover;
            if (existingCover) {
                let coverFile = this.app.metadataCache.getFirstLinkpathDest(existingCover, book.file.path);
                if (coverFile) continue; 
            }
            
            let success = await this.extractCover(book.file);
            if (success) extractedCount++;
        }
        
        new Notice(`Finished scanning ${extractedCount} covers!`);
        
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BOOKSHELF);
        if (leaves.length > 0) {
            leaves[0].view.renderBookshelf();
        }
    }

    async extractMissingCoversForSeries(series) {
        let extractedCount = 0;
        new Notice(`Started scanning missing covers for ${series.name}...`);
        
        for (let book of series.books) {
            let existingCover = book.metadata.cover;
            if (existingCover) {
                let coverFile = this.app.metadataCache.getFirstLinkpathDest(existingCover, book.file.path);
                if (coverFile) continue; 
            }
            
            let success = await this.extractCover(book.file);
            if (success) extractedCount++;
        }
        
        new Notice(`Finished scanning ${extractedCount} covers for ${series.name}!`);
        
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BOOKSHELF);
        if (leaves.length > 0) {
            leaves[0].view.renderBookshelf();
        }
        const detailsLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_SERIES_DETAILS);
        detailsLeaves.forEach(leaf => {
            if (leaf.view.seriesId === series.id) {
                leaf.view.renderDetails();
            }
        });
    }

    async extractMissingCoversForFolder(folder) {
        const data = this.getLibraryData();
        const allBooks = data.series.flatMap(s => s.books).filter(b => b.file.path === folder.path || b.file.path.startsWith(folder.path + "/"));
        let extractedCount = 0;
        
        new Notice(`Started scanning missing covers for ${folder.name}...`);
        
        for (let book of allBooks) {
            let existingCover = book.metadata.cover;
            if (existingCover) {
                let coverFile = this.app.metadataCache.getFirstLinkpathDest(existingCover, book.file.path);
                if (coverFile) continue; 
            }
            
            let success = await this.extractCover(book.file);
            if (success) extractedCount++;
        }
        
        new Notice(`Finished scanning ${extractedCount} covers for ${folder.name}!`);
        
        const leaves = this.app.workspace.getLeavesOfType("bookshelf");
        if (leaves.length > 0) {
            leaves[0].view.renderBookshelf();
        }
    }
}

class BookshelfServer {
    constructor(plugin) {
        this.plugin = plugin;
        this.server = null;
    }

    start() {
        if (!this.plugin.settings.enableWebServer) return;
        
        let port = this.plugin.settings.webServerPort || 7070;
        if (typeof port === 'string') port = parseInt(port);

        if (this.server) this.stop();

        try {
            const http = require('http');
            const fs = require('fs');
            const path = require('path');

            this.server = http.createServer(async (req, res) => {
                res.setHeader('Access-Control-Allow-Origin', '*');
                
                try {
                    const url = new URL(req.url, `http://localhost:${port}`);
                    const basePath = this.plugin.app.vault.adapter.getBasePath ? this.plugin.app.vault.adapter.getBasePath() : "";
                    
                    if (url.pathname === '/api/library') {
                        const data = this.plugin.getLibraryData();
                        
                        const resolveCover = (coverName, contextPath) => {
                            if (!coverName) return null;
                            if (coverName.startsWith("http")) return coverName;
                            let f = this.plugin.app.metadataCache.getFirstLinkpathDest(coverName, contextPath);
                            if (f) return f.path;
                            if (coverName.includes("/")) {
                                let fallbackFile = this.plugin.app.metadataCache.getFirstLinkpathDest(coverName.split("/").pop(), contextPath);
                                if (fallbackFile) return fallbackFile.path;
                            }
                            return null;
                        };

                        const cleanData = data.series.map(s => {
                            let sCover = null;
                            if (s.books.length > 0) {
                                sCover = resolveCover(s.coverImg, s.books[0].file.path);
                            }
                            
                            return {
                                id: s.id,
                                name: s.name,
                                library: s.library,
                                metadata: s.metadata,
                                coverImg: sCover,
                                books: s.books.map(b => {
                                    return {
                                        path: b.file.path,
                                        basename: b.basename,
                                        extension: b.extension,
                                        mtime: b.file.stat.mtime,
                                        metadata: b.metadata,
                                        coverImg: resolveCover(b.metadata.cover, b.file.path)
                                    }
                                })
                            };
                        });
                        
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ series: cleanData }));
                    } else if (url.pathname === '/api/cover') {
                        const p = url.searchParams.get('path');
                        if (!p) return res.writeHead(400).end();
                        if (p.startsWith('http')) {
                            res.writeHead(302, { 'Location': p });
                            return res.end();
                        }
                        const absPath = basePath ? path.join(basePath, p) : "";
                        if (absPath && fs.existsSync(absPath)) {
                            const ext = path.extname(absPath).toLowerCase();
                            let ct = 'image/jpeg';
                            if (ext === '.png') ct = 'image/png';
                            if (ext === '.webp') ct = 'image/webp';
                            res.writeHead(200, { 'Content-Type': ct });
                            fs.createReadStream(absPath).pipe(res);
                        } else {
                            res.writeHead(404).end();
                        }
                    } else if (url.pathname === '/api/file') {
                        const p = url.searchParams.get('path');
                        if (!p) return res.writeHead(400).end();
                        const absPath = basePath ? path.join(basePath, p) : "";
                        if (absPath && fs.existsSync(absPath)) {
                            const stat = fs.statSync(absPath);
                            const ext = path.extname(absPath).toLowerCase();
                            let ct = 'application/octet-stream';
                            if (ext === '.pdf') ct = 'application/pdf';
                            if (ext === '.epub') ct = 'application/epub+zip';
                            if (ext === '.cbz') ct = 'application/x-cbz';
                            
                            res.writeHead(200, { 
                                'Content-Type': ct,
                                'Content-Length': stat.size,
                                'Content-Disposition': `inline; filename="${encodeURIComponent(path.basename(absPath))}"`
                            });
                            fs.createReadStream(absPath).pipe(res);
                        } else {
                            res.writeHead(404).end();
                        }
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(this.getIndexHtml());
                    }
                } catch (e) {
                    res.writeHead(500);
                    res.end(e.toString());
                }
            });

            this.server.listen(port, '0.0.0.0', () => {
                console.log(`Shiori Bookshelf server running on port ${port}`);
            });
            this.server.on('error', (e) => {
                console.error("Bookshelf server error:", e);
                new (require('obsidian').Notice)(`Failed to start Web Server on port ${port}. Is it already in use?`);
            });
        } catch (e) {
            console.error("Failed to initialize server. Are you on mobile?", e);
            new (require('obsidian').Notice)("Web Server feature is only available on Desktop.");
        }
    }

    stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
            console.log("Shiori Bookshelf server stopped.");
        }
    }

    getIndexHtml() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Shiori Bookshelf</title>
<style>
    :root {
        --background-primary: #1e1e1e;
        --background-secondary: #242424;
        --background-modifier-border: #3a3a3a;
        --background-modifier-active-hover: #2a2a2a;
        --text-normal: #dcddde;
        --text-muted: #8e9092;
        --interactive-accent: #7f6df2;
        --text-on-accent: #ffffff;
        --interactive-normal: #2a2a2a;
        --interactive-hover: #333333;
        --font-ui: system-ui, -apple-system, sans-serif;
    }
    body { font-family: var(--font-ui); background: var(--background-primary); color: var(--text-normal); margin: 0; padding: 20px; }
    
    /* Header Bar */
    .bookshelf-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; margin-bottom: 20px; gap: 10px; }
    .bookshelf-title { margin: 0; font-size: 1.5em; font-weight: bold; white-space: nowrap; }
    .search-container { display: flex; gap: 10px; flex: 1; min-width: 250px; }
    .bookshelf-search, .bookshelf-select { flex: 1; padding: 8px 12px; border-radius: 5px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); outline: none; }
    .bookshelf-search:focus, .bookshelf-select:focus { border-color: var(--interactive-accent); }
    .btn { padding: 8px 12px; border-radius: 5px; border: 1px solid var(--background-modifier-border); background: var(--interactive-normal); color: var(--text-normal); cursor: pointer; white-space: nowrap; font-size:14px; }
    .btn:hover { background: var(--interactive-hover); }
    .btn-accent { background: var(--interactive-accent); color: var(--text-on-accent); border: none; }
    .btn-accent:hover { opacity: 0.9; }

    /* Layouts */
    .section-title { font-size: 1.2em; font-weight: bold; margin: 20px 0 10px 0; display: flex; justify-content: space-between; align-items: center; }
    .bookshelf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 20px; }
    .new-books-scroll { display: flex; overflow-x: auto; gap: 20px; padding-bottom: 10px; margin-bottom: 20px; }
    .new-books-scroll::-webkit-scrollbar { height: 8px; }
    .new-books-scroll::-webkit-scrollbar-thumb { background: var(--background-modifier-border); border-radius: 4px; }
    .new-books-scroll .bookshelf-card { width: 150px; min-width: 150px; max-width: 150px; flex: 0 0 auto; }
    
    /* Cards */
    .bookshelf-card { min-width: 150px; flex-shrink: 0; border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 10px; cursor: pointer; display: flex; flex-direction: column; background: var(--background-secondary); transition: transform 0.2s, box-shadow 0.2s; height: auto; }
    .bookshelf-card:hover { transform: translateY(-4px); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
    .bookshelf-cover { position: relative; width: 100%; aspect-ratio: 2/3; background: var(--background-modifier-active-hover); border-radius: 4px; margin-bottom: 10px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .bookshelf-cover img { width: 100%; height: 100%; object-fit: cover; }
    .card-info { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .card-title { font-size: 14px; font-weight: bold; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.2; margin-bottom: 2px; word-break: break-word; }
    .card-alias { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 5px; }
    .card-meta { font-size: 12px; color: var(--text-muted); margin-bottom: 5px; }
    .card-badge { display: inline-block; font-size: 10px; padding: 2px 6px; border-radius: 4px; background: var(--background-modifier-border); color: var(--text-muted); align-self: flex-start; margin-top: auto; text-transform: uppercase; }
    hr { border: none; border-top: 1px solid var(--background-modifier-border); margin: 30px 0; }
    
    /* Details View */
    #books-view { display: none; }
    .header-bar { display: flex; align-items: center; gap: 15px; margin-bottom: 20px; }
    .back-btn { background: transparent; color: var(--text-muted); border: none; font-size: 24px; cursor: pointer; padding: 0; }
    .back-btn:hover { color: var(--text-normal); }
    .download-btn { display: inline-block; background: var(--interactive-accent); color: var(--text-on-accent); text-decoration: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; margin-top: 10px; font-weight: bold; text-align: center; }
    .download-btn:hover { opacity: 0.9; }
</style>
</head>
<body>
    <div id="app">
        <!-- Main Series View -->
        <div id="series-view">
            <div class="bookshelf-header">
                <h2 class="bookshelf-title">Shiori <span style="font-size:0.7em">Bookshelf</span></h2>
                <div class="search-container">
                    <input type="text" id="search-series" class="bookshelf-search" placeholder="Filter by series...">
                    <input type="text" id="search-writer" class="bookshelf-search" placeholder="Filter by writer...">
                    <select id="status-filter" class="bookshelf-select">
                        <option value="Any Status">Any Status</option>
                        <option value="Ongoing">Ongoing</option>
                        <option value="Completed">Completed</option>
                        <option value="Hiatus">Hiatus</option>
                        <option value="Cancelled">Cancelled</option>
                    </select>
                </div>
                <button class="btn" id="adv-filter-btn" onclick="toggleAdvFilter()">Advance Filter</button>
            </div>

            <div id="filters-container" style="display:none; position:relative; margin-bottom:15px;">
                <button class="btn" style="position:absolute; right:0; top:0; font-size:12px; padding:4px 10px;" onclick="resetFilters()">Reset Filters</button>
                <div id="filter-sections"></div>
            </div>

            <div id="new-books-container">
                <h3 class="section-title" style="justify-content: flex-start;">New Book Add</h3>
                <div class="new-books-scroll" id="new-books-scroll"></div>
                <hr>
            </div>

            <div class="section-title">
                <span id="series-count">Series (0)</span>
                <select id="sort-select" class="bookshelf-select" style="width:auto; padding:4px 8px; font-size:12px; flex:none;">
                    <option value="Last Update">Sort by Last Update</option>
                    <option value="A-Z">Sort by A-Z</option>
                    <option value="Z-A">Sort by Z-A</option>
                </select>
            </div>
            
            <div class="bookshelf-grid" id="series-grid">Loading...</div>
        </div>

        <!-- Books Detail View -->
        <div id="books-view">
            <div class="header-bar">
                <button class="back-btn" onclick="showSeries(true)">←</button>
                <h2 id="books-title" style="margin:0; display:none;"></h2>
            </div>
            <div id="series-header-info" style="display:flex;gap:20px;margin-bottom:24px;align-items:flex-start;flex-wrap:wrap;"></div>
            <div class="bookshelf-grid" id="books-grid"></div>
        </div>
    </div>

    <script>
        let libraryData = [];
        let filteredSeries = [];
        let allBooks = [];

        let allGenres = new Set();
        let allTags = new Set();
        let allLibraries = new Set();

        let includeGenres = new Set();
        let excludeGenres = new Set();
        let includeTags = new Set();
        let excludeTags = new Set();
        let includeLibraries = new Set();
        let excludeLibraries = new Set();

        let isAdvVisible = false;

        async function loadData() {
            try {
                const res = await fetch('/api/library');
                const data = await res.json();
                libraryData = data.series;
                
                // Populate filter sets
                libraryData.forEach(s => {
                    if (s.library) allLibraries.add(s.library);
                    if (s.metadata) {
                        let g1 = s.metadata.genres;
                        if (Array.isArray(g1)) g1.forEach(x => allGenres.add(String(x).trim()));
                        else if (typeof g1 === "string") g1.split(",").forEach(x => allGenres.add(x.trim()));
                        let g2 = s.metadata.genre;
                        if (Array.isArray(g2)) g2.forEach(x => allGenres.add(String(x).trim()));
                        else if (typeof g2 === "string") g2.split(",").forEach(x => allGenres.add(x.trim()));
                        
                        let t1 = s.metadata.tags;
                        if (Array.isArray(t1)) t1.forEach(x => allTags.add(String(x).trim()));
                        else if (typeof t1 === "string") t1.split(",").forEach(x => allTags.add(x.trim()));
                        let t2 = s.metadata.tag;
                        if (Array.isArray(t2)) t2.forEach(x => allTags.add(String(x).trim()));
                        else if (typeof t2 === "string") t2.split(",").forEach(x => allTags.add(x.trim()));
                    }
                });
                allGenres.delete("");
                allTags.delete("");
                buildFilterSections();

                // Collect all books for New Books section
                allBooks = [];
                libraryData.forEach(s => {
                    s.books.forEach(b => {
                        allBooks.push({ ...b, series: s });
                    });
                });
                
                // Sort by mtime descending
                allBooks.sort((a,b) => (b.mtime || 0) - (a.mtime || 0));

                applyFilters();
                renderNewBooks();

                const params = new URLSearchParams(window.location.search);
                const seriesId = params.get('series');
                if (seriesId) {
                    showBooksBySeriesId(seriesId, false);
                }
            } catch (e) {
                document.getElementById('series-grid').innerText = 'Error loading library. Make sure Obsidian is running.';
            }
        }

        function toggleAdvFilter() {
            isAdvVisible = !isAdvVisible;
            document.getElementById('filters-container').style.display = isAdvVisible ? 'block' : 'none';
        }

        function resetFilters() {
            includeLibraries.clear(); excludeLibraries.clear();
            includeGenres.clear(); excludeGenres.clear();
            includeTags.clear(); excludeTags.clear();
            buildFilterSections();
            applyFilters();
        }

        function createFilterSectionHTML(title, items, incSet, excSet, type) {
            if (items.length === 0) return '';
            let html = \`<div style="margin-bottom: 5px;">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                    <h4 style="margin:0; color:var(--text-muted); font-size:14px; font-weight:bold;">\${title}</h4>
                    <button style="background:transparent; border:none; box-shadow:none; color:var(--text-accent); font-size:12px; cursor:pointer; padding:0;" onclick="toggleFilterList('\${type}')" id="toggle-btn-\${type}">Hide</button>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:8px;" id="list-\${type}">\`;
            items.forEach(item => {
                let color = "var(--text-normal)", border = "1px solid var(--background-modifier-border)";
                if (incSet.has(item)) {
                    color = "var(--text-success, #4CAF50)";
                    border = "1px solid var(--text-success, #4CAF50)";
                } else if (excSet.has(item)) {
                    color = "var(--text-error, #f44336)";
                    border = "1px dashed var(--text-error, #f44336)";
                }
                html += \`<button onclick="toggleFilterItem('\${type}', '\${item.replace(/'/g, "\\\\'")}')" style="padding:4px 10px; border-radius:6px; font-size:12px; cursor:pointer; background:var(--background-secondary); transition:all 0.1s; color:\${color}; border:\${border};">\${item}</button>\`;
            });
            html += \`</div></div>\`;
            if (title === 'Tags') html += \`<hr style="margin: 15px 0 0 0; border: none; border-top: 1px solid var(--background-modifier-border);">\`;
            return html;
        }

        let sectionVisibility = { lib: true, gen: true, tag: true };

        function toggleFilterList(type) {
            sectionVisibility[type] = !sectionVisibility[type];
            document.getElementById('list-' + type).style.display = sectionVisibility[type] ? 'flex' : 'none';
            document.getElementById('toggle-btn-' + type).innerText = sectionVisibility[type] ? 'Hide' : 'Show';
        }

        function toggleFilterItem(type, item) {
            let incSet, excSet;
            if (type === 'lib') { incSet = includeLibraries; excSet = excludeLibraries; }
            else if (type === 'gen') { incSet = includeGenres; excSet = excludeGenres; }
            else if (type === 'tag') { incSet = includeTags; excSet = excludeTags; }

            if (!incSet.has(item) && !excSet.has(item)) {
                incSet.add(item);
            } else if (incSet.has(item)) {
                incSet.delete(item);
                excSet.add(item);
            } else {
                excSet.delete(item);
            }
            buildFilterSections();
            applyFilters();
        }

        function buildFilterSections() {
            let sortedLibraries = Array.from(allLibraries).sort((a,b) => a.localeCompare(b));
            let sortedGenres = Array.from(allGenres).sort((a,b) => a.localeCompare(b));
            let sortedTags = Array.from(allTags).sort((a,b) => a.localeCompare(b));
            
            let html = '';
            html += createFilterSectionHTML("Libraries", sortedLibraries, includeLibraries, excludeLibraries, 'lib');
            html += createFilterSectionHTML("Genres", sortedGenres, includeGenres, excludeGenres, 'gen');
            html += createFilterSectionHTML("Tags", sortedTags, includeTags, excludeTags, 'tag');
            
            document.getElementById('filter-sections').innerHTML = html;
            
            // Restore visibility state
            ['lib', 'gen', 'tag'].forEach(type => {
                let list = document.getElementById('list-' + type);
                let btn = document.getElementById('toggle-btn-' + type);
                if (list && btn) {
                    list.style.display = sectionVisibility[type] ? 'flex' : 'none';
                    btn.innerText = sectionVisibility[type] ? 'Hide' : 'Show';
                }
            });
        }

        function getCoverUrl(coverImg) {
            if (coverImg) {
                if (coverImg.startsWith('http')) return coverImg;
                return '/api/cover?path=' + encodeURIComponent(coverImg);
            }
            return null;
        }

        function renderNewBooks() {
            const scroll = document.getElementById('new-books-scroll');
            scroll.innerHTML = '';
            const recentBooks = allBooks.slice(0, 10);
            
            if (recentBooks.length === 0) {
                document.getElementById('new-books-container').style.display = 'none';
                return;
            }
            document.getElementById('new-books-container').style.display = 'block';

            recentBooks.forEach(b => {
                const card = document.createElement('div');
                card.className = 'bookshelf-card';
                card.onclick = () => showBooksBySeriesId(b.series.id);
                
                const title = (b.metadata && b.metadata.title) ? b.metadata.title : b.basename;
                const cUrl = getCoverUrl(b.coverImg) || getCoverUrl(b.series.coverImg);
                let coverHtml = cUrl ? \`<img src="\${cUrl}" loading="lazy">\` : '<span style="color:#888;font-size:10px;">NO COVER</span>';
                
                card.innerHTML = \`
                    <div class="bookshelf-cover">\${coverHtml}</div>
                    <div class="card-info">
                        <div class="card-title" title="\${title}">\${title}</div>
                        <div class="card-badge">\${b.extension}</div>
                    </div>
                \`;
                scroll.appendChild(card);
            });
        }

        function applyFilters() {
            const qSeries = document.getElementById('search-series').value.toLowerCase();
            const qWriter = document.getElementById('search-writer').value.toLowerCase();
            const qStatus = document.getElementById('status-filter').value;
            const sortMode = document.getElementById('sort-select').value;

            filteredSeries = libraryData.filter(s => {
                const title = ((s.metadata && s.metadata.title) ? s.metadata.title : s.name).toLowerCase();
                const alias = (s.metadata && s.metadata.aliases && Array.isArray(s.metadata.aliases)) ? s.metadata.aliases.join(" ").toLowerCase() : "";
                
                if (qSeries && !title.includes(qSeries) && !alias.includes(qSeries)) return false;
                
                if (qWriter) {
                    let wMatch = false;
                    if (s.metadata && s.metadata.writers) {
                        let w = s.metadata.writers;
                        let arr = Array.isArray(w) ? w : (typeof w === "string" ? w.split(",") : []);
                        if (arr.some(writer => String(writer).toLowerCase().includes(qWriter))) wMatch = true;
                    }
                    if (!wMatch && !s.metadata) {
                        for (let b of s.books) {
                            if (b.metadata && b.metadata.author && String(b.metadata.author).toLowerCase().includes(qWriter)) {
                                wMatch = true; break;
                            }
                        }
                    }
                    if (!wMatch) return false;
                }
                
                if (qStatus !== "Any Status") {
                    const status = (s.metadata && s.metadata.status) ? s.metadata.status : "Ongoing";
                    if (status !== qStatus) return false;
                }

                if (includeLibraries.size > 0 || excludeLibraries.size > 0) {
                    if (excludeLibraries.has(s.library)) return false;
                    if (includeLibraries.size > 0 && !includeLibraries.has(s.library)) return false;
                }

                if (includeGenres.size > 0 || excludeGenres.size > 0) {
                    let sGenres = [];
                    if (s.metadata) {
                        let g1 = s.metadata.genres;
                        if (Array.isArray(g1)) sGenres.push(...g1.map(x => String(x).trim().toLowerCase()));
                        else if (typeof g1 === "string") sGenres.push(...g1.split(",").map(x => x.trim().toLowerCase()));
                        let g2 = s.metadata.genre;
                        if (Array.isArray(g2)) sGenres.push(...g2.map(x => String(x).trim().toLowerCase()));
                        else if (typeof g2 === "string") sGenres.push(...g2.split(",").map(x => x.trim().toLowerCase()));
                    }
                    for (let g of excludeGenres) {
                        if (sGenres.includes(g.toLowerCase())) return false;
                    }
                    if (includeGenres.size > 0) {
                        let match = true;
                        for (let g of includeGenres) {
                            if (!sGenres.includes(g.toLowerCase())) { match = false; break; }
                        }
                        if (!match) return false;
                    }
                }

                if (includeTags.size > 0 || excludeTags.size > 0) {
                    let sTags = [];
                    if (s.metadata) {
                        let t1 = s.metadata.tags;
                        if (Array.isArray(t1)) sTags.push(...t1.map(x => String(x).trim().toLowerCase()));
                        else if (typeof t1 === "string") sTags.push(...t1.split(",").map(x => x.trim().toLowerCase()));
                        let t2 = s.metadata.tag;
                        if (Array.isArray(t2)) sTags.push(...t2.map(x => String(x).trim().toLowerCase()));
                        else if (typeof t2 === "string") sTags.push(...t2.split(",").map(x => x.trim().toLowerCase()));
                    }
                    for (let t of excludeTags) {
                        if (sTags.includes(t.toLowerCase())) return false;
                    }
                    if (includeTags.size > 0) {
                        let match = true;
                        for (let t of includeTags) {
                            if (!sTags.includes(t.toLowerCase())) { match = false; break; }
                        }
                        if (!match) return false;
                    }
                }

                return true;
            });

            // Sorting
            filteredSeries.sort((a, b) => {
                if (sortMode === "A-Z") {
                    const ta = (a.metadata && a.metadata.title) ? a.metadata.title : a.name;
                    const tb = (b.metadata && b.metadata.title) ? b.metadata.title : b.name;
                    return ta.localeCompare(tb);
                } else if (sortMode === "Z-A") {
                    const ta = (a.metadata && a.metadata.title) ? a.metadata.title : a.name;
                    const tb = (b.metadata && b.metadata.title) ? b.metadata.title : b.name;
                    return tb.localeCompare(ta);
                } else { // Last Update
                    const aMax = Math.max(0, ...a.books.map(bk => bk.mtime || 0));
                    const bMax = Math.max(0, ...b.books.map(bk => bk.mtime || 0));
                    return bMax - aMax;
                }
            });

            document.getElementById('series-count').innerText = \`Series (\${filteredSeries.length})\`;
            renderSeriesGrid();
        }

        function renderSeriesGrid() {
            const grid = document.getElementById('series-grid');
            grid.innerHTML = '';
            
            if (filteredSeries.length === 0) {
                grid.innerHTML = '<div style="color:var(--text-muted);">No series found matching the criteria.</div>';
                return;
            }

            filteredSeries.forEach(s => {
                const card = document.createElement('div');
                card.className = 'bookshelf-card';
                card.onclick = () => showBooksBySeriesId(s.id);
                
                const title = (s.metadata && s.metadata.title) ? s.metadata.title : s.name;
                const alias = (s.metadata && s.metadata.aliases && Array.isArray(s.metadata.aliases)) ? s.metadata.aliases[0] : "";
                
                const cUrl = getCoverUrl(s.coverImg);
                let coverHtml = cUrl ? \`<img src="\${cUrl}" loading="lazy">\` : '<span style="color:#888;font-size:10px;">NO COVER</span>';
                
                let tagsStr = s.library || "";
                if (s.metadata && s.metadata.tags && s.metadata.tags.length > 0) {
                    tagsStr += " • " + s.metadata.tags[0];
                }

                card.innerHTML = \`
                    <div class="bookshelf-cover">\${coverHtml}</div>
                    <div class="card-info">
                        <div class="card-title" title="\${title}">\${title}</div>
                        \${alias ? \`<div class="card-alias" title="\${alias}">\${alias}</div>\` : ''}
                        <div class="card-meta">\${s.books.length} book(s)</div>
                        <div class="card-badge" title="\${tagsStr}">\${tagsStr || 'Uncategorized'}</div>
                    </div>
                \`;
                grid.appendChild(card);
            });
        }

        function showBooksBySeriesId(id, pushState = true) {
            const s = libraryData.find(x => x.id === id);
            if (!s) return;
            
            if (pushState) {
                history.pushState({view: 'series', id: id}, '', '?series=' + encodeURIComponent(id));
            }
            
            document.getElementById('series-view').style.display = 'none';
            document.getElementById('books-view').style.display = 'block';
            
            const getFirstStr = (keys) => {
                if (s.metadata) {
                    for (let k of keys) {
                        if (s.metadata[k]) return String(s.metadata[k]);
                    }
                }
                for (let b of s.books) {
                    if (b.metadata) {
                        for (let k of keys) {
                            if (b.metadata[k]) return String(b.metadata[k]);
                        }
                    }
                }
                return "";
            };
            const getMergedArr = (keys) => {
                let set = new Set();
                if (s.metadata) {
                    for (let k of keys) {
                        let v = s.metadata[k];
                        if (v) {
                            if (Array.isArray(v)) v.forEach(x => set.add(String(x).trim()));
                            else if (typeof v === "string") v.split(",").map(x => x.trim()).forEach(x => set.add(x));
                        }
                    }
                }
                for (let b of s.books) {
                    if (b.metadata) {
                        for (let k of keys) {
                            let v = b.metadata[k];
                            if (v) {
                                if (Array.isArray(v)) v.forEach(x => set.add(String(x).trim()));
                                else if (typeof v === "string") v.split(",").map(x => x.trim()).forEach(x => set.add(x));
                            }
                        }
                    }
                }
                return Array.from(set).filter(x => x);
            };

            let summary = getFirstStr(["summary", "description"]);
            let publisher = getFirstStr(["publisher", "publishers"]);
            let ageRating = getFirstStr(["age rating", "agerating"]);
            let status = getFirstStr(["status", "publication status"]);
            let rd = getFirstStr(["release date", "publication date", "year", "date"]);
            let releaseDate = rd;
            if (rd) {
                let ym = rd.match(/\b(19|20)\d{2}\b/);
                releaseDate = ym ? ym[0] : rd;
            }
            let writers = getMergedArr(["writers", "writer", "creators", "creator", "author", "authors"]);
            let genres = getMergedArr(["genres", "genre", "subjects", "subject"]);
            let tags = getMergedArr(["tags", "tag"]);
            let aliases = [];
            if (s.metadata && s.metadata.aliases) {
                let a = s.metadata.aliases;
                if (Array.isArray(a)) aliases = a.map(x => String(x).trim()).filter(x => x);
                else if (typeof a === "string") aliases = a.split(",").map(x => x.trim()).filter(x => x);
            }

            let displayTitle = s.metadata && s.metadata.title ? String(s.metadata.title) : s.name;
            document.getElementById('books-title').innerText = displayTitle;

            const headerInfo = document.getElementById('series-header-info');
            headerInfo.innerHTML = '';

            const coverBox = document.createElement('div');
            coverBox.style.cssText = "width:160px;flex-shrink:0;border-radius:8px;overflow:hidden;background:var(--background-modifier-active-hover);aspect-ratio:2/3;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.1);";
            let coverUrl = getCoverUrl(s.coverImg) || (s.books.length > 0 ? getCoverUrl(s.books[0].coverImg) : null);
            if (coverUrl) {
                coverBox.innerHTML = \`<img src="\${coverUrl}" style="width:100%;height:100%;object-fit:cover;">\`;
            } else {
                coverBox.innerHTML = \`<span style="font-weight:bold;color:var(--text-muted);">SERIES</span>\`;
            }
            headerInfo.appendChild(coverBox);

            const infoBox = document.createElement('div');
            infoBox.style.cssText = "flex:1;min-width:250px;display:flex;flex-direction:column;gap:12px;";

            infoBox.innerHTML += \`<h1 style="margin:0;font-size:28px;font-weight:800;line-height:1.2;color:var(--text-normal);">\${displayTitle}</h1>\`;

            if (aliases.length > 0) {
                infoBox.innerHTML += \`<div style="font-size:14px;color:var(--text-muted);font-weight:600;margin-top:-8px;">\${aliases.join(" • ")}</div>\`;
            }

            let metaHtml = \`<div style="display:flex;flex-wrap:wrap;gap:16px;font-size:13px;color:var(--text-muted);">\`;
            const addMeta = (label, value) => {
                if (!value || (Array.isArray(value) && value.length === 0)) return;
                const text = Array.isArray(value) ? value.join(", ") : value;
                metaHtml += \`<div><strong style="color:var(--text-normal);">\${label}:</strong> \${text}</div>\`;
            };
            addMeta("Writers", writers);
            addMeta("Publisher", publisher);
            addMeta("Release Year", releaseDate);
            addMeta("Status", status);
            addMeta("Age Rating", ageRating);
            addMeta("Genres", genres);
            addMeta("Tags", tags);
            metaHtml += \`</div>\`;
            infoBox.innerHTML += metaHtml;

            if (summary) {
                infoBox.innerHTML += \`<div style="margin-top:4px;font-size:14px;line-height:1.6;color:var(--text-normal);max-height:140px;overflow-y:auto;padding-right:8px;border-left:3px solid var(--interactive-accent);padding-left:12px;background:var(--background-secondary);padding-top:8px;padding-bottom:8px;border-radius:0 8px 8px 0;">\${summary}</div>\`;
            }

            let pathHtml = \`<div style="display: flex; align-items: center; gap: 8px; margin-top: 10px;">
                <div style="flex: 1; padding: 4px 8px; background: var(--background-secondary); border-radius: 4px; font-family: monospace; font-size: 11px; color: var(--text-muted); word-break: break-all; border: 1px solid var(--background-modifier-border); user-select: all;">\${s.id}</div>
            </div>\`;
            infoBox.innerHTML += pathHtml;

            headerInfo.appendChild(infoBox);

            const countRow = document.createElement('div');
            countRow.style.cssText = "width: 100%; border-top: 1px solid var(--background-modifier-border); border-bottom: 1px solid var(--background-modifier-border); padding: 12px 0; margin-bottom: 16px; font-weight: 600; font-size: 14px; color: var(--text-normal);";
            countRow.innerText = \`\${s.books.length} book(s)\`;
            headerInfo.appendChild(countRow);
            
            const grid = document.getElementById('books-grid');
            grid.innerHTML = '';
            
            s.books.forEach(b => {
                const card = document.createElement('div');
                card.className = 'bookshelf-card';
                card.style.cursor = 'default';
                
                const title = (b.metadata && b.metadata.title) ? b.metadata.title : b.basename;
                const cUrl = getCoverUrl(b.coverImg) || getCoverUrl(s.coverImg);
                let coverHtml = cUrl ? \`<img src="\${cUrl}" loading="lazy">\` : \`<span style="color:#888;font-size:10px;">\${b.extension.toUpperCase()}</span>\`;

                card.innerHTML = \`
                    <div class="bookshelf-cover">\${coverHtml}</div>
                    <div class="card-info">
                        <div class="card-title" title="\${title}">\${title}</div>
                        <div class="card-badge" style="margin-top:5px; margin-bottom:10px;">\${b.extension}</div>
                        <div style="margin-top: auto;">
                            <a class="download-btn" href="/api/file?path=\${encodeURIComponent(b.path)}" target="_blank" style="display:block;width:calc(100% - 24px);">Download / Open</a>
                        </div>
                    </div>
                \`;
                grid.appendChild(card);
            });
            window.scrollTo(0,0);
        }

        function showSeries(pushState = true) {
            document.getElementById('series-view').style.display = 'block';
            document.getElementById('books-view').style.display = 'none';
            if (pushState) {
                history.pushState({view: 'home'}, '', '/');
            }
        }

        // Bind events
        document.getElementById('search-series').addEventListener('input', applyFilters);
        document.getElementById('search-writer').addEventListener('input', applyFilters);
        document.getElementById('status-filter').addEventListener('change', applyFilters);
        document.getElementById('sort-select').addEventListener('change', applyFilters);

        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.view === 'series') {
                showBooksBySeriesId(e.state.id, false);
            } else {
                showSeries(false);
            }
        });
        
        const initialParams = new URLSearchParams(window.location.search);
        const initialSeries = initialParams.get('series');
        if (initialSeries) {
            history.replaceState({view: 'series', id: initialSeries}, '', '?series=' + encodeURIComponent(initialSeries));
        } else {
            history.replaceState({view: 'home'}, '', '/');
        }

        loadData();
    </script>
</body>
</html>`;
    }
}

module.exports = BookshelfPlugin;
