const fs = require('fs');
const { marked } = require('marked');

const style = `
<style>
  body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; margin: 40px; color: #333; }
  h1, h2, h3 { color: #111; }
  h1 { border-bottom: 2px solid #2c3e50; padding-bottom: 10px; color: #2c3e50; }
  h2 { border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 30px; color: #34495e; }
  ul { margin-bottom: 20px; }
  li { margin-bottom: 10px; }
  strong { color: #000; }
  hr { border: 0; border-top: 1px solid #eee; margin: 40px 0; }
</style>
`;

function convert(mdFile, htmlFile) {
    const md = fs.readFileSync(mdFile, 'utf8');
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + mdFile + '</title>' + style + '</head><body>' + marked.parse(md) + '</body></html>';
    fs.writeFileSync(htmlFile, html, 'utf8');
}

convert('Propuesta_Patrolhood_Seguridad.md', 'Propuesta_Patrolhood_Seguridad.html');
convert('Documentacion_Tecnica_Completa_Patrolhood.md', 'Documentacion_Tecnica_Completa_Patrolhood.html');
