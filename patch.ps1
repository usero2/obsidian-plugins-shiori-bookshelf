$ErrorActionPreference = "Stop"

$content = [IO.File]::ReadAllText("main.js", [Text.Encoding]::UTF8)
$content = $content -replace "`r`n", "`n"

# 1. Add context menu to Book (line 166)
$oldBookMenu = @"
        menu.addSeparator();
        
        menu.addItem((item) => {
            item.setTitle("Regenerate Cover")
"@ -replace "`r`n", "`n"
$newBookMenu = @"
        menu.addSeparator();
        
        menu.addItem((item) => {
            item.setTitle("Force Regenerate Cover")
                .setIcon("image-file")
                .onClick(async () => {
                    new Notice("Force regenerating cover for " + book.file.name + "...");
                    try {
                        await plugin.extractCover(book.file, true);
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
            item.setTitle("Regenerate Cover")
"@ -replace "`r`n", "`n"
$content = $content.Replace($oldBookMenu, $newBookMenu)

# 2. Add context menu to Series (line 341)
$oldSeriesMenu = @"
        menu.addSeparator();
        
        menu.addItem((item) => {
            item.setTitle("Regenerate Cover")
"@ -replace "`r`n", "`n"
$newSeriesMenu = @"
        menu.addSeparator();
        
        menu.addItem((item) => {
            item.setTitle("Force Regenerate Cover")
                .setIcon("image-file")
                .onClick(async () => {
                    if (targetFolder) {
                        await plugin.extractMissingCoversForFolder(targetFolder, true);
                    }
                });
        });
        
        menu.addItem((item) => {
            item.setTitle("Regenerate Cover")
"@ -replace "`r`n", "`n"
$content = $content.Replace($oldSeriesMenu, $newSeriesMenu)

# 3. Update extractCover definition
$oldExtractCover = @"
    async extractCover(bookFile) {
        let coverData = null;
        let coverExt = "jpg";
"@ -replace "`r`n", "`n"
$newExtractCover = @"
    async extractCover(bookFile, force = false) {
        let safeName = bookFile.basename.replace(/[/\\?%*:|"<>]/g, '-');
        let lastSlash = bookFile.path.lastIndexOf("/");
        let folderPath = lastSlash !== -1 ? bookFile.path.substring(0, lastSlash) : "";
        if (!force) {
            for (let ext of ["jpg", "jpeg", "png", "webp", "gif"]) {
                let existingFileName = folderPath ? `${folderPath}/${safeName}_cover.${ext}` : `${safeName}_cover.${ext}`;
                let existingFile = this.app.vault.getAbstractFileByPath(existingFileName);
                if (existingFile) {
                    let mdPath = bookFile.path.substring(0, bookFile.path.lastIndexOf(".")) + ".md";
                    let mdFile = this.app.vault.getAbstractFileByPath(mdPath);
                    if (!mdFile) {
                        await this.app.vault.create(mdPath, `---\ncover: "`+`$existingFileName`+`"\n---\n\n[[`+`$bookFileName`+`]]\n`);
                    } else {
                        await this.app.fileManager.processFrontMatter(mdFile, (frontmatter) => {
                            if (!frontmatter.cover) frontmatter.cover = existingFileName;
                        });
                    }
                    return false;
                }
            }
        }

        let coverData = null;
        let coverExt = "jpg";
"@ -replace "`r`n", "`n"
# fixing the interpolation
$newExtractCover = $newExtractCover -replace '\[\[\$bookFileName\]\]', '[[${bookFile.name}]]'
$content = $content.Replace($oldExtractCover, $newExtractCover)

# 4. Remove the old existingFile block at the end of extractCover
$oldExtractCoverEnd = @"
        if (coverData) {
            let lastSlash = bookFile.path.lastIndexOf("/");
            let folderPath = lastSlash !== -1 ? bookFile.path.substring(0, lastSlash) : "";
            
            let safeName = bookFile.basename.replace(/[/\\?%*:|"<>]/g, '-');
            let coverFileName = folderPath ? `${folderPath}/${safeName}_cover.${coverExt}` : `${safeName}_cover.${coverExt}`;
            
            let coverFile = this.app.vault.getAbstractFileByPath(coverFileName);
"@ -replace "`r`n", "`n"
$newExtractCoverEnd = @"
        if (coverData) {
            let coverFileName = folderPath ? `${folderPath}/${safeName}_cover.${coverExt}` : `${safeName}_cover.${coverExt}`;
            
            let coverFile = this.app.vault.getAbstractFileByPath(coverFileName);
"@ -replace "`r`n", "`n"
$content = $content.Replace($oldExtractCoverEnd, $newExtractCoverEnd)


# 5. Update extractAllMissingCovers
$oldExtractAll = @"
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
"@ -replace "`r`n", "`n"
# using generic string replacement for template literals
$newExtractAll = @"
    async extractAllMissingCovers() {
        const data = this.getLibraryData();
        const allBooks = data.series.flatMap(s => s.books);
        let extractedCount = 0;
        let total = allBooks.length;
        
        let progressNotice = new Notice(`Scanning 0/`+`$total`+` books...`, 0);
        
        for (let i = 0; i < total; i++) {
            let book = allBooks[i];
            
            if (i % 20 === 0) {
                progressNotice.setMessage(`Scanning `+`$i`+`/`+`$total`+` books...\nExtracted: `+`$extractedCount`+`);
                await new Promise(r => setTimeout(r, 1));
            }
            
            let existingCover = book.metadata.cover;
            if (existingCover) {
                let coverFile = this.app.metadataCache.getFirstLinkpathDest(existingCover, book.file.path);
                if (coverFile) continue; 
            }
            
            let success = await this.extractCover(book.file);
            if (success) {
                extractedCount++;
                progressNotice.setMessage(`Scanning `+`$i1`+`/`+`$total`+` books...\nExtracted: `+`$extractedCount`+`);
            }
        }
        
        progressNotice.hide();
        new Notice(`Finished scanning. Extracted `+`$extractedCount`+` covers out of `+`$total`+` books!`);
        
        const leaves = this.app.workspace.getLeavesOfType("bookshelf-view");
        if (leaves.length > 0) {
            leaves[0].view.renderBookshelf();
        }
    }
"@ -replace "`r`n", "`n"
$newExtractAll = $newExtractAll -replace '\$total', '${total}'
$newExtractAll = $newExtractAll -replace '\$i1', '${i + 1}'
$newExtractAll = $newExtractAll -replace '\$i', '${i}'
$newExtractAll = $newExtractAll -replace '\$extractedCount', '${extractedCount}'
$content = $content.Replace($oldExtractAll, $newExtractAll)

# 6. Update extractMissingCoversForSeries
$oldExtractSeries = @"
    async extractMissingCoversForSeries(series) {
        let extractedCount = 0;
        new Notice(`Started scanning missing covers for `+`$seriesName`+`...`);
        
        for (let book of series.books) {
            let existingCover = book.metadata.cover;
            if (existingCover) {
                let coverFile = this.app.metadataCache.getFirstLinkpathDest(existingCover, book.file.path);
                if (coverFile) continue; 
            }
            
            let success = await this.extractCover(book.file);
            if (success) extractedCount++;
        }
        
        new Notice(`Finished scanning `+`$extractedCount`+` covers for `+`$seriesName`+`!`);
        
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
"@ -replace "`r`n", "`n"
$oldExtractSeries = $oldExtractSeries -replace '\$seriesName', '${series.name}'
$oldExtractSeries = $oldExtractSeries -replace '\$extractedCount', '${extractedCount}'

$newExtractSeries = @"
    async extractMissingCoversForSeries(series) {
        let extractedCount = 0;
        let total = series.books.length;
        let progressNotice = new Notice(`Scanning 0/`+`$total`+` books in `+`$seriesName`+`...`, 0);
        
        for (let i = 0; i < total; i++) {
            let book = series.books[i];
            
            if (i % 20 === 0) {
                progressNotice.setMessage(`Scanning `+`$i`+`/`+`$total`+` books in `+`$seriesName`+`...\nExtracted: `+`$extractedCount`+`);
                await new Promise(r => setTimeout(r, 1));
            }
            
            let existingCover = book.metadata.cover;
            if (existingCover) {
                let coverFile = this.app.metadataCache.getFirstLinkpathDest(existingCover, book.file.path);
                if (coverFile) continue; 
            }
            
            let success = await this.extractCover(book.file);
            if (success) {
                extractedCount++;
                progressNotice.setMessage(`Scanning `+`$i1`+`/`+`$total`+` books in `+`$seriesName`+`...\nExtracted: `+`$extractedCount`+`);
            }
        }
        
        progressNotice.hide();
        new Notice(`Finished scanning. Extracted `+`$extractedCount`+` covers for `+`$seriesName`+`!`);
        
        const leaves = this.app.workspace.getLeavesOfType("bookshelf-view");
        if (leaves.length > 0) {
            leaves[0].view.renderBookshelf();
        }
        const detailsLeaves = this.app.workspace.getLeavesOfType("series-details-view");
        detailsLeaves.forEach(leaf => {
            if (leaf.view.seriesId === series.id) {
                leaf.view.renderDetails();
            }
        });
    }
"@ -replace "`r`n", "`n"
$newExtractSeries = $newExtractSeries -replace '\$total', '${total}'
$newExtractSeries = $newExtractSeries -replace '\$i1', '${i + 1}'
$newExtractSeries = $newExtractSeries -replace '\$i', '${i}'
$newExtractSeries = $newExtractSeries -replace '\$seriesName', '${series.name}'
$newExtractSeries = $newExtractSeries -replace '\$extractedCount', '${extractedCount}'
$content = $content.Replace($oldExtractSeries, $newExtractSeries)


# 7. Update extractMissingCoversForFolder
$oldExtractFolder = @"
    async extractMissingCoversForFolder(folder) {
        const data = this.getLibraryData();
        const allBooks = data.series.flatMap(s => s.books).filter(b => b.file.path === folder.path || b.file.path.startsWith(folder.path + "/"));
        let extractedCount = 0;
        
        new Notice(`Started scanning missing covers for `+`$folderName`+`...`);
        
        for (let book of allBooks) {
            let existingCover = book.metadata.cover;
            if (existingCover) {
                let coverFile = this.app.metadataCache.getFirstLinkpathDest(existingCover, book.file.path);
                if (coverFile) continue; 
            }
            
            let success = await this.extractCover(book.file);
            if (success) extractedCount++;
        }
        
        new Notice(`Finished scanning `+`$extractedCount`+` covers for `+`$folderName`+`!`);
        
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BOOKSHELF);
        if (leaves.length > 0) {
            leaves[0].view.renderBookshelf();
        }
    }
"@ -replace "`r`n", "`n"
$oldExtractFolder = $oldExtractFolder -replace '\$folderName', '${folder.name}'
$oldExtractFolder = $oldExtractFolder -replace '\$extractedCount', '${extractedCount}'

$newExtractFolder = @"
    async extractMissingCoversForFolder(folder, force = false) {
        const data = this.getLibraryData();
        const allBooks = data.series.flatMap(s => s.books).filter(b => b.file.path === folder.path || b.file.path.startsWith(folder.path + "/"));
        let extractedCount = 0;
        let total = allBooks.length;
        let progressNotice = new Notice(`Scanning 0/`+`$total`+` books in `+`$folderName`+`...`, 0);
        for (let i = 0; i < total; i++) {
            let book = allBooks[i];
            if (i % 20 === 0) {
                progressNotice.setMessage(`Scanning `+`$i`+`/`+`$total`+` books in `+`$folderName`+`...\nExtracted: `+`$extractedCount`+`);
                await new Promise(r => setTimeout(r, 1));
            }
            
            if (!force) {
                let existingCover = book.metadata.cover;
                if (existingCover) {
                    let coverFile = this.app.metadataCache.getFirstLinkpathDest(existingCover, book.file.path);
                    if (coverFile) continue; 
                }
            }
            
            let success = await this.extractCover(book.file, force);
            if (success) {
                extractedCount++;
                progressNotice.setMessage(`Scanning `+`$i1`+`/`+`$total`+` books in `+`$folderName`+`...\nExtracted: `+`$extractedCount`+`);
            }
        }
        
        progressNotice.hide();
        new Notice(`Finished scanning. Extracted `+`$extractedCount`+` covers for `+`$folderName`+`!`);
        
        const leaves = this.app.workspace.getLeavesOfType("bookshelf-view");
        if (leaves.length > 0) {
            leaves[0].view.renderBookshelf();
        }
    }
"@ -replace "`r`n", "`n"
$newExtractFolder = $newExtractFolder -replace '\$total', '${total}'
$newExtractFolder = $newExtractFolder -replace '\$i1', '${i + 1}'
$newExtractFolder = $newExtractFolder -replace '\$i', '${i}'
$newExtractFolder = $newExtractFolder -replace '\$folderName', '${folder.name}'
$newExtractFolder = $newExtractFolder -replace '\$extractedCount', '${extractedCount}'
$content = $content.Replace($oldExtractFolder, $newExtractFolder)

# Ensure LF
$content = $content -replace "`r`n", "`n"

[IO.File]::WriteAllText("main.js", $content, [Text.Encoding]::UTF8)

Write-Host "Done!"
