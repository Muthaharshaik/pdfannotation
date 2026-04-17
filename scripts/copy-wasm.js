const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sourceDir = path.join(__dirname, '../node_modules/pdfjs-dist/wasm');
const filesToCopy = ['openjpeg.wasm', 'qcms_bg.wasm'];

// Only job: inject wasm files into the .mpk package
const mpkDir = path.join(__dirname, '../dist/1.0.9');

if (fs.existsSync(mpkDir)) {
    const mpkFiles = fs.readdirSync(mpkDir).filter(f => f.endsWith('.mpk'));
    
    mpkFiles.forEach(mpkFile => {
        const mpkPath = path.join(mpkDir, mpkFile).replace(/\\/g, '\\\\');
        
        filesToCopy.forEach(file => {
            const wasmFile = path.join(sourceDir, file).replace(/\\/g, '\\\\');
            const entryName = `lowcode-labs/pdfannotations/${file}`;
            
            const cmd = `powershell -command "Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [System.IO.Compression.ZipFile]::Open('${mpkPath}', 'Update'); [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, '${wasmFile}', '${entryName}'); $zip.Dispose();"`;
            
            try {
                execSync(cmd);
                console.log(`✅ Injected ${file} into ${mpkFile}`);
            } catch (error) {
                console.warn(`⚠️ Failed to inject ${file}: ${error.message}`);
            }
        });
        
        console.log(`🎉 ${mpkFile} is ready to replace in Mendix widgets folder!`);
    });
}