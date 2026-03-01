const { execSync } = require('child_process');
const fs = require('fs');

console.log("Instalando navegador robot temporal (puppeteer)... esto tarda 20 segundos...");
try {
    execSync('npm install --no-save puppeteer', { stdio: 'inherit' });
} catch (e) {
    console.error("Error instalando puppeteer", e);
}

const puppeteer = require('puppeteer');

const delay = ms => new Promise(res => setTimeout(res, ms));

(async () => {
    console.log("Iniciando navegador en 960x540...");
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 540 });

    console.log("Abriendo localhost:3000...");
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

    // Bypass 1
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        let b = btns.find(el => el.textContent.includes('By-pass Login'));
        if (b) b.click();
    });
    await delay(1000);

    // Bypass 2
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        let b = btns.find(el => el.textContent.includes('Autoconectar'));
        if (b) b.click();
    });
    await delay(3000);

    console.log("Haciendo captura del Resumen (1/3)...");
    await page.screenshot({ path: 'ghl_preview_1_resumen.png' });

    console.log("Haciendo captura del Pipeline (2/3)...");
    await page.goto('http://localhost:3000/pipeline', { waitUntil: 'networkidle2' });
    await delay(2000);
    await page.screenshot({ path: 'ghl_preview_2_pipeline.png' });

    console.log("Haciendo captura del Rendimiento (3/3)...");
    await page.goto('http://localhost:3000/performance', { waitUntil: 'networkidle2' });
    await delay(2000);
    await page.screenshot({ path: 'ghl_preview_3_rendimiento.png' });

    await browser.close();

    console.log("Limpiando...");
    execSync('npm uninstall --no-save puppeteer', { stdio: 'ignore' });

    console.log("=========================================");
    console.log("¡ÉXITO! Se han creado las 3 imágenes en la carpeta del proyecto:");
    console.log("- ghl_preview_1_resumen.png");
    console.log("- ghl_preview_2_pipeline.png");
    console.log("- ghl_preview_3_rendimiento.png");
    process.exit(0);
})();
