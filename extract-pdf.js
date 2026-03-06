const fs = require('fs');
const pdf = require('pdf-parse');

async function extractPdf(pdfPath, outputPath) {
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdf(dataBuffer);
  fs.writeFileSync(outputPath, data.text);
  console.log(`Extraído: ${outputPath}`);
  console.log(`Páginas: ${data.numpages}`);
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Uso: node extract-pdf.js <input.pdf> <output.txt>');
  process.exit(1);
}

extractPdf(args[0], args[1]).catch(console.error);
