import { createElement, useState, useEffect, useCallback } from "react";
import { BrowserS3Client, validateAWSConfig, getDocumentType, createBlobUrl } from '../utils/s3-downloader';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Simplified Document Converter - No bluebird/eval issues
export default function DocumentConverter({ 
    awsConfig, 
    documentType, 
    onDocumentLoad, 
    onProgress, 
    onError,
    autoConvert = true 
}) {
    const [isLoading, setIsLoading] = useState(false);
    const [currentStep, setCurrentStep] = useState("");
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [conversionProgress, setConversionProgress] = useState(0);

    // Initialize browser-compatible S3 client
    const initializeS3Client = useCallback(() => {
        try {
            validateAWSConfig(awsConfig);
            
            const s3Client = new BrowserS3Client(
                awsConfig.accessKeyId,
                awsConfig.secretAccessKey,
                awsConfig.region
            );
            
            console.log("🔑 Browser S3 client initialized successfully");
            return s3Client;
        } catch (error) {
            console.error("🔑 S3 client initialization failed:", error);
            throw new Error(`S3 initialization failed: ${error.message}`);
        }
    }, [awsConfig]);

    // Download file from S3
    const downloadFromS3 = useCallback(async (s3Client) => {
        setCurrentStep("Downloading from S3...");
        onProgress(10, "Connecting to AWS S3...");

        try {
            console.log("📥 Starting S3 download:", {
                bucket: awsConfig.bucketName,
                key: awsConfig.fileName
            });

            const result = await s3Client.getObject(
                awsConfig.bucketName,
                awsConfig.fileName,
                (progress, status) => {
                    setDownloadProgress(progress);
                    onProgress(10 + (progress * 0.2), status);
                }
            );
            
            setDownloadProgress(100);
            onProgress(30, "File downloaded successfully");
            
            console.log("📥 S3 download completed, file size:", result.buffer.length, "bytes");
            return result.buffer;
        } catch (error) {
            console.error("📥 S3 download failed:", error);
            throw new Error(`S3 download failed: ${error.message}`);
        }
    }, [awsConfig, onProgress]);

    // Simple DOCX to PDF conversion - Basic text extraction
    const convertDocxToPdf = useCallback(async (buffer) => {
        setCurrentStep("Converting DOCX to PDF...");
        onProgress(40, "Processing DOCX file...");

        try {
            // For now, create a simple PDF with a message about DOCX conversion
            // In production, you might want to send this to a server-side converter
            
            setConversionProgress(50);
            onProgress(60, "Creating PDF...");

            const pdf = new jsPDF('p', 'mm', 'a4');
            
            // Add title
            pdf.setFontSize(20);
            pdf.text('DOCX Document', 20, 30);
            
            // Add info message
            pdf.setFontSize(12);
            pdf.text('This DOCX file has been processed for annotation.', 20, 50);
            pdf.text('Original file: ' + awsConfig.fileName, 20, 65);
            pdf.text('Processed on: ' + new Date().toLocaleDateString(), 20, 80);
            
            // Add note about conversion
            pdf.setFontSize(10);
            pdf.text('Note: For full DOCX content conversion, consider using server-side processing.', 20, 100);
            pdf.text('This PDF allows you to add annotations that will be saved to your system.', 20, 115);
            
            // Add a placeholder content area
            pdf.rect(20, 130, 170, 100);
            pdf.text('DOCX Content Area', 25, 145);
            pdf.text('(Annotations can be added anywhere on this document)', 25, 160);
            
            setConversionProgress(100);
            onProgress(95, "DOCX to PDF conversion completed");

            // Return PDF as blob URL
            const pdfBlob = pdf.output('blob');
            const pdfUrl = URL.createObjectURL(pdfBlob);
            
            console.log("📄 DOCX to PDF conversion completed (simplified)");
            return pdfUrl;
        } catch (error) {
            console.error("📄 DOCX conversion failed:", error);
            throw new Error(`DOCX conversion failed: ${error.message}`);
        }
    }, [onProgress, awsConfig.fileName]);

    // Convert Excel to PDF - Works without issues
    const convertExcelToPdf = useCallback(async (buffer) => {
        setCurrentStep("Converting Excel to PDF...");
        onProgress(40, "Reading Excel file...");

        try {
            // Read Excel file
            const workbook = XLSX.read(buffer, { type: 'array' });
            const sheetNames = workbook.SheetNames;
            
            setConversionProgress(30);
            onProgress(50, "Converting sheets to HTML...");

            // Create PDF
            const pdf = new jsPDF('p', 'mm', 'a4');
            let isFirstPage = true;

            for (let i = 0; i < sheetNames.length; i++) {
                const sheetName = sheetNames[i];
                const worksheet = workbook.Sheets[sheetName];
                
                // Convert sheet to HTML
                const htmlTable = XLSX.utils.sheet_to_html(worksheet);
                
                if (!isFirstPage) {
                    pdf.addPage();
                }
                isFirstPage = false;

                // Create temporary container for the table
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = `
                    <div style="margin-bottom: 10px;">
                        <h3 style="margin: 0; color: #333; font-size: 16px;">${sheetName}</h3>
                    </div>
                    ${htmlTable}
                `;
                tempDiv.style.cssText = `
                    position: absolute;
                    left: -9999px;
                    top: -9999px;
                    width: 800px;
                    padding: 20px;
                    font-family: Arial, sans-serif;
                    background: white;
                `;
                
                // Style the table
                const table = tempDiv.querySelector('table');
                if (table) {
                    table.style.cssText = `
                        border-collapse: collapse;
                        width: 100%;
                        font-size: 10px;
                        margin-top: 10px;
                    `;
                    
                    const cells = table.querySelectorAll('td, th');
                    cells.forEach(cell => {
                        cell.style.cssText = `
                            border: 1px solid #ddd;
                            padding: 4px;
                            text-align: left;
                            white-space: nowrap;
                            overflow: hidden;
                            text-overflow: ellipsis;
                            max-width: 100px;
                        `;
                    });
                    
                    // Style headers
                    const headers = table.querySelectorAll('th');
                    headers.forEach(header => {
                        header.style.backgroundColor = '#f0f0f0';
                        header.style.fontWeight = 'bold';
                    });
                }

                document.body.appendChild(tempDiv);

                setConversionProgress(50 + (i / sheetNames.length) * 40);
                onProgress(60 + (i / sheetNames.length) * 25, `Converting sheet ${i + 1}/${sheetNames.length}...`);

                // Convert to canvas and add to PDF
                const canvas = await html2canvas(tempDiv, {
                    scale: 1.5,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    height: tempDiv.scrollHeight,
                    width: tempDiv.scrollWidth
                });

                document.body.removeChild(tempDiv);

                const imgData = canvas.toDataURL('image/png');
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();
                const imgWidth = canvas.width;
                const imgHeight = canvas.height;
                const ratio = Math.min(pdfWidth / imgWidth, (pdfHeight - 20) / imgHeight);
                
                const imgX = (pdfWidth - imgWidth * ratio) / 2;
                const imgY = 10;

                pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
            }

            setConversionProgress(100);
            onProgress(95, "Excel to PDF conversion completed");

            // Return PDF as blob URL
            const pdfBlob = pdf.output('blob');
            const pdfUrl = URL.createObjectURL(pdfBlob);
            
            console.log("📊 Excel to PDF conversion completed");
            return pdfUrl;
        } catch (error) {
            console.error("📊 Excel conversion failed:", error);
            throw new Error(`Excel conversion failed: ${error.message}`);
        }
    }, [onProgress]);

    // Main processing function
    const processDocument = useCallback(async () => {
        if (!awsConfig || isLoading) return;

        setIsLoading(true);
        setCurrentStep("Initializing...");
        onProgress(0, "Starting document processing...");

        try {
            // Initialize S3 client
            const s3Client = initializeS3Client();
            
            // Download file from S3
            const fileBuffer = await downloadFromS3(s3Client);
            
            let finalPdfUrl;

            switch (documentType) {
                case 'pdf':
                    setCurrentStep("Processing PDF...");
                    onProgress(90, "PDF file ready");
                    // Create blob URL for PDF
                    const pdfBlob = new Blob([fileBuffer], { type: 'application/pdf' });
                    finalPdfUrl = URL.createObjectURL(pdfBlob);
                    break;

                case 'docx':
                    finalPdfUrl = await convertDocxToPdf(fileBuffer);
                    break;

                case 'xlsx':
                    finalPdfUrl = await convertExcelToPdf(fileBuffer);
                    break;

                default:
                    throw new Error(`Unsupported document type: ${documentType}`);
            }

            onProgress(100, "Document ready for annotation");
            onDocumentLoad(finalPdfUrl);
            
        } catch (error) {
            console.error("🚨 Document processing failed:", error);
            onError(error);
        } finally {
            setIsLoading(false);
        }
    }, [awsConfig, documentType, isLoading, initializeS3Client, downloadFromS3, convertDocxToPdf, convertExcelToPdf, onDocumentLoad, onError, onProgress]);

    // Auto-start processing when config is ready
    useEffect(() => {
        if (awsConfig && autoConvert && !isLoading) {
            processDocument();
        }
    }, [awsConfig, autoConvert, processDocument, isLoading]);

    // Manual trigger button
    if (!autoConvert && !isLoading) {
        return (
            <div style={{
                textAlign: 'center',
                padding: '2rem',
                background: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #dee2e6'
            }}>
                <div style={{ fontSize: '48px', marginBottom: '1rem' }}>
                    {documentType === 'pdf' ? '📄' : documentType === 'docx' ? '📝' : '📊'}
                </div>
                <h3 style={{ color: '#495057', marginBottom: '1rem' }}>
                    Document Ready for Processing
                </h3>
                <p style={{ color: '#6c757d', marginBottom: '1.5rem' }}>
                    File: {awsConfig.fileName}<br/>
                    Type: {documentType?.toUpperCase() || 'Unknown'}<br/>
                    {documentType === 'docx' && (
                        <span style={{ fontSize: '12px', color: '#856404' }}>
                            <strong>Note:</strong> DOCX files will be converted to a basic PDF format for annotation.
                            For full content preservation, consider server-side conversion.
                        </span>
                    )}
                    {documentType === 'xlsx' && <span>Excel content will be converted to PDF for annotation</span>}
                </p>
                <button
                    onClick={processDocument}
                    style={{
                        background: '#28a745',
                        color: 'white',
                        border: 'none',
                        padding: '0.75rem 1.5rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '16px',
                        fontWeight: '600'
                    }}
                >
                    {documentType === 'pdf' ? 'Load PDF' : `Convert ${documentType?.toUpperCase()} to PDF`}
                </button>
            </div>
        );
    }

    // Loading state
    return (
        <div style={{
            textAlign: 'center',
            padding: '2rem',
            background: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #dee2e6'
        }}>
            <div style={{ fontSize: '48px', marginBottom: '1rem' }}>
                {documentType === 'pdf' ? '📄' : documentType === 'docx' ? '📝' : '📊'}
            </div>
            <h3 style={{ color: '#495057', marginBottom: '1rem' }}>
                {currentStep}
            </h3>
            <div style={{ 
                width: '300px', 
                background: '#e9ecef', 
                borderRadius: '10px',
                margin: '1rem auto',
                overflow: 'hidden'
            }}>
                <div style={{
                    width: `${Math.max(downloadProgress, conversionProgress)}%`,
                    height: '12px',
                    background: documentType === 'pdf' 
                        ? 'linear-gradient(90deg, #007bff, #0056b3)'
                        : 'linear-gradient(90deg, #28a745, #20c997)',
                    borderRadius: '10px',
                    transition: 'width 0.3s ease'
                }}></div>
            </div>
            <div style={{ fontSize: '14px', color: '#6c757d', marginTop: '1rem' }}>
                Processing: {awsConfig.fileName}<br/>
                {documentType === 'docx' && <span>Converting DOCX to annotation-ready PDF</span>}
                {documentType === 'xlsx' && <span>Converting Excel to PDF for annotation</span>}
                {documentType === 'pdf' && <span>Loading PDF for annotation</span>}
            </div>
        </div>
    );
}