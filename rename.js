const fs = require('fs');
const path = require('path');

const rootDir = 'c:/Users/ASUS/Desktop/elegant';

const replacements = [
  { regex: /Vaisra Apparel International \(Pvt\) Ltd/g, replacement: 'Vaisra Apparel' },
  { regex: /Vaisra Apparel/g, replacement: 'Vaisra Apparel' },
  { regex: /Vaisra AI/g, replacement: 'Vaisra AI' },
  { regex: /\[Vaisra AI\]/g, replacement: '[Vaisra AI]' },
  { regex: /akilavaisra@gmail.com/g, replacement: 'akilavaisra@gmail.com' }
];

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.git') && !file.includes('dist')) {
        results = results.concat(walk(file));
      }
    } else {
      if (file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.html') || file.endsWith('.json')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk(rootDir);

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  
  replacements.forEach(r => {
    content = content.replace(r.regex, r.replacement);
  });
  
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated: ${file}`);
  }
});
