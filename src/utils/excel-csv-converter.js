import * as XLSX from 'xlsx';

/**
 * Simple Working Excel/CSV to PDF Converter
 * Uses straightforward text-based approach like DOCX converter but with table formatting
 */

export class ExcelCsvToPdfConverter {
    constructor(options = {}) {
        this.options = {
            fontSize: options.fontSize || 10,
            headerFontSize: options.headerFontSize || 12,
            maxRowsPerPage: options.maxRowsPerPage || 30,
            maxColumnsPerPage: options.maxColumnsPerPage || 6,
            pageWidth: 842, // A4 landscape
            pageHeight: 595,
            margin: 40,
            lineHeight: 16,
            ...options
        };
        
        this.debugLog = options.debugLog || ((message) => console.log(message));
    }

    /**
     * Convert Excel/CSV buffer to simple table PDF
     */
    async convertToPdf(fileBuffer, fileName = '') {
        try {
            this.debugLog("🔄 Starting simple Excel/CSV to PDF conversion...");
            
            const fileExtension = this.getFileExtension(fileName);
            this.debugLog(`📄 File type: ${fileExtension}`);
            
            // Parse the file
            const workbook = this.parseFile(fileBuffer, fileExtension);
            
            if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
                throw new Error("No sheets found in file");
            }

            // Extract simple text content like DOCX converter
            const textContent = this.extractSimpleTableText(workbook);
            
            if (!textContent || textContent.trim().length === 0) {
                throw new Error("No data found in file");
            }

            this.debugLog(`📝 Extracted text content: ${textContent.length} characters`);
            this.debugLog(`📝 Sample content: ${textContent.substring(0, 200)}...`);
            
            // Create simple PDF like DOCX converter but with table formatting
            const pdfBlob = this.createSimpleTablePdf(textContent, fileName);
            
            this.debugLog(`📄 Successfully created simple table PDF: ${pdfBlob.size} bytes`);
            return pdfBlob;

        } catch (error) {
            this.debugLog(`❌ Simple conversion failed: ${error.message}`);
            
            // Create error PDF like DOCX converter
            try {
                return await this.createErrorPdf(error.message, fileName);
            } catch (fallbackError) {
                throw new Error(`Excel/CSV conversion failed: ${error.message}. Fallback also failed: ${fallbackError.message}`);
            }
        }
    }

    /**
     * Get file extension
     */
    getFileExtension(fileName) {
        if (!fileName) return 'unknown';
        return fileName.toLowerCase().split('.').pop() || 'unknown';
    }

    /**
     * Parse file with SheetJS
     */
    parseFile(fileBuffer, fileExtension) {
        try {
            if (fileExtension === 'csv') {
                const csvText = new TextDecoder('utf-8').decode(fileBuffer);
                return XLSX.read(csvText, { type: 'string' });
            } else {
                return XLSX.read(fileBuffer, { type: 'array' });
            }
        } catch (error) {
            throw new Error(`Failed to parse ${fileExtension.toUpperCase()}: ${error.message}`);
        }
    }

    /**
     * Extract simple table text (like DOCX converter approach)
     */
    extractSimpleTableText(workbook) {
        try {
            let textContent = '';
            
            for (const sheetName of workbook.SheetNames) {
                this.debugLog(`📊 Processing sheet: ${sheetName}`);
                
                const worksheet = workbook.Sheets[sheetName];
                if (!worksheet) continue;

                // Add sheet header if multiple sheets
                if (workbook.SheetNames.length > 1) {
                    textContent += `\n=== Sheet: ${sheetName} ===\n\n`;
                }

                // Convert sheet to array of arrays
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                    header: 1,
                    raw: false,
                    defval: '',
                    blankrows: false
                });
                
                this.debugLog(`📊 Sheet ${sheetName} rows: ${jsonData.length}`);
                
                if (jsonData.length > 0) {
                    // Process each row and format as table
                    jsonData.forEach((row, index) => {
                        if (row && row.length > 0) {
                            // Take only max columns
                            const limitedRow = row.slice(0, this.options.maxColumnsPerPage);
                            
                            // Format each cell
                            const formattedCells = limitedRow.map(cell => {
                                const cellValue = String(cell || '').trim();
                                // Fixed width for table alignment
                                return cellValue.length > 18 ? cellValue.substring(0, 15) + '...' : cellValue;
                            });
                            
                            // Create table row with proper spacing
                            const tableRow = formattedCells.map(cell => cell.padEnd(20, ' ')).join('| ');
                            textContent += '| ' + tableRow + '|\n';
                            
                            // Add separator line after header
                            if (index === 0) {
                                const separator = formattedCells.map(() => ''.padEnd(20, '-')).join('+-');
                                textContent += '+-' + separator + '+\n';
                            }
                        }
                    });
                    
                    // Add bottom border
                    if (jsonData.length > 1) {
                        const lastRow = jsonData[jsonData.length - 1] || [];
                        const bottomBorder = lastRow.slice(0, this.options.maxColumnsPerPage)
                            .map(() => ''.padEnd(20, '-')).join('+-');
                        textContent += '+-' + bottomBorder + '+\n';
                    }
                    
                    textContent += '\n'; // Space between sheets
                    this.debugLog(`✅ Sheet ${sheetName}: ${jsonData.length} rows processed`);
                }
            }
            
            return textContent.trim();
            
        } catch (error) {
            this.debugLog(`❌ Error extracting simple table text: ${error.message}`);
            throw new Error(`Failed to extract table text: ${error.message}`);
        }
    }

    /**
     * Create simple table PDF (like DOCX converter approach)
     */
    createSimpleTablePdf(textContent, fileName) {
        try {
            this.debugLog("📄 Creating simple table PDF...");
            
            const cleanText = this.cleanTableText(textContent);
            const lines = this.splitIntoLines(cleanText);
            
            this.debugLog(`📝 Split into ${lines.length} lines`);
            
            // Create PDF structure using DOCX converter approach
            const pdf = this.createPdfStructure(lines, fileName);
            
            return new Blob([pdf], { type: 'application/pdf' });

        } catch (error) {
            this.debugLog(`❌ Error creating simple table PDF: ${error.message}`);
            throw error;
        }
    }

    /**
     * Clean table text (similar to DOCX converter)
     */
    cleanTableText(text) {
        return text
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\t/g, '    ')
            .replace(/[^\x20-\x7E\n\|\+\-]/g, ' ') // Keep table characters
            .replace(/\s+/g, ' ')
            .replace(/\n\s+/g, '\n')
            .trim();
    }

    /**
     * Split text into lines (similar to DOCX converter)
     */
    splitIntoLines(text) {
        const paragraphs = text.split('\n');
        const lines = [];
        
        for (const paragraph of paragraphs) {
            if (!paragraph.trim()) {
                lines.push('');
                continue;
            }
            
            // For table lines, keep them as-is (don't wrap)
            if (paragraph.includes('|') || paragraph.includes('+')) {
                lines.push(paragraph.trim());
            } else {
                // For regular text, apply word wrapping
                const words = paragraph.trim().split(/\s+/);
                let currentLine = '';
                const maxLength = 90; // Longer for landscape
                
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
        }
        
        return lines;
    }

    /**
     * Create PDF binary structure (same as DOCX converter but landscape)
     */
    createPdfStructure(lines, fileName) {
        const { pageWidth, pageHeight, margin, fontSize, lineHeight } = this.options;
        const maxLinesPerPage = Math.floor((pageHeight - (margin * 2)) / lineHeight);
        
        // Calculate pages needed
        const totalPages = Math.ceil(lines.length / maxLinesPerPage) || 1;
        
        this.debugLog(`📊 Creating ${totalPages} pages for ${lines.length} lines`);
        
        // Build PDF content streams for each page
        const contentStreams = [];
        
        for (let pageNum = 0; pageNum < totalPages; pageNum++) {
            const startLine = pageNum * maxLinesPerPage;
            const endLine = Math.min(startLine + maxLinesPerPage, lines.length);
            const pageLines = lines.slice(startLine, endLine);
            
            let contentStream = 'BT\n/F1 12 Tf\n50 520 Td\n'; // Higher Y for landscape
            
            // Add title on first page
            if (pageNum === 0) {
                contentStream += `(Excel/CSV Table: ${this.escapePdfString(fileName || 'Converted File')}) Tj\n0 -20 Td\n`;
                contentStream += '0 -10 Td\n'; // Extra space
            }
            
            // Add page number if multiple pages
            if (totalPages > 1) {
                contentStream += `/F1 10 Tf\n(Page ${pageNum + 1} of ${totalPages}) Tj\n0 -15 Td\n/F1 ${fontSize} Tf\n`;
            }
            
            for (let i = 0; i < pageLines.length; i++) {
                const line = pageLines[i] || '';
                
                // Use monospace-like font for table alignment
                const escapedLine = this.escapePdfString(line);
                
                contentStream += `(${escapedLine}) Tj\n0 -${lineHeight} Td\n`;
            }
            
            contentStream += 'ET';
            contentStreams.push(contentStream);
        }
        
        // Create PDF structure (same as DOCX converter)
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
            const pageContent = `${pageObjId} 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 ${pageWidth} ${pageHeight}]\n/Resources <<\n/Font <<\n/F1 <<\n/Type /Font\n/Subtype /Type1\n/BaseFont /Courier\n>>\n>>\n>>\n/Contents ${contentObjId} 0 R\n>>\nendobj\n`;
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
     * Escape special characters for PDF (same as DOCX converter)
     */
    escapePdfString(str) {
        if (!str) return '';
        return str
            .replace(/\\/g, '\\\\')
            .replace(/\(/g, '\\(')
            .replace(/\)/g, '\\)')
            .replace(/\r/g, '\\r')
            .replace(/\n/g, '\\n')
            .substring(0, 90); // Longer for landscape
    }

    /**
     * Create error PDF (same approach as DOCX converter)
     */
    async createErrorPdf(errorMessage, fileName) {
        try {
            const errorText = `Excel/CSV Table Conversion Error\n\nThe Excel/CSV file could not be converted to PDF.\n\nFile: ${fileName || 'Unknown'}\nError: ${errorMessage}\n\nThis may happen with:\n• Complex Excel formulas\n• Large files with many columns\n• Corrupted spreadsheet files\n• Unsupported Excel features\n\nPlease try:\n• Converting to PDF manually\n• Using simpler Excel/CSV format\n• Reducing file size\n• Checking the original file`;
            
            return this.createSimpleTablePdf(errorText, fileName);
            
        } catch (error) {
            // Last resort: create minimal PDF (same as DOCX converter)
            const minimalPdf = '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 842 595]\n/Resources <<\n/Font <<\n/F1 <<\n/Type /Font\n/Subtype /Type1\n/BaseFont /Courier\n>>\n>>\n>>\n/Contents 4 0 R\n>>\nendobj\n4 0 obj\n<<\n/Length 58\n>>\nstream\nBT\n/F1 12 Tf\n50 520 Td\n(Excel/CSV Table Conversion Failed) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000356 00000 n \ntrailer\n<<\n/Size 5\n/Root 1 0 R\n>>\nstartxref\n464\n%%EOF';
            return new Blob([new TextEncoder().encode(minimalPdf)], { type: 'application/pdf' });
        }
    }

    /**
     * Static conversion method (same as DOCX converter)
     */
    static async convert(fileBuffer, fileName = '', options = {}) {
        const converter = new ExcelCsvToPdfConverter(options);
        return await converter.convertToPdf(fileBuffer, fileName);
    }
}

export default ExcelCsvToPdfConverter;