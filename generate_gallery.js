const fs = require('fs');
const path = require('path');

const galleryBase = path.join(__dirname, 'public', 'assets', 'project and work');
const outputFile = path.join(__dirname, 'functions', 'gallery-data.json');

let groupedImages = {};

const items = fs.readdirSync(galleryBase, { withFileTypes: true });

for (const item of items) {
    if (item.isDirectory()) {
        const category = item.name;
        const subDir = path.join(galleryBase, category);
        const files = fs.readdirSync(subDir);
        const images = files
            .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
            .map(f => ({
                src: `${category}/${f}`,
                category: category
            }));

        if (images.length > 0) {
            groupedImages[category] = images;
        }
    }
}

fs.writeFileSync(outputFile, JSON.stringify(groupedImages, null, 2));
console.log('✅ Generated gallery-data.json inside functions folder!');
