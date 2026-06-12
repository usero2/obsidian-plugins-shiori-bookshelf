const fs = require('fs');
let code = fs.readFileSync('main.js', 'utf8');

const target = `    async extractCover(bookFile) {
        let coverData = null;
        let coverExt = "jpg";`;

const replacement = `    async extractCover(bookFile) {
        let safeName = bookFile.basename.replace(/[/\\\\?%*:|"<>]/g, '-');
        let lastSlash = bookFile.path.lastIndexOf("/");
        let folderPath = lastSlash !== -1 ? bookFile.path.substring(0, lastSlash) : "";
        for (let ext of ["jpg", "jpeg", "png", "webp", "gif"]) {
            let existingFileName = folderPath ? \`\${folderPath}/\${safeName}_cover.\${ext}\` : \`\${safeName}_cover.\${ext}\`;
            let existingFile = this.app.vault.getAbstractFileByPath(existingFileName);
            if (existingFile) {
                let mdPath = bookFile.path.substring(0, bookFile.path.lastIndexOf(".")) + ".md";
                let mdFile = this.app.vault.getAbstractFileByPath(mdPath);
                if (!mdFile) {
                    await this.app.vault.create(mdPath, \`---\\ncover: "\${existingFileName}"\\n---\\n\\n[[\${bookFile.name}]]\\n\`);
                } else {
                    await this.app.fileManager.processFrontMatter(mdFile, (frontmatter) => {
                        if (!frontmatter.cover) frontmatter.cover = existingFileName;
                    });
                }
                return false;
            }
        }

        let coverData = null;
        let coverExt = "jpg";`;

// First standardize CRLF to LF just in case
let codeLF = code.replace(/\r\n/g, '\n');
if (codeLF.includes(target.replace(/\r\n/g, '\n'))) {
    code = codeLF.replace(target.replace(/\r\n/g, '\n'), replacement);
    fs.writeFileSync('main.js', code);
    console.log("Replaced successfully!");
} else {
    console.log("Could not find target!");
}
