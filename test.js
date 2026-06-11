const fs = require("fs");
const fflate = require("./fflate.js");
const data = fs.readFileSync("Lite Novel/OVERLORD/Overlord เล่ม 1 The undead king ราชันอมตะ.epub");
const zip = fflate.unzipSync(new Uint8Array(data));

const getZipEntry = (path) => {
    if (!path) return null;
    if (zip[path]) return zip[path];
    const lowerPath = path.toLowerCase();
    const key = Object.keys(zip).find(k => k.toLowerCase() === lowerPath);
    return key ? zip[key] : null;
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
const containerStr = readText(containerEntry);
const opfMatch = containerStr.match(/full-path="([^"]+)"/i);
const opfPath = opfMatch[1];
const opfDir  = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";
const opfEntry = getZipEntry(opfPath);
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
    const imgExts = /\.(jpg|jpeg|png|webp|gif)$/i;
    for (const id in itemMap) {
        const a = itemMap[id];
        if (!a.href || !imgExts.test(a.href)) continue;
        if (/cover/i.test(id) || /cover/i.test(a.href)) {
            coverHref = a.href; break;
        }
    }
}

console.log("coverHref:", coverHref);

const decodedHref = decodeURIComponent(coverHref);
const candidates = [opfDir + decodedHref, decodedHref, opfDir + coverHref, coverHref];
let found = null;
for (const candidate of candidates) {
    const entry = getZipEntry(candidate);
    if (entry) { found = candidate; break; }
}

console.log("found in zip:", found);
