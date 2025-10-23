import JSZip from 'jszip';

export class DocxToPdfConverter {
    constructor(options = {}) {
        this.options = {
            fontSize: options.fontSize || 12,
            lineHeight: options.lineHeight || 14,
            margin: options.margin || 50,
            pageWidth: options.pageWidth || 595.28, 
            pageHeight: options.pageHeight || 841.89, 
            maxCharsPerLine: options.maxCharsPerLine || 75,
            ...options
        };
        
        this.debugLog = options.debugLog || ((message) => console.log(message));
    }

    /**
     * Convert DOCX buffer to PDF blob
     */
    async convertToPdf(docxBuffer) {
        try {
            this.debugLog("🔄 Starting Mendix-compatible DOCX to PDF conversion...");
            
            // Extract text from DOCX
            const textContent = await this.extractTextFromDocx(docxBuffer);
            
            if (!textContent || textContent.trim().length === 0) {
                throw new Error("No text content found in DOCX file");
            }

            this.debugLog(`📝 Extracted ${textContent.length} characters from DOCX`);
            
            // Create PDF manually
            const pdfBlob = await this.createPdfManually(textContent);
            
            this.debugLog(`📄 Successfully created PDF: ${pdfBlob.size} bytes`);
            return pdfBlob;

        } catch (error) {
            this.debugLog(`❌ DOCX conversion failed: ${error.message}`);
            
            // Create error PDF
            try {
                return await this.createErrorPdf(error.message);
            } catch (fallbackError) {
                throw new Error(`DOCX conversion failed: ${error.message}. Fallback also failed: ${fallbackError.message}`);
            }
        }
    }

    /**
     * Extract text from DOCX using JSZip
     */
    async extractTextFromDocx(docxBuffer) {
        try {
            this.debugLog("📁 Parsing DOCX file with JSZip...");
            
            const zip = await JSZip.loadAsync(docxBuffer);
            const documentXml = await zip.file("word/document.xml")?.async("text");
            
            if (!documentXml) {
                throw new Error("Could not find document.xml in DOCX file");
            }

            this.debugLog("✅ Extracting text from XML...");
            
            // Extract text using regex patterns
            let text = documentXml
                // Extract text from <w:t> elements
                .replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, '$1')
                // Handle paragraph breaks
                .replace(/<w:p[^>]*>/g, '\n')
                .replace(/<w:br[^>]*>/g, '\n')
                // Remove all XML tags
                .replace(/<[^>]*>/g, '')
                // Clean up
                .replace(/\s+/g, ' ')
                .replace(/\n\s*/g, '\n')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'")
                .trim();

            // Fallback if little text found
            if (text.length < 50) {
                text = documentXml
                    .replace(/<[^>]*>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim() || "Document converted from DOCX";
            }

            return text;

        } catch (error) {
            this.debugLog(`❌ Error parsing DOCX: ${error.message}`);
            throw new Error(`Failed to extract text from DOCX: ${error.message}`);
        }
    }

    /**
     * Create PDF manually using PDF specification
     */
    async createPdfManually(textContent) {
        try {
            this.debugLog("📄 Creating PDF manually...");
            
            const cleanText = this.cleanText(textContent);
            const lines = this.splitIntoLines(cleanText);
            
            // Create PDF structure
            const pdf = this.createPdfStructure(lines);
            
            return new Blob([pdf], { type: 'application/pdf' });

        } catch (error) {
            this.debugLog(`❌ Error creating PDF: ${error.message}`);
            throw error;
        }
    }

    /**
     * Clean text for PDF
     */
    cleanText(text) {
        return text
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\t/g, '    ')
            .replace(/[^\x20-\x7E\n]/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/\n\s+/g, '\n')
            .trim();
    }

    /**
     * Split text into lines
     */
    splitIntoLines(text) {
        const paragraphs = text.split('\n');
        const lines = [];
        const maxLength = this.options.maxCharsPerLine;
        
        for (const paragraph of paragraphs) {
            if (!paragraph.trim()) {
                lines.push('');
                continue;
            }
            
            const words = paragraph.trim().split(/\s+/);
            let currentLine = '';
            
            for (const word of words) {
                const testLine = currentLine ? `${currentLine} ${word}` : word;
                
                if (testLine.length <= maxLength) {
                    currentLine = testLine;
                } else {
                    if (currentLine) {
                        lines.push(currentLine);
                        currentLine = word.length <= maxLength ? word : word.substring(0, maxLength);
                    } else {
                        lines.push(word.substring(0, maxLength));
                        currentLine = '';
                    }
                }
            }
            
            if (currentLine) {
                lines.push(currentLine);
            }
        }
        
        return lines;
    }

    /**
     * Create PDF binary structure manually (optimized for react-pdf compatibility)
     */
    createPdfStructure(lines) {
        const { pageWidth, pageHeight, margin, fontSize, lineHeight } = this.options;
        const maxLinesPerPage = Math.floor((pageHeight - (margin * 2)) / lineHeight);
        
        // Calculate pages needed
        const totalPages = Math.ceil(lines.length / maxLinesPerPage) || 1;
        
        // Build PDF content streams for each page
        const contentStreams = [];
        
        for (let pageNum = 0; pageNum < totalPages; pageNum++) {
            const startLine = pageNum * maxLinesPerPage;
            const endLine = Math.min(startLine + maxLinesPerPage, lines.length);
            const pageLines = lines.slice(startLine, endLine);
            
            let contentStream = 'BT\n/F1 12 Tf\n50 750 Td\n';
            
            for (let i = 0; i < pageLines.length; i++) {
                const line = pageLines[i] || '';
                
                // Escape special characters for PDF
                const escapedLine = line
                    .replace(/\\/g, '\\\\')
                    .replace(/\(/g, '\\(')
                    .replace(/\)/g, '\\)')
                    .replace(/\r/g, '\\r')
                    .replace(/\n/g, '\\n')
                    .substring(0, 75); // Limit line length
                
                contentStream += `(${escapedLine}) Tj\n0 -${lineHeight} Td\n`;
            }
            
            contentStream += 'ET';
            contentStreams.push(contentStream);
        }
        
        // Create PDF with proper structure for react-pdf compatibility
        let pdf = '%PDF-1.4\n';
        let currentPos = pdf.length;
        const xrefTable = [];
        
        // Object 1: Catalog
        xrefTable.push(currentPos);
        const catalogContent = `1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n`;
        pdf += catalogContent;
        currentPos += catalogContent.length;
        
        // Object 2: Pages
        xrefTable.push(currentPos);
        const pageRefs = [];
        for (let i = 0; i < totalPages; i++) {
            pageRefs.push(`${3 + i * 2} 0 R`);
        }
        const pagesContent = `2 0 obj\n<<\n/Type /Pages\n/Kids [${pageRefs.join(' ')}]\n/Count ${totalPages}\n>>\nendobj\n`;
        pdf += pagesContent;
        currentPos += pagesContent.length;
        
        // Page objects and content streams
        for (let pageNum = 0; pageNum < totalPages; pageNum++) {
            const pageObjId = 3 + pageNum * 2;
            const contentObjId = pageObjId + 1;
            const contentStream = contentStreams[pageNum];
            
            // Page object
            xrefTable.push(currentPos);
            const pageContent = `${pageObjId} 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 ${pageWidth} ${pageHeight}]\n/Resources <<\n/Font <<\n/F1 <<\n/Type /Font\n/Subtype /Type1\n/BaseFont /Helvetica\n>>\n>>\n>>\n/Contents ${contentObjId} 0 R\n>>\nendobj\n`;
            pdf += pageContent;
            currentPos += pageContent.length;
            
            // Content stream object
            xrefTable.push(currentPos);
            const streamContent = `${contentObjId} 0 obj\n<<\n/Length ${contentStream.length}\n>>\nstream\n${contentStream}\nendstream\nendobj\n`;
            pdf += streamContent;
            currentPos += streamContent.length;
        }
        
        // Cross-reference table
        const xrefPos = currentPos;
        pdf += 'xref\n';
        pdf += `0 ${xrefTable.length + 1}\n`;
        pdf += '0000000000 65535 f \n';
        
        for (const pos of xrefTable) {
            pdf += pos.toString().padStart(10, '0') + ' 00000 n \n';
        }
        
        // Trailer
        pdf += 'trailer\n';
        pdf += `<<\n/Size ${xrefTable.length + 1}\n/Root 1 0 R\n>>\n`;
        pdf += 'startxref\n';
        pdf += xrefPos + '\n';
        pdf += '%%EOF\n';
        
        return new TextEncoder().encode(pdf);
    }

    /**
     * Create error PDF
     */
    async createErrorPdf(errorMessage) {
        try {
            const errorText = `DOCX Conversion Error\n\nThe DOCX file could not be converted to PDF.\n\nError: ${errorMessage}\n\nThis may happen with:\n• Complex formatting\n• Password-protected files\n• Corrupted documents\n\nPlease try:\n• Converting to PDF manually\n• Using simpler formatting\n• Checking the original file`;
            
            return this.createPdfManually(errorText);
            
        } catch (error) {
            // Last resort: create minimal PDF
            const minimalPdf = '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 595.28 841.89]\n/Resources <<\n/Font <<\n/F1 <<\n/Type /Font\n/Subtype /Type1\n/BaseFont /Helvetica\n>>\n>>\n>>\n/Contents 4 0 R\n>>\nendobj\n4 0 obj\n<<\n/Length 53\n>>\nstream\nBT\n/F1 12 Tf\n50 750 Td\n(DOCX Conversion Failed) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000344 00000 n \ntrailer\n<<\n/Size 5\n/Root 1 0 R\n>>\nstartxref\n447\n%%EOF';
            return new Blob([new TextEncoder().encode(minimalPdf)], { type: 'application/pdf' });
        }
    }

    /**
     * Static conversion method
     */
    static async convert(docxBuffer, options = {}) {
        const converter = new DocxToPdfConverter(options);
        return await converter.convertToPdf(docxBuffer);
    }
}

export default DocxToPdfConverter;