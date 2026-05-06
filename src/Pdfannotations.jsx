import { createElement, useState, useEffect, useCallback } from "react";
import PDFViewerComponent from "./components/PDFViewerComponent";
import { SecureS3Downloader } from "./utils/s3-downloader";
import { DocxToPdfConverter } from "./utils/docx-converter";
import { ExcelCsvToPdfConverter } from "./utils/excel-csv-converter";
import CryptoJS from "crypto-js";
import "./ui/Pdfannotations.css";

// Global counter for widget instances
let globalWidgetCounter = 0;

// Enhanced PDF Annotations Widget with robust Excel/CSV support and FIXED MICROFLOW EXECUTION
export default function Pdfannotations(props) {
    const [pdfUrl, setPdfUrl] = useState("");
    const [annotations, setAnnotations] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [loadingStatus, setLoadingStatus] = useState("Initializing widget...");
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [debugInfo, setDebugInfo] = useState([]);
    const [currentUserName, setCurrentUserName] = useState("");
    const [presignedUrlInfo, setPresignedUrlInfo] = useState(null);
    const [actualPresignedUrl, setActualPresignedUrl] = useState("");
    
    // User access control state
    const [canAddAnnotations, setCanAddAnnotations] = useState(true);
    
    // Reference documents state
    const [referenceDocuments, setReferenceDocuments] = useState([]);
    // AI annotations state
    const [aiAnnotations, setAiAnnotations] = useState([]);
    const [isAI, setIsAI] = useState(false);
    const [userRole, setUserRole] = useState('');
    const [authorId, setAuthorId] = useState('');

    // ENHANCED: Ultra-unique widget instance ID for microflow isolation
    const [widgetInstanceId] = useState(() => {
        globalWidgetCounter++;
        const timestamp = Date.now();
        const randomPart = Math.random().toString(36).substr(2, 16);
        const counterPart = globalWidgetCounter.toString().padStart(6, '0');
        const processId = typeof window !== 'undefined' ? window.performance.now().toString().replace('.', '') : '0';
        const uniqueHash = Math.random().toString(36).substr(2, 8);
        return `pdf-widget-${counterPart}-${timestamp}-${randomPart}-${processId}-${uniqueHash}`;
    });

    // Accept custom CSS classes from Studio Pro
    const {
        class: customClassName,
        style: customStyle,
        tabIndex
    } = props;

    // Combine custom classes with default classes
    const containerClasses = [
        'pdf-annotator-container',
        customClassName
    ].filter(Boolean).join(' ');

    // ENHANCED: Debug logging function with widget instance isolation
    const addDebugLog = useCallback((message) => {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] [Widget ${widgetInstanceId}] ${message}`;
        console.log(logEntry);
        setDebugInfo(prev => [...prev, logEntry]);
    }, [widgetInstanceId]);

    // ENHANCED: Execute Mendix microflow with proper error handling (COPIED FROM IMAGE ANNOTATOR)
    const executeMendixAction = useCallback((action, actionName) => {
        if (!action) {
            addDebugLog(`⚠️ ${actionName} action not configured`);
            return false;
        }

        addDebugLog(`📞 Executing ${actionName} microflow...`);
        
        try {
            // Method 1: Check if action has execute method (common pattern)
            if (action && typeof action.execute === 'function') {
                addDebugLog(`🎯 Calling ${actionName} via execute() method`);
                action.execute();
                addDebugLog(`✅ ${actionName} microflow executed successfully via execute()`);
                return true;
            }
            
            // Method 2: Direct function call
            else if (typeof action === 'function') {
                addDebugLog(`🎯 Calling ${actionName} as direct function`);
                action();
                addDebugLog(`✅ ${actionName} microflow executed successfully as function`);
                return true;
            }
            
            // Method 3: Check if action is an object with other callable methods
            else if (action && typeof action === 'object') {
                addDebugLog(`🔍 ${actionName} is object, checking for callable methods`);
                
                // Try common Mendix action patterns
                if (typeof action.call === 'function') {
                    addDebugLog(`🎯 Calling ${actionName} via call() method`);
                    action.call();
                    addDebugLog(`✅ ${actionName} microflow executed successfully via call()`);
                    return true;
                }
                
                if (typeof action.invoke === 'function') {
                    addDebugLog(`🎯 Calling ${actionName} via invoke() method`);
                    action.invoke();
                    addDebugLog(`✅ ${actionName} microflow executed successfully via invoke()`);
                    return true;
                }
                
                // Log available methods for debugging
                const availableMethods = Object.getOwnPropertyNames(action).filter(prop => typeof action[prop] === 'function');
                addDebugLog(`🔍 Available methods on ${actionName}: ${availableMethods.join(', ')}`);
            }
            
            addDebugLog(`❌ ${actionName} action exists but no valid execution method found`);
            addDebugLog(`🔍 ${actionName} type: ${typeof action}, constructor: ${action?.constructor?.name}`);
            
            return false;
            
        } catch (error) {
            addDebugLog(`❌ Error executing ${actionName} microflow: ${error.message}`);
            console.error(`[Widget ${widgetInstanceId}] ${actionName} execution error:`, error);
            return false;
        }
    }, [addDebugLog, widgetInstanceId]);

    // ENHANCED: Widget mount/unmount logging with microflow configuration check
    useEffect(() => {
        console.log(`🚀 [Widget ${widgetInstanceId}] PDF Annotations Widget initialized with FIXED MICROFLOW EXECUTION`);
        addDebugLog("=== MICROFLOW CONFIGURATION CHECK ===");
        addDebugLog(`onAnnotationAdd configured: ${!!props.onAnnotationAdd}`);
        addDebugLog(`onAnnotationDelete configured: ${!!props.onAnnotationDelete}`);
        
        if (props.onAnnotationAdd) {
            addDebugLog(`onAnnotationAdd type: ${typeof props.onAnnotationAdd}`);
            addDebugLog(`onAnnotationAdd constructor: ${props.onAnnotationAdd?.constructor?.name}`);
            addDebugLog(`onAnnotationAdd has execute: ${typeof props.onAnnotationAdd?.execute === 'function'}`);
        }
        
        if (props.onAnnotationDelete) {
            addDebugLog(`onAnnotationDelete type: ${typeof props.onAnnotationDelete}`);
            addDebugLog(`onAnnotationDelete constructor: ${props.onAnnotationDelete?.constructor?.name}`);
            addDebugLog(`onAnnotationDelete has execute: ${typeof props.onAnnotationDelete?.execute === 'function'}`);
        }
        addDebugLog("=== END MICROFLOW CONFIGURATION CHECK ===");
        
        return () => {
            console.log(`🔥 [Widget ${widgetInstanceId}] PDF Annotations Widget unmounted`);
        };
    }, [widgetInstanceId, props.onAnnotationAdd, props.onAnnotationDelete, addDebugLog]);

    // Enhanced custom editability effect
    useEffect(() => {
        addDebugLog("=== PDF ANNOTATOR CUSTOM EDITABILITY DEBUG ===");
        addDebugLog(`allowAnnotations prop: ${props.allowAnnotations}`);
        addDebugLog(`annotationMode prop: ${props.annotationMode}`);
        addDebugLog(`readOnly prop: ${props.readOnly}`);
        
        let shouldShowButton = true;
        
        if (props.readOnly === true) {
            shouldShowButton = false;
            addDebugLog("❌ readOnly is true -> Button hidden");
        }
        else if (props.allowAnnotations !== undefined && props.allowAnnotations !== null) {
            if (props.allowAnnotations.value !== undefined) {
                shouldShowButton = props.allowAnnotations.value === true;
                addDebugLog(`✅ Using allowAnnotations.value: ${props.allowAnnotations.value} -> Button visible: ${shouldShowButton}`);
            } else {
                shouldShowButton = props.allowAnnotations === true;
                addDebugLog(`✅ Using allowAnnotations direct: ${props.allowAnnotations} -> Button visible: ${shouldShowButton}`);
            }
        }
        else if (props.annotationMode !== undefined && props.annotationMode !== null) {
            let modeValue = props.annotationMode.value || props.annotationMode;
            addDebugLog(`📄 Using annotationMode: ${modeValue}`);
            
            if (typeof modeValue === 'string') {
                const mode = modeValue.toUpperCase();
                if (mode === 'ENABLED' || mode === 'ENABLE' || mode === 'TRUE') {
                    shouldShowButton = true;
                    addDebugLog("✅ Annotation mode ENABLED -> Button visible");
                } else if (mode === 'DISABLED' || mode === 'DISABLE' || mode === 'FALSE' || mode === 'READ_ONLY' || mode === 'READONLY') {
                    shouldShowButton = false;
                    addDebugLog("❌ Annotation mode DISABLED -> Button hidden");
                } else {
                    shouldShowButton = true;
                    addDebugLog("⚠️ Unknown annotation mode, defaulting to enabled");
                }
            } else {
                shouldShowButton = true;
                addDebugLog("⚠️ Non-string annotation mode, defaulting to enabled");
            }
        }
        else {
            shouldShowButton = true;
            addDebugLog("ℹ️ No custom editability properties found, defaulting to enabled");
        }
        
        addDebugLog(`🎯 FINAL DECISION: canAddAnnotations = ${shouldShowButton}`);
        addDebugLog("=== END PDF ANNOTATOR CUSTOM EDITABILITY DEBUG ===");
        
        setCanAddAnnotations(shouldShowButton);
    }, [props.allowAnnotations, props.annotationMode, props.readOnly, addDebugLog]);

    // Extract user name from props
    useEffect(() => {
        if (props.userName && props.userName.status === "available") {
            const userName = props.userName.value || "Unknown User";
            setCurrentUserName(userName);
            addDebugLog(`👤 User name set to: ${userName}`);
        } else {
            setCurrentUserName("Unknown User");
            addDebugLog("👤 User name not available, defaulting to 'Unknown User'");
        }
    }, [props.userName, addDebugLog]);

    // Extract reference documents from props
    useEffect(() => {
        addDebugLog("=== LOADING REFERENCE DOCUMENTS ===");
        try {
            let docData = null;
            let loadedDocs = [];
            
            if (props.referenceDocuments && props.referenceDocuments.value !== undefined) {
                docData = props.referenceDocuments.value;
                addDebugLog(`Found referenceDocuments.value: ${docData}`);
            } else if (typeof props.referenceDocuments === 'string') {
                docData = props.referenceDocuments;
                addDebugLog(`Found string referenceDocuments: ${docData}`);
            }
            
            if (docData && typeof docData === 'string' && docData.trim() !== '' && docData !== '[]') {
                try {
                    const parsed = JSON.parse(docData);
                    loadedDocs = Array.isArray(parsed) ? parsed : [];
                    addDebugLog(`✅ Successfully parsed reference documents: ${loadedDocs.length} items`);
                    
                    // Log the structure for debugging
                    if (loadedDocs.length > 0) {
                        addDebugLog(`📋 First document structure: ${JSON.stringify(loadedDocs[0])}`);
                    }
                } catch (parseError) {
                    console.warn('❌ Failed to parse reference documents JSON:', parseError);
                    addDebugLog(`Raw reference documents data that failed to parse: ${docData}`);
                    loadedDocs = [];
                }
            } else {
                addDebugLog("ℹ️ No valid reference documents data found, using empty array");
                loadedDocs = [];
            }
            
            setReferenceDocuments(loadedDocs);
            addDebugLog("=== END LOADING REFERENCE DOCUMENTS ===");
        } catch (error) {
            addDebugLog(`❌ Error loading reference documents: ${error.message}`);
            console.error('Error loading reference documents:', error);
            setReferenceDocuments([]);
        }
    }, [props.referenceDocuments, addDebugLog]);

    // Parse userRole from props
    useEffect(() => {
        try {
            let role = '';
            if (props.userRole && props.userRole.value !== undefined) {
                role = props.userRole.value || '';
            } else if (typeof props.userRole === 'string') {
                role = props.userRole;
            }
            setUserRole(role);
            addDebugLog(`👤 User role set to: ${role}`);
        } catch (error) {
            setUserRole('');
        }
    }, [props.userRole, addDebugLog]);

    //Parse AuthorId from props
    useEffect(() => {
        try {
            let id = '';
            if (props.authorID && props.authorID.value !== undefined) {
                id = props.authorID.value || ''
            } else if (typeof props.authorID === 'string') {
                role = props.authorID;
            }
            setAuthorId(id);
            addDebugLog(`Author ID set to: ${id}`)
        } catch (error) {
            setAuthorId('')
        }
    },[props.authorID, addDebugLog]);

    // Parse isAIGenerated flag
    useEffect(() => {
        const aiFlag = props.isAIGenerated?.value === true;
        setIsAI(aiFlag);
        addDebugLog(`🤖 isAI set to: ${aiFlag}`);
    }, [props.isAIGenerated, addDebugLog]);

    // Parse AI annotations from Mendix attribute (READ ONLY — never written back)
    useEffect(() => {
        try {
            if (!props.isAIGenerated?.value) {
                setAiAnnotations([]);
                return;
            }
            let data = null;
            if (props.aiAnnotationsData && props.aiAnnotationsData.value !== undefined) {
                data = props.aiAnnotationsData.value;
            } else if (typeof props.aiAnnotationsData === 'string') {
                data = props.aiAnnotationsData;
            }
            if (data && typeof data === 'string' && data.trim() !== '' && data !== '[]') {
                const parsed = JSON.parse(data);
                setAiAnnotations(Array.isArray(parsed) ? parsed : []);
                addDebugLog(`🤖 AI annotations loaded: ${Array.isArray(parsed) ? parsed.length : 0}`);
            } else {
                setAiAnnotations([]);
            }
        } catch (error) {
            setAiAnnotations([]);
            console.error(`[Widget ${widgetInstanceId}] Failed to parse AI annotations:`, error);
        }
    }, [props.aiAnnotationsData, props.isAIGenerated, addDebugLog, widgetInstanceId]);

    // Extract AWS configuration and download document (PDF/DOCX/Excel/CSV)
    useEffect(() => {
        addDebugLog("🔧 Enhanced PDF/DOCX/Excel/CSV Annotations Widget starting...");
        addDebugLog(`Props status - AccessKey: ${props.awsAccessKey?.status}, SecretKey: ${props.awsSecretKey?.status}, Region: ${props.awsRegion?.status} ,Bucket: ${props.s3BucketName?.status}, File: ${props.fileName?.status}, User: ${props.userName?.status}`);

        const isConfigReady = 
            props.awsAccessKey?.status === "available" && props.awsAccessKey?.value &&
            props.awsSecretKey?.status === "available" && props.awsSecretKey?.value &&
            props.awsRegion?.status === "available" && props.awsRegion?.value &&
            props.s3BucketName?.status === "available" && props.s3BucketName?.value &&
            props.fileName?.status === "available" && props.fileName?.value;

        if (isConfigReady) {
            const awsConfig = {
                accessKeyId: props.awsAccessKey.value.trim(),
                secretAccessKey: props.awsSecretKey.value.trim(),
                region: props.awsRegion.value.trim(),
                bucketName: props.s3BucketName.value.trim(),
                fileName: props.fileName.value.trim()
            };

            addDebugLog(`🔑 AWS Config ready - Region: ${awsConfig.region}, Bucket: ${awsConfig.bucketName}, File: ${awsConfig.fileName}`);
            addDebugLog(`🔑 AccessKey: ${awsConfig.accessKeyId.substring(0, 8)}***, SecretKey: ${awsConfig.secretAccessKey.substring(0, 8)}***`);

            downloadDocumentFromS3Enhanced(awsConfig);
        } else {
            const isLoading = 
                props.awsAccessKey?.status === "loading" ||
                props.awsSecretKey?.status === "loading" ||
                props.awsRegion?.status === "loading" ||
                props.s3BucketName?.status === "loading" ||
                props.fileName?.status === "loading" ||
                props.userName?.status === "loading";

            if (isLoading) {
                addDebugLog("🔑 Configuration still loading...");
                setLoadingStatus("Loading configuration...");
                setIsLoading(true);
                setError("");
            } else {
                addDebugLog("❌ Configuration incomplete");
                setError("Configuration incomplete. Please check all required fields are provided.");
                setIsLoading(false);
            }
        }
    }, [props.awsAccessKey, props.awsSecretKey, props.awsRegion, props.s3BucketName, props.fileName, props.userName, addDebugLog]);

    // Enhanced S3 download with robust Excel/CSV conversion
    const downloadDocumentFromS3Enhanced = useCallback(async (awsConfig) => {
        setIsLoading(true);
        setLoadingStatus("Initializing document downloader...");
        setDownloadProgress(0);
        setError("");
        
        try {
            addDebugLog("🚀 Starting enhanced document download with robust conversion...");

            const s3Downloader = new SecureS3Downloader(
                awsConfig.accessKeyId,
                awsConfig.secretAccessKey,
                awsConfig.region
            );

            addDebugLog("🔧 S3 downloader initialized successfully");

            // Detect file type
            const fileName = awsConfig.fileName.toLowerCase();
            const fileType = detectFileType(fileName);
            
            addDebugLog(`📄 File type detected: ${fileType} (${fileName})`);
            
            if (fileType === 'pdf') {
                addDebugLog("📄 PDF file detected, proceeding with direct download");
                setLoadingStatus("Downloading PDF file...");
            } else {
                addDebugLog(`📄 ${fileType.toUpperCase()} file detected, will convert to PDF after download`);
                setLoadingStatus(`Downloading ${fileType.toUpperCase()} file...`);
            }

            addDebugLog("🧪 Testing AWS connection...");

            const connectionTest = await s3Downloader.testConnection(awsConfig.bucketName);
                addDebugLog(`🧪 Connection test: ${connectionTest.success ? 'SUCCESS' : 'FAILED'} - ${connectionTest.message}`);
            
            const downloadMessage = fileType === 'pdf' ? 
                "Downloading PDF file..." : 
                `Downloading ${fileType.toUpperCase()} file...`;
            
            setLoadingStatus(downloadMessage);
            addDebugLog("📥 Starting file download with progress tracking...");
            
            const result = await s3Downloader.downloadFile(
                awsConfig.bucketName,
                awsConfig.fileName,
                (progress, status, presignedUrl) => {
                    const adjustedProgress = Math.min(progress, fileType === 'pdf' ? 100 : 60);
                    setDownloadProgress(adjustedProgress);
                    
                    if (presignedUrl && !actualPresignedUrl) {
                        setActualPresignedUrl(presignedUrl);
                        addDebugLog(`🔗 Captured presigned URL: ${presignedUrl.substring(0, 100)}...`);
                    }
                    
                    if (progress % 20 === 0 || progress === 100) {
                        addDebugLog(`📊 Download progress: ${progress}% - ${status}`);
                    }
                }
            );

            addDebugLog(`✅ File downloaded successfully - Size: ${result.size} bytes, Type: ${result.contentType}`);

            let finalPdfBlob;

            if (fileType === 'pdf') {
                // Use original PDF
                finalPdfBlob = new Blob([result.buffer], { type: 'application/pdf' });
                addDebugLog("📄 Using original PDF file");
                setDownloadProgress(100);
            } else {
                // Convert to PDF with enhanced error handling
                addDebugLog(`📄 Starting robust ${fileType.toUpperCase()} to PDF conversion...`);
                setLoadingStatus(`Converting ${fileType.toUpperCase()} to PDF...`);
                setDownloadProgress(70);
                
                try {
                    finalPdfBlob = await convertFileToPdfRobust(result.buffer, fileType, awsConfig.fileName);
                    addDebugLog(`✅ ${fileType.toUpperCase()} conversion completed successfully - PDF size: ${finalPdfBlob.size} bytes`);
                    setDownloadProgress(95);
                } catch (conversionError) {
                    addDebugLog(`❌ ${fileType.toUpperCase()} conversion failed: ${conversionError.message}`);
                    
                    // Try fallback conversion
                    addDebugLog("📄 Attempting fallback conversion method...");
                    try {
                        finalPdfBlob = await createFallbackPdf(conversionError.message, awsConfig.fileName, fileType);
                        addDebugLog("✅ Fallback conversion succeeded");
                    } catch (fallbackError) {
                        throw new Error(`${fileType.toUpperCase()} conversion failed: ${conversionError.message}. Fallback also failed: ${fallbackError.message}`);
                    }
                }
            }
            
            // Create blob URL with explicit revocation handling
            setLoadingStatus("Preparing PDF for display...");
            setDownloadProgress(98);
            
            // Revoke any existing blob URL
            if (pdfUrl && pdfUrl.startsWith('blob:')) {
                URL.revokeObjectURL(pdfUrl);
                addDebugLog("🧹 Revoked previous blob URL");
            }
            
            const pdfBlobUrl = URL.createObjectURL(finalPdfBlob);
            addDebugLog(`🔗 New blob URL created: ${pdfBlobUrl.substring(0, 50)}...`);
            addDebugLog(`📊 Final PDF size: ${finalPdfBlob.size} bytes`);

            // Validate PDF before setting URL
            const isValidPdf = await validatePdfBlob(finalPdfBlob);
            if (!isValidPdf) {
                addDebugLog("⚠️ PDF validation failed, but proceeding anyway");
            } else {
                addDebugLog("✅ PDF validation successful");
            }

            setPdfUrl(pdfBlobUrl);
            setError("");
            setIsLoading(false);
            setDownloadProgress(100);
            
            addDebugLog("🎉 Document ready for annotation!");

        } catch (error) {
            addDebugLog(`❌ Document processing failed: ${error.message}`);
            console.error("Document processing error:", error);
            
            let userFriendlyError = `Failed to load document: ${error.message}`;
            let troubleshootingSteps = [];
            
            if (error.message.includes('conversion failed')) {
                const fileType = error.message.includes('DOCX') ? 'DOCX' : 
                               error.message.includes('EXCEL') ? 'Excel' : 
                               error.message.includes('CSV') ? 'CSV' : 'Document';
                
                userFriendlyError = `${fileType} file could not be converted to PDF`;
                troubleshootingSteps = [
                    `Verify the ${fileType} file is not corrupted`,
                    `Try with a smaller ${fileType} file`,
                    `Check if the ${fileType} file opens correctly in its native application`,
                    `Consider converting to PDF manually and uploading as PDF`
                ];
            } else if (error.message.includes('Access denied') || error.message.includes('403')) {
                userFriendlyError = `Access denied to S3 bucket '${awsConfig.bucketName}'`;
                troubleshootingSteps = [
                    "Verify IAM permissions for s3:GetObject",
                    "Check bucket policy allows access",
                    "Ensure bucket and file exist",
                    "Verify CORS configuration on S3 bucket"
                ];
            } else if (error.message.includes('File not found') || error.message.includes('404')) {
                userFriendlyError = `File '${awsConfig.fileName}' not found in bucket`;
                troubleshootingSteps = [
                    "Verify the file exists in the S3 bucket",
                    "Check the file path is correct",
                    "Ensure you're using the right bucket"
                ];
            } else if (error.message.includes('Network') || error.message.includes('fetch')) {
                userFriendlyError = `Network error: Cannot connect to AWS S3`;
                troubleshootingSteps = [
                    "Check your internet connection",
                    "Verify AWS region is correct",
                    "Try again in a few minutes"
                ];
            }
            
            setError({ message: userFriendlyError, steps: troubleshootingSteps });
            setIsLoading(false);
            setDownloadProgress(0);
        }
    }, [addDebugLog, actualPresignedUrl, pdfUrl]);

    // Detect file type from filename
    const detectFileType = useCallback((fileName) => {
        const extension = fileName.split('.').pop();
        
        switch (extension) {
            case 'pdf':
                return 'pdf';
            case 'docx':
            case 'doc':
                return 'docx';
            case 'xlsx':
            case 'xls':
                return 'excel';
            case 'csv':
                return 'csv';
            default:
                return 'unknown';
        }
    }, []);

    // Robust file conversion with multiple fallbacks
    const convertFileToPdfRobust = useCallback(async (fileBuffer, fileType, fileName) => {
        addDebugLog(`📄 Starting robust conversion for ${fileType.toUpperCase()}`);
        
        try {
            switch (fileType) {
                case 'docx':
                    if (typeof DocxToPdfConverter !== 'undefined') {
                        const docxConverter = new DocxToPdfConverter({
                            debugLog: addDebugLog
                        });
                        return await docxConverter.convertToPdf(fileBuffer);
                    } else {
                        throw new Error('DOCX converter not available');
                    }
                    
                case 'excel':
                case 'csv':
                    const excelCsvConverter = new ExcelCsvToPdfConverter({
                        debugLog: addDebugLog,
                        fontSize: 8,
                        headerFontSize: 10,
                        maxRowsPerPage: 25,
                        maxColumnsPerPage: 8
                    });
                    return await excelCsvConverter.convertToPdf(fileBuffer, fileName);
                    
                default:
                    throw new Error(`Unsupported file type: ${fileType}`);
            }
        } catch (error) {
            addDebugLog(`❌ Primary conversion failed: ${error.message}`);
            throw error;
        }
    }, [addDebugLog]);

    // Create fallback PDF when conversion fails
    const createFallbackPdf = useCallback(async (errorMessage, fileName, fileType) => {
        addDebugLog("📄 Creating fallback PDF...");
        
        const fallbackContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj

4 0 obj
<< /Length 300 >>
stream
BT
/F1 18 Tf
50 750 Td
(Document Conversion Notice) Tj
0 -40 Td
/F1 14 Tf
(Original File: ${fileName.substring(0, 40)}) Tj
0 -25 Td
(File Type: ${fileType.toUpperCase()}) Tj
0 -40 Td
/F1 12 Tf
(This ${fileType.toUpperCase()} file could not be fully converted to PDF.) Tj
0 -25 Td
(The file was downloaded successfully from S3 but) Tj
0 -20 Td
(the conversion process encountered an issue.) Tj
0 -40 Td
/F1 10 Tf
(Error Details:) Tj
0 -15 Td
(${errorMessage.substring(0, 50)}) Tj
0 -30 Td
(Please try:) Tj
0 -15 Td
(- Converting the file to PDF manually) Tj
0 -15 Td
(- Using a simpler file format) Tj
0 -15 Td
(- Reducing file complexity) Tj
ET
endstream
endobj

5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000251 00000 n 
0000000600 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
671
%%EOF`;

        const encoder = new TextEncoder();
        const pdfBlob = new Blob([encoder.encode(fallbackContent)], { type: 'application/pdf' });
        
        addDebugLog(`✅ Fallback PDF created: ${pdfBlob.size} bytes`);
        return pdfBlob;
    }, [addDebugLog]);

    // Validate PDF blob before displaying
    const validatePdfBlob = useCallback(async (pdfBlob) => {
        try {
            const arrayBuffer = await pdfBlob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            
            // Check PDF signature
            const pdfSignature = "%PDF";
            const header = new TextDecoder().decode(uint8Array.slice(0, 4));
            
            return header === pdfSignature;
        } catch (error) {
            addDebugLog(`⚠️ PDF validation error: ${error.message}`);
            return false;
        }
    }, [addDebugLog]);

    // Extract and load annotations from Mendix attribute
    useEffect(() => {
        addDebugLog("=== LOADING PDF ANNOTATIONS FROM MENDIX ===");
        addDebugLog(`pdfAnnotations prop: ${props.pdfAnnotations}`);
        
        try {
            let annotationsData = null;
            let loadedAnnotations = [];
            
            if (props.pdfAnnotations && props.pdfAnnotations.value !== undefined) {
                annotationsData = props.pdfAnnotations.value;
                addDebugLog(`Found pdfAnnotations.value: ${annotationsData}`);
            } else if (typeof props.pdfAnnotations === 'string') {
                annotationsData = props.pdfAnnotations;
                addDebugLog(`Found string pdfAnnotations: ${annotationsData}`);
            }
            
            if (annotationsData && typeof annotationsData === 'string' && annotationsData.trim() !== '' && annotationsData !== '[]') {
                try {
                    const parsed = JSON.parse(annotationsData);
                    loadedAnnotations = Array.isArray(parsed) ? parsed : [];
                    addDebugLog(`✅ Successfully parsed annotations: ${loadedAnnotations.length} items`);
                } catch (parseError) {
                    console.warn('❌ Failed to parse annotations JSON:', parseError);
                    addDebugLog(`Raw annotation data that failed to parse: ${annotationsData}`);
                    loadedAnnotations = [];
                }
            } else {
                addDebugLog("ℹ️ No valid annotation data found, using empty array");
                loadedAnnotations = [];
            }
            
            setAnnotations(loadedAnnotations);
            addDebugLog("=== END LOADING PDF ANNOTATIONS ===");
        } catch (error) {
            addDebugLog(`❌ Error loading annotations: ${error.message}`);
            console.error('Error loading annotations:', error);
            setAnnotations([]);
        }
    }, [props.pdfAnnotations, addDebugLog]);

    // ENHANCED: Save annotations to Mendix with proper microflow execution (FOR ADD ONLY)
    const saveAnnotationsToMendix = useCallback((annotationsArray) => {
        addDebugLog("=== SAVING PDF ANNOTATIONS TO MENDIX ===");
        addDebugLog(`Annotations to save: ${annotationsArray.length} items`);
        
        try {
            const jsonString = JSON.stringify(annotationsArray);
            addDebugLog(`JSON string to save: ${jsonString.substring(0, 100)}...`);
            
            let saveSuccess = false;
            
            // Save to attribute
            if (props.pdfAnnotations && typeof props.pdfAnnotations.setValue === 'function') {
                addDebugLog("📝 Attempting direct attribute update...");
                try {
                    props.pdfAnnotations.setValue(jsonString);
                    saveSuccess = true;
                    addDebugLog("✅ Direct attribute update successful");
                } catch (error) {
                    addDebugLog(`❌ Direct attribute update failed: ${error.message}`);
                }
            } else if (props.pdfAnnotations && props.pdfAnnotations.value !== undefined) {
                addDebugLog("📝 Attempting direct value assignment...");
                try {
                    props.pdfAnnotations.value = jsonString;
                    saveSuccess = true;
                    addDebugLog("✅ Direct value assignment successful");
                } catch (error) {
                    addDebugLog(`❌ Direct value assignment failed: ${error.message}`);
                }
            } else {
                addDebugLog("❌ pdfAnnotations not available for direct update");
            }
            
            // ENHANCED: Execute onAnnotationAdd microflow (ONLY FOR ADD)
            if (props.onAnnotationAdd) {
                addDebugLog("📞 Executing onAnnotationAdd microflow...");
                const microflowSuccess = executeMendixAction(props.onAnnotationAdd, 'onAnnotationAdd');
                if (microflowSuccess) {
                    addDebugLog("✅ onAnnotationAdd microflow executed successfully");
                } else {
                    addDebugLog("❌ onAnnotationAdd microflow execution failed");
                }
            } else {
                addDebugLog("ℹ️ onAnnotationAdd not configured");
            }
            
            if (saveSuccess) {
                addDebugLog("🎉 PDF annotations saved successfully to Mendix");
            } else {
                addDebugLog("⚠️ Could not save annotations - no valid save method found");
            }
            
        } catch (error) {
            addDebugLog(`❌ Error saving annotations: ${error.message}`);
            console.error(`[Widget ${widgetInstanceId}] Error saving annotations:`, error);
        }
        
        addDebugLog("=== END SAVING PDF ANNOTATIONS ===");
    }, [props.onAnnotationAdd, props.pdfAnnotations, addDebugLog, executeMendixAction, widgetInstanceId]);

    // Save annotations with improved mechanism (FOR ADD OPERATIONS)
    const handleAnnotationsChange = useCallback((newAnnotations) => {
        addDebugLog(`📝 Updating annotations state with ${newAnnotations.length} items`);
        setAnnotations(newAnnotations);
        saveAnnotationsToMendix(newAnnotations);
    }, [saveAnnotationsToMendix, addDebugLog]);

    // FIXED: Handle annotation deletion - EXACTLY LIKE IMAGE ANNOTATOR
    const handleAnnotationDelete = useCallback((deletedAnnotations) => {
        addDebugLog("=== DELETING PDF ANNOTATION ===");
        addDebugLog(`Annotations after delete: ${deletedAnnotations.length} items`);
        
        try {
            // First update the UI
            setAnnotations(deletedAnnotations);
            
            // Save to Mendix attribute directly (NOT via saveAnnotationsToMendix)
            const jsonString = JSON.stringify(deletedAnnotations);
            addDebugLog(`JSON string to save after delete: ${jsonString.substring(0, 100)}...`);
            
            let saveSuccess = false;
            
            if (props.pdfAnnotations && typeof props.pdfAnnotations.setValue === 'function') {
                addDebugLog("📝 Attempting direct attribute update after delete...");
                try {
                    props.pdfAnnotations.setValue(jsonString);
                    saveSuccess = true;
                    addDebugLog("✅ Direct attribute update successful after delete");
                } catch (error) {
                    addDebugLog(`❌ Direct attribute update failed after delete: ${error.message}`);
                }
            } else if (props.pdfAnnotations && props.pdfAnnotations.value !== undefined) {
                addDebugLog("📝 Attempting direct value assignment after delete...");
                try {
                    props.pdfAnnotations.value = jsonString;
                    saveSuccess = true;
                    addDebugLog("✅ Direct value assignment successful after delete");
                } catch (error) {
                    addDebugLog(`❌ Direct value assignment failed after delete: ${error.message}`);
                }
            } else {
                addDebugLog("❌ pdfAnnotations not available for direct update after delete");
            }
            
            // ENHANCED: Execute ONLY the delete microflow
            if (props.onAnnotationDelete) {
                addDebugLog("📞 Executing onAnnotationDelete microflow...");
                const microflowSuccess = executeMendixAction(props.onAnnotationDelete, 'onAnnotationDelete');
                if (microflowSuccess) {
                    addDebugLog("✅ onAnnotationDelete microflow executed successfully");
                } else {
                    addDebugLog("❌ onAnnotationDelete microflow execution failed");
                }
            } else {
                addDebugLog("ℹ️ onAnnotationDelete not configured");
            }
            
            if (saveSuccess) {
                addDebugLog("🎉 PDF annotation deleted successfully in Mendix");
            } else {
                addDebugLog("⚠️ Could not save annotations after delete - no valid save method found");
            }
            
        } catch (error) {
            addDebugLog(`❌ Error deleting annotation: ${error.message}`);
            console.error(`[Widget ${widgetInstanceId}] Error deleting annotation:`, error);
        }
        
        addDebugLog("=== END DELETING PDF ANNOTATION ===");
    }, [props.onAnnotationDelete, props.pdfAnnotations, addDebugLog, executeMendixAction, widgetInstanceId]);

    // Cleanup blob URL on unmount
    useEffect(() => {
        return () => {
            if (pdfUrl && pdfUrl.startsWith('blob:')) {
                URL.revokeObjectURL(pdfUrl);
                addDebugLog("🧹 Cleaned up blob URL on unmount");
            }
        };
    }, [pdfUrl, addDebugLog]);

    // Enhanced loading state with better progress indication
    if (isLoading) {
        return createElement('div', {
            className: containerClasses,
            style: customStyle,
            tabIndex
        }, [
            createElement('div', {
                key: 'loading-state',
                className: 'pdf-loading-state',
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '400px',
                    padding: '40px',
                    textAlign: 'center',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px',
                    border: '1px solid #e9ecef'
                }
            }, [
                createElement('div', {
                    key: 'spinner',
                    className: 'pdf-loading-spinner',
                    style: {
                        width: '48px',
                        height: '48px',
                        border: '4px solid #f3f3f3',
                        borderTop: '4px solid #007bff',
                        borderRadius: '50%',
                        animation: 'pdf-spin 1s linear infinite',
                        marginBottom: '24px'
                    }
                }),
                
                createElement('div', {
                    key: 'status-info',
                    className: 'pdf-loading-status-info'
                }, [
                    createElement('h3', {
                        key: 'loading-title',
                        style: {
                            fontSize: '18px',
                            fontWeight: '600',
                            color: '#495057',
                            margin: '0 0 12px 0'
                        }
                    }, 'Loading Document'),
                    
                    createElement('p', {
                        key: 'status-text',
                        className: 'pdf-loading-status-text',
                        style: {
                            fontSize: '14px',
                            color: '#6c757d',
                            margin: '0 0 16px 0'
                        }
                    }, loadingStatus),
                    
                    downloadProgress > 0 && createElement('div', {
                        key: 'progress-container',
                        style: {
                            width: '240px',
                            marginBottom: '12px'
                        }
                    }, [
                        createElement('div', {
                            key: 'progress-bar-bg',
                            style: {
                                width: '100%',
                                height: '8px',
                                backgroundColor: '#e9ecef',
                                borderRadius: '4px',
                                overflow: 'hidden'
                            }
                        }, [
                            createElement('div', {
                                key: 'progress-bar',
                                style: {
                                    width: `${downloadProgress}%`,
                                    height: '100%',
                                    backgroundColor: '#007bff',
                                    borderRadius: '4px',
                                    transition: 'width 0.3s ease'
                                }
                            })
                        ]),
                        
                        createElement('p', {
                            key: 'progress-text',
                            style: {
                                fontSize: '12px',
                                color: '#6c757d',
                                margin: '8px 0 0 0'
                            }
                        }, `${downloadProgress}% complete`)
                    ])
                ])
            ])
        ]);
    }

    // Enhanced error state with better troubleshooting
    if (error) {
        return createElement('div', {
            className: containerClasses,
            style: customStyle,
            tabIndex
        }, [
            createElement('div', {
                key: 'error-state',
                className: 'pdf-error-state',
                style: {
                    padding: '40px',
                    textAlign: 'center',
                    backgroundColor: '#fff5f5',
                    border: '1px solid #fed7d7',
                    borderRadius: '8px',
                    margin: '20px 0'
                }
            }, [
                createElement('div', {
                    key: 'error-content',
                    className: 'pdf-error-content'
                }, [
                    createElement('div', {
                        key: 'error-icon',
                        className: 'pdf-error-icon',
                        style: { fontSize: '48px', marginBottom: '16px' }
                    }, '⚠️'),
                    
                    createElement('h3', {
                        key: 'error-title',
                        className: 'pdf-error-title',
                        style: { 
                            color: '#e53e3e', 
                            marginBottom: '12px',
                            fontSize: '20px',
                            fontWeight: '600'
                        }
                    }, 'Document Load Failed'),
                    
                    createElement('p', {
                        key: 'error-message',
                        className: 'pdf-error-message',
                        style: { 
                            color: '#666', 
                            marginBottom: '20px',
                            fontSize: '14px',
                            lineHeight: '1.5'
                        }
                    }, typeof error === 'string' ? error : error.message),
                    
                    error.steps && createElement('div', {
                        key: 'troubleshooting',
                        className: 'pdf-troubleshooting-section',
                        style: {
                            marginTop: '24px',
                            textAlign: 'left',
                            maxWidth: '600px',
                            marginLeft: 'auto',
                            marginRight: 'auto'
                        }
                    }, [
                        createElement('h4', {
                            key: 'troubleshooting-title',
                            className: 'pdf-troubleshooting-title',
                            style: {
                                color: '#d69e2e',
                                fontSize: '16px',
                                marginBottom: '12px',
                                fontWeight: '600'
                            }
                        }, '🔧 Troubleshooting Steps:'),
                        
                        createElement('ul', {
                            key: 'troubleshooting-list',
                            className: 'pdf-troubleshooting-list',
                            style: {
                                listStyleType: 'disc',
                                paddingLeft: '20px',
                                margin: '0'
                            }
                        }, error.steps.map((step, index) => 
                            createElement('li', {
                                key: index,
                                className: 'pdf-troubleshooting-item',
                                style: {
                                    marginBottom: '8px',
                                    color: '#4a5568',
                                    lineHeight: '1.4'
                                }
                            }, step)
                        ))
                    ])
                ])
            ])
        ]);
    }

    // Success - render PDF viewer with FIXED microflow support
    return createElement('div', {
        className: containerClasses,
        style: customStyle,
        tabIndex
    }, [
        createElement(PDFViewerComponent, {
            key: 'pdf-viewer',
            pdfUrl: pdfUrl,
            annotations: annotations,
            onAnnotationsChange: handleAnnotationsChange, // For ADD operations
            onAnnotationDelete: handleAnnotationDelete, // For DELETE operations - FIXED
            currentUser: currentUserName,
            canAddAnnotations: canAddAnnotations,
            allowDelete: props.allowDelete !== false,
            referenceDocuments: referenceDocuments,
            widgetInstanceId: widgetInstanceId,
            executeMendixAction: executeMendixAction,
            isAI: isAI,
            aiAnnotations: aiAnnotations,
            userRole: userRole,
            authorId: authorId,
            allowReply: props.allowReply
        })
    ]);
}