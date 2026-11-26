"use strict";
// Build a static preview bundle only. Never include docs, tests, Git metadata or credentials.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
const out=path.join(root,"dist");
const files=["index.html","sales.html","staff.html","ocr.html","assets/logo.webp"];
const version=fs.readFileSync(path.join(root,"index.html"),"utf8").match(/name="tanaka-release" content="([^"]+)"/)?.[1];
assert(version,"missing release");
for(const file of files.filter(f=>f.endsWith(".html"))){
 const html=fs.readFileSync(path.join(root,file),"utf8");
 assert(html.includes('name="tanaka-release" content="'+version+'"'),file+" release mismatch");
}
fs.rmSync(out,{recursive:true,force:true});
for(const file of files){
 const dest=path.join(out,file);
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.copyFileSync(path.join(root,file),dest);
 assert.equal(crypto.createHash("sha256").update(fs.readFileSync(dest)).digest("hex"),crypto.createHash("sha256").update(fs.readFileSync(path.join(root,file))).digest("hex"),file+" differs");
}
console.log("PASS static preview package "+version+": "+files.join(", "));
