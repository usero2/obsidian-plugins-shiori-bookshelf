const { Plugin, PluginSettingTab, Setting, ItemView, Notice, Modal, requestUrl } = require('obsidian');

const VIEW_TYPE_BOOKSHELF = "bookshelf-view";
const VIEW_TYPE_SERIES_DETAILS = "series-details-view";

const DEFAULT_SETTINGS = {
    libraries: "Lite Novel\nManga",
    singleLibraries: "",
    extensions: "pdf,epub,cbz,cbr,mobi",
    hideCoverFiles: true,
    setAsHomepage: false,
    hideBookMdFiles: false,
    ignoreFolders: "_ignore",
    enableForceRename: false
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
            plugin.app.workspace.getLeaf(false).openFile(book.file);
        };
    }
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
        contentEl.createEl("h2", { text: `Edit Metadata: ${this.series.name}` });

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

        const btnRow = form.createDiv();
        btnRow.style.cssText = "display:flex; justify-content:flex-end; gap:10px; margin-top:10px;";
        
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
        let currentViewMode = "card";
        let currentSort     = "volume";
        let currentFilter   = "";

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
            filterSel.onchange = () => { currentFilter = filterSel.value; renderContent(); };
        }

        const sortSel = controls.createEl("select");
        sortSel.style.cssText = selectCss;
        [["volume","Sort: Volume"],["name","Sort: Name"],["added","Sort: Date Added"]].forEach(([v,t]) => {
            sortSel.createEl("option", { text: t, value: v });
        });
        sortSel.onchange = () => { currentSort = sortSel.value; renderContent(); };

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
            btn.onclick = () => {
                currentViewMode = m.id;
                Object.values(btnMap).forEach(b => b.style.background = "var(--background-secondary)");
                btn.style.background = "var(--interactive-accent)";
                renderContent();
            };
            btnMap[m.id] = btn;
        });
        btnMap[currentViewMode].style.background = "var(--interactive-accent)";

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
            grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:10px;";
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
                card.onclick = () => plugin.app.workspace.getLeaf(false).openFile(book.file);
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

                row.createEl("span", { text: book.extension.toUpperCase() }).style.cssText = "font-size:10px;padding:2px 6px;border-radius:4px;background:var(--background-modifier-border);color:var(--text-faint);flex-shrink:0;";
                row.onclick = () => plugin.app.workspace.getLeaf(false).openFile(book.file);
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
                card.onclick = () => plugin.app.workspace.getLeaf(false).openFile(book.file);
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
        
        let includeGenres = new Set();
        let excludeGenres = new Set();
        let includeTags = new Set();
        let excludeTags = new Set();
        
        let applyFilters = null; // Will be defined below
        
        const createFilterSection = (title, items, includeSet, excludeSet, addHr = true) => {
            if (items.length === 0) return;
            const section = container.createDiv();
            if (addHr) {
                section.style.cssText = "margin-bottom: 20px; padding-bottom: 15px;";
            } else {
                section.style.cssText = "margin-bottom: 5px;";
            }
            
            const headerRow = section.createDiv();
            headerRow.style.cssText = "display:flex; align-items:center; gap:10px; margin-bottom:10px;";
            headerRow.createEl("h4", { text: title }).style.cssText = "margin:0; color:var(--text-muted); font-size:14px; font-weight:bold;";
            
            const toggleBtn = headerRow.createEl("button", { text: "Show" });
            toggleBtn.style.cssText = "background:transparent; border:none; box-shadow:none; color:var(--text-accent); font-size:12px; cursor:pointer; padding:0;";
            
            const list = section.createDiv();
            list.style.cssText = "display:none; flex-wrap:wrap; gap:8px;";
            
            let isVisible = false;
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
        
        createFilterSection("Genre", sortedGenres, includeGenres, excludeGenres, false);
        createFilterSection("Tags", sortedTags, includeTags, excludeTags, true);

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
            
            let isFiltering = query || writerQuery || statusQuery || includeGenres.size > 0 || excludeGenres.size > 0 || includeTags.size > 0 || excludeTags.size > 0;
            
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

    display() {
        const {containerEl} = this;
        containerEl.empty();
        
        containerEl.createEl("h2").innerHTML = "Shiori <span style='font-size:0.7em'>Bookshelf</span> Settings";
        
        let desc = containerEl.createEl("p", { text: "This plugin supports reading PDF, EPUB, and CBZ files." });
        desc.style.color = "var(--text-muted)";
        desc.style.fontSize = "14px";
        desc.style.marginBottom = "20px";

        new Setting(containerEl)
            .setName("Set Shiori Bookshelf as Homepage")
            .setDesc("Automatically open and pin the Shiori Bookshelf view when Obsidian starts.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.setAsHomepage)
                .onChange(async (value) => {
                    this.plugin.settings.setAsHomepage = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
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

        new Setting(containerEl)
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

        new Setting(containerEl)
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



        new Setting(containerEl)
            .setName("Hide cover images in file explorer")
            .setDesc("When enabled, automatically extracted cover images (files ending with _cover.jpg) will be hidden from the navigation pane.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.hideCoverFiles)
                .onChange(async (value) => {
                    this.plugin.settings.hideCoverFiles = value;
                    await this.plugin.saveSettings();
                    this.plugin.applyHideCoverCss();
                }));


        new Setting(containerEl)
            .setName("Hide book metadata files")
            .setDesc("When enabled, metadata .md files that share the exact same name as supported book files will be hidden from the file explorer.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.hideBookMdFiles)
                .onChange(async (value) => {
                    this.plugin.settings.hideBookMdFiles = value;
                    await this.plugin.saveSettings();
                    this.plugin.triggerUpdateHideBookMdCss();
                }));

        new Setting(containerEl)
            .setName("Ignore Folders")
            .setDesc("Comma-separated list of folder names to ignore during scan. Books in these folders will not be shown.")
            .addText(text => text
                .setPlaceholder("_ignore")
                .setValue(this.plugin.settings.ignoreFolders)
                .onChange(async (value) => {
                    this.plugin.settings.ignoreFolders = value;
                    await this.plugin.saveSettings();
                }));
    }
}

class BookshelfPlugin extends Plugin {
    async onload() {
        await this.loadSettings();

        this.registerView(VIEW_TYPE_BOOKSHELF, (leaf) => new BookshelfView(leaf, this));
        this.registerView(VIEW_TYPE_SERIES_DETAILS, (leaf) => new SeriesDetailsView(leaf, this));

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
        this.applyHideCoverCss(false);
        this.applyHideBookMdCss(false);
        if (this._hideBookMdTimeout) clearTimeout(this._hideBookMdTimeout);
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

module.exports = BookshelfPlugin;
