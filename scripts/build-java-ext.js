function isWin() {
    return /^win/.test(process.platform);
}

function mvnw() {
    return isWin() ? 'mvnw.cmd' : './mvnw';
}

const cp = require('child_process');
const path = require('path');
const serverDir = path.join(__dirname, '..', 'java-extension');

cp.execSync(`${mvnw()} clean package`, { cwd: serverDir, stdio: [0, 1, 2] });
const fs = require('fs');
const libDir = path.join(__dirname, "..", "lib");
if (!fs.existsSync(libDir)) {
    fs.mkdirSync(libDir);
}
const jarFile = fs.readdirSync(path.join(serverDir, "target")).find(f => f.match(/\.jar$/));
fs.copyFileSync(path.join(serverDir, "target", jarFile), path.join(libDir, "java-extension.jar"))