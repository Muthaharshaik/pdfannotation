// MEMORY-OPTIMIZED VERSION - Key Changes:
// Proper blob URL cleanup
// Limited debug log size
// Optimized file preview handling
// Better event listener cleanup
// Memoized expensive calculations

import { createElement, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Document, Page, pdfjs } from 'react-pdf';

// PDF.js worker setup
console.log('🔧 PDF.js version from react-pdf:', pdfjs.version);
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Global counter for widget instances
let globalWidgetCounter = 0;


export default function PDFViewerComponent({ 
    pdfUrl, 
    annotations = [], 
    onAnnotationsChange,
    onAnnotationDelete,
    currentUser = "Unknown User",
    canAddAnnotations = true,
    allowDelete = true,
    referenceDocuments = [],
    widgetInstanceId: parentWidgetInstanceId,
    executeMendixAction
}) {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [numPages, setNumPages] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [scale, setScale] = useState(0.8);
    const [annotationMode, setAnnotationMode] = useState(false);
    const [showCommentModal, setShowCommentModal] = useState(false);
    const [commentText, setCommentText] = useState("");
    const [selectedReferenceDoc, setSelectedReferenceDoc] = useState("");
    const [selectedArea, setSelectedArea] = useState(null);
    const [showSidebar, setShowSidebar] = useState(true);
    const [diagnostics, setDiagnostics] = useState([]);
    const [loadMethod, setLoadMethod] = useState('direct');
    const [processedPdfSource, setProcessedPdfSource] = useState(null);
    const [isPreparingSource, setIsPreparingSource] = useState(false);
    const [editingAnnotation, setEditingAnnotation] = useState(null);
    
    // File upload states
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [showFilePreview, setShowFilePreview] = useState(false);
    const [previewFile, setPreviewFile] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [isCanvasReady, setIsCanvasReady] = useState(false);
    
    // Area selection states
    const [isDrawing, setIsDrawing] = useState(false);
    const [startPoint, setStartPoint] = useState(null);
    const [currentRect, setCurrentRect] = useState(null);

    // Reference document states
    const [showRefDocDropdown, setShowRefDocDropdown] = useState(false);
    const [selectedRefDocName, setSelectedRefDocName] = useState('');
    const [referenceSearchTerm, setReferenceSearchTerm] = useState('');

    const [viewerWidgetInstanceId] = useState(() => {
        if (parentWidgetInstanceId) {
            return `${parentWidgetInstanceId}-viewer`;
        }
        globalWidgetCounter++;
        const timestamp = Date.now();
        const randomPart = Math.random().toString(36).substr(2, 16);
        const counterPart = globalWidgetCounter.toString().padStart(6, '0');
        const processId = typeof window !== 'undefined' ? window.performance.now().toString().replace('.', '') : '0';
        const uniqueHash = Math.random().toString(36).substr(2, 8);
        return `pdf-viewer-${counterPart}-${timestamp}-${randomPart}-${processId}-${uniqueHash}`;
    });

    const [isMaximized, setIsMaximized] = useState(false);
    const [expandedAnnotations, setExpandedAnnotations] = useState(new Set());

    // Refs
    const richTextRef = useRef(null);
    const pageRef = useRef(null);
    const overlayRef = useRef(null);
    const containerRef = useRef(null);
    const refDocDropdownRef = useRef(null);
    const pdfPageRef = useRef(null);
    const fileInputRef = useRef(null);
    const searchInputRef = useRef(null);
    const modalContainerRef = useRef(null);

    //
    
    // MEMORY OPTIMIZATION: Track blob URLs for cleanup
    const blobUrlsToCleanup = useRef(new Set());
    
    const [richTextContent, setRichTextContent] = useState('');

    // Debug logging function with widget instance isolation
    const addDebugLog = useCallback((message) => {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] [Viewer ${viewerWidgetInstanceId}] ${message}`;
        console.log(logEntry);
        setDiagnostics(prev => [...prev, logEntry]);
    }, [viewerWidgetInstanceId]);

    // Widget mount/unmount logging
    useEffect(() => {
        console.log(`🚀 [Viewer ${viewerWidgetInstanceId}] PDFViewerComponent initialized with FIXED DELETE MICROFLOW EXECUTION`);
        console.log(`🔧 [Viewer ${viewerWidgetInstanceId}] Enhanced microflow executor available:`, !!executeMendixAction);
        
        return () => {
            console.log(`🔥 [Viewer ${viewerWidgetInstanceId}] PDFViewerComponent unmounted`);
        };
    }, [viewerWidgetInstanceId, executeMendixAction]);

    // Handle maximize/minimize toggle
    const handleMaximizeToggle = useCallback(() => {
        const newMaximizedState = !isMaximized;
        console.log(`🔄 [Viewer ${viewerWidgetInstanceId}] Toggling maximize: ${isMaximized} -> ${newMaximizedState}`);
        setIsMaximized(newMaximizedState);
    }, [isMaximized, viewerWidgetInstanceId]);

    // Handle escape key to exit maximize mode
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && isMaximized) {
                setIsMaximized(false);
            }
        };

        if (isMaximized) {
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
        }
    }, [isMaximized]);

    // Toggle annotation expansion
    const toggleAnnotationExpansion = useCallback((annotationId) => {
        setExpandedAnnotations(prev => {
            const newSet = new Set(prev);
            if (newSet.has(annotationId)) {
                newSet.delete(annotationId);
            } else {
                newSet.add(annotationId);
            }
            return newSet;
        });
    }, []);

    const shouldTruncateText = useCallback((annotation) => {
        const textLength = annotation.comment ? annotation.comment.length : 0;
        return textLength > 100;
    }, []);

    const getTruncatedText = useCallback((annotation, isExpanded) => {
        if (!annotation.comment) return '';
        if (isExpanded || annotation.comment.length <= 100) {
            return annotation.comment;
        }
        return annotation.comment.substring(0, 100) + '...';
    }, []);
    
    useEffect(() => {
        const handleRichTextInput = () => {
            if (richTextRef.current) {
                const content = richTextRef.current.innerText || '';
                setRichTextContent(content);
            }
        };
        
        if (richTextRef.current) {
            richTextRef.current.addEventListener('input', handleRichTextInput);
            richTextRef.current.addEventListener('keyup', handleRichTextInput);
            richTextRef.current.addEventListener('paste', handleRichTextInput);
        
        return () => {
                if (richTextRef.current) {
                    richTextRef.current.removeEventListener('input', handleRichTextInput);
                    richTextRef.current.removeEventListener('keyup', handleRichTextInput);
                    richTextRef.current.removeEventListener('paste', handleRichTextInput);
                }
        };
        }
    }, [showCommentModal]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
        if (!showRefDocDropdown) return;

            const widgetContainer = containerRef.current;
            const dropdown = refDocDropdownRef.current;
            
            if (!dropdown || !widgetContainer) return;
            
            const isClickInWidget = widgetContainer.contains(event.target);
            const isClickInDropdown = dropdown.contains(event.target);
            
            if (isClickInWidget && !isClickInDropdown) {
                setShowRefDocDropdown(false);
            }
            else if (!isClickInWidget) {
                setShowRefDocDropdown(false);
            }
        };

        if (showRefDocDropdown) {
        document.addEventListener('mousedown', handleClickOutside, true);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside, true);
        };
        }
    }, [showRefDocDropdown]);

    // Parse reference documents
    const [referenceDocList, setReferenceDocList] = useState([]);
    
    useEffect(() => {
        try {
            let docData = null;
            if (referenceDocuments && referenceDocuments.value !== undefined) {
                docData = referenceDocuments.value;
            } else if (typeof referenceDocuments === 'string') {
                docData = referenceDocuments;
            } else if (Array.isArray(referenceDocuments)) {
                const mappedDocs = referenceDocuments.map(doc => ({
                    id: String(doc.FileID || doc.id),
                    name: doc.Name || doc.name,
                    link: doc.Link || doc.link
                }));
                setReferenceDocList(mappedDocs);
                return;
            }
            
            if (docData && typeof docData === 'string' && docData.trim() !== '' && docData !== '[]') {
                try {
                    const parsed = JSON.parse(docData);
                    const mappedDocs = Array.isArray(parsed) ? parsed.map(doc => ({
                        id: String(doc.FileID || doc.id),
                        name: doc.Name || doc.name,
                        link: doc.Link || doc.link
                    })) : [];
                    setReferenceDocList(mappedDocs);
                } catch (parseError) {
                    console.warn('Failed to parse reference documents JSON:', parseError);
                    setReferenceDocList([]);
                }
            } else {
                setReferenceDocList([]);
            }
        } catch (error) {
            console.error('Error loading reference documents:', error);
            setReferenceDocList([]);
        }
    }, [referenceDocuments]);

    // Filtered reference documents based on search term
    const filteredReferenceDocList = useCallback(() => {
        if (!referenceSearchTerm.trim()) {
            return referenceDocList;
        }
        return referenceDocList.filter(doc => 
            doc.name.toLowerCase().includes(referenceSearchTerm.toLowerCase())
        );
    }, [referenceDocList, referenceSearchTerm]);

    // Reference document search functions
    const handleReferenceSearchChange = useCallback((event) => {
        const value = event.target.value;
        setReferenceSearchTerm(value);
        setShowRefDocDropdown(true);
    }, []);

    const handleReferenceSearchFocus = useCallback(() => {
        setShowRefDocDropdown(true);
    }, []);

    // Handle reference document selection
    const handleSelectReferenceDoc = useCallback((doc) => {
        setSelectedReferenceDoc(doc.id);
        setSelectedRefDocName(doc.name);
        setReferenceSearchTerm(doc.name);
        setShowRefDocDropdown(false);
    }, []);

    // Clear reference selection
    const clearReferenceSelection = useCallback(() => {
        setSelectedReferenceDoc('');
        setSelectedRefDocName('');
        setReferenceSearchTerm('');
        setShowRefDocDropdown(false);
    }, []);

    // Check if current user can edit/delete an annotation
    const canEditAnnotation = useCallback((annotation) => {
        return annotation.createdBy === currentUser;
    }, [currentUser]);

    // PDF loading strategies
    const createPDFSource = useCallback((url, method) => {
        switch (method) {
            case 'direct':
                return Promise.resolve(url);
                
            case 'fetch':
                return fetch(url, {
                    method: 'GET',
                    mode: 'cors',
                    cache: 'no-cache',
                    headers: {
                        'Accept': 'application/pdf,*/*',
                        'Content-Type': 'application/pdf'
                    }
                })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    return response.blob();
                })
                .then(blob => {
                    const pdfBlob = new Blob([blob], { type: 'application/pdf' });
                    const objectUrl = URL.createObjectURL(pdfBlob);
                    return objectUrl;
                });
                
            case 'arraybuffer':
                return fetch(url, {
                    method: 'GET',
                    mode: 'cors',
                    cache: 'no-cache'
                })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    return response.arrayBuffer();
                })
                .then(buffer => {
                    return { data: buffer };
                });
                
            default:
                return Promise.resolve(url);
        }
    }, []);

    // Document options
    const documentOptions = useMemo(() => ({
        workerSrc: pdfjs.GlobalWorkerOptions.workerSrc,
        cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
        verbosity: 1,
        httpHeaders: {
            'Accept': 'application/pdf,*/*',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        },
        withCredentials: false,
        timeout: 120000,
        disableAutoFetch: false,
        disableStream: false,
        disableRange: false,
        useSystemFonts: true,
        fontExtraProperties: true,
        stopAtErrors: false,
        isEvalSupported: false,
        password: null,
        disableCreateObjectURL: false,
        maxImageSize: 1024 * 1024 * 50,
        enableXfa: false,
        enableWebGL: false,
        isOffscreenCanvasSupported: false,
        pdfBug: false
    }), []);


    const handlePageRenderSuccess = useCallback(() => {
    setIsCanvasReady(true);
    addDebugLog("Canvas rendered successfully");
    }, [addDebugLog]);

    // Create PDF source based on current method
    useEffect(() => {
        if (!pdfUrl) {
            setProcessedPdfSource(null);
            return;
        }

        setIsPreparingSource(true);

        const preparePDFSource = async () => {
            try {
                const source = await createPDFSource(pdfUrl, loadMethod);
                setProcessedPdfSource(source);
                setIsPreparingSource(false);
            } catch (error) {
                console.error('Error preparing PDF source:', error);
                setProcessedPdfSource(pdfUrl);
                setIsPreparingSource(false);
            }
        };

        preparePDFSource();
    }, [pdfUrl, loadMethod, createPDFSource]);

    // Handle successful PDF load
    const handleDocumentLoadSuccess = useCallback(({ numPages }) => {
        console.log(`✅ [Viewer ${viewerWidgetInstanceId}] PDF loaded successfully with`, numPages, 'pages');
        setNumPages(numPages);
        setIsLoading(false);
        setError(null);
    }, [viewerWidgetInstanceId]);

    // Enhanced error handler with method fallback
    const handleDocumentLoadError = useCallback((error) => {
        console.error(`❌ [Viewer ${viewerWidgetInstanceId}] PDF loading error:`, error);
        
        const loadMethods = ['direct', 'fetch', 'arraybuffer'];
        const currentMethodIndex = loadMethods.indexOf(loadMethod);
        
        if (currentMethodIndex < loadMethods.length - 1) {
            const nextMethod = loadMethods[currentMethodIndex + 1];
            
            console.log(`🔄 [Viewer ${viewerWidgetInstanceId}] Trying fallback method:`, nextMethod);
            setLoadMethod(nextMethod);
            setError(null);
            setIsLoading(true);
            setProcessedPdfSource(null);
            setIsPreparingSource(false);
            
            return;
        }
        
        let userFriendlyError = 'Failed to load PDF with all methods';
        let troubleshootingTips = [];
        
        if (error.message) {
            const errorMsg = error.message.toLowerCase();
            
            if (errorMsg.includes('load failed') || errorMsg.includes('network')) {
                userFriendlyError = 'Network or CORS error loading PDF';
                troubleshootingTips = [
                    'The PDF server may not allow cross-origin requests',
                    'Try uploading the PDF to your Mendix app instead of using external URLs',
                    'Check if your network/firewall is blocking the PDF URL',
                    'Contact your system administrator about CORS policies'
                ];
            } else if (errorMsg.includes('format') || errorMsg.includes('invalid')) {
                userFriendlyError = 'Invalid or corrupted PDF file';
                troubleshootingTips = [
                    'Verify the file is a valid PDF document',
                    'Try opening the PDF URL directly in your browser',
                    'Check if the PDF requires a password',
                    'Try with a different PDF file to test the widget'
                ];
            }
        }
        
        setError({
            message: userFriendlyError,
            technical: error.message || 'Unknown error',
            tips: troubleshootingTips,
            methodsAttempted: currentMethodIndex + 1,
            totalMethods: loadMethods.length,
            widgetInstanceId: viewerWidgetInstanceId
        });
        setIsLoading(false);
    }, [loadMethod, viewerWidgetInstanceId]);

    // Handle page changes
    const goToPage = useCallback((pageNumber) => {
        if (pageNumber >= 1 && pageNumber <= numPages) {
            setCurrentPage(pageNumber);
        }
    }, [numPages]);

    const zoomIn = useCallback(() => {
        setIsCanvasReady(false)
        setScale(prev => Math.min(prev + 0.2, 3.0));
    }, []);

    const zoomOut = useCallback(() => {
        setIsCanvasReady(false)
        setScale(prev => Math.max(prev - 0.2, 0.5));
    }, []);

    // Area selection handlers
    const handleMouseDown = useCallback((event) => {
        if (!annotationMode || !canAddAnnotations) return;
        
        event.preventDefault();
        
        const widgetContainer = containerRef.current;
        const pdfPage = widgetContainer ? widgetContainer.querySelector('.react-pdf__Page') : null;
        
        if (!pdfPage) {
            console.error(`[Viewer ${viewerWidgetInstanceId}] PDF Page not found for area selection`);
            return;
        }
        
        const rect = pdfPage.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;

        setIsDrawing(true);
        setStartPoint({ x, y });
        setCurrentRect({ x, y, width: 0, height: 0 });
    }, [annotationMode, canAddAnnotations, viewerWidgetInstanceId]);

    const handleMouseMove = useCallback((event) => {
        if (!isDrawing || !startPoint || !annotationMode) return;

        event.preventDefault();
        
        const widgetContainer = containerRef.current;
        const pdfPage = widgetContainer ? widgetContainer.querySelector('.react-pdf__Page') : null;
        
        if (!pdfPage) return;
        
        const rect = pdfPage.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;

        const width = Math.abs(x - startPoint.x);
        const height = Math.abs(y - startPoint.y);
        const left = Math.min(x, startPoint.x);
        const top = Math.min(y, startPoint.y);

        setCurrentRect({ x: left, y: top, width, height });
    }, [isDrawing, startPoint, annotationMode]);

    const handleMouseUp = useCallback((event) => {
        if (!isDrawing || !currentRect || !annotationMode) return;

        event.preventDefault();
        setIsDrawing(false);

        if (currentRect.width > 1 && currentRect.height > 1) {
            setSelectedArea({
                x: currentRect.x,
                y: currentRect.y,
                width: currentRect.width,
                height: currentRect.height,
                page: currentPage,
                method: 'page-relative-fixed',
                createdAtZoom: scale
            });
            setShowCommentModal(true);
        }

        setCurrentRect(null);
        setStartPoint(null);
    }, [isDrawing, currentRect, annotationMode, currentPage, scale]);

    // Rich text functions
    const applyRichTextFormat = useCallback((command, value = null) => {
        document.execCommand(command, false, value);
        if (richTextRef.current) {
            richTextRef.current.focus();
        }
    }, []);

    // File upload handler
    const handleFileUpload = useCallback(async (event) => {
        event.preventDefault();
        event.stopPropagation();
        
        const files = Array.from(event.target.files);
        if (files.length === 0) return;
        
        const expectedInputId = `pdf-file-upload-input-${viewerWidgetInstanceId}`;
        if (event.target.id !== expectedInputId) {
            return;
        }
        
        setIsUploading(true);
        
        try {
            const uploadedFileData = [];
            
            for (const file of files) {
                try {
                    const processedFile = await uploadFileLocally(file);
                    processedFile.widgetInstanceId = viewerWidgetInstanceId;
                    uploadedFileData.push(processedFile);
                } catch (fileError) {
                    console.error(`Failed to process ${file.name}:`, fileError);
                }
            }
            
            if (uploadedFileData.length > 0) {
                setUploadedFiles(prev => [...prev, ...uploadedFileData]);
            }
        } catch (error) {
            console.error('Error processing files:', error);
        } finally {
            setIsUploading(false);
            if (event.target) {
                event.target.value = '';
            }
        }
    }, [viewerWidgetInstanceId]);

    // File input trigger
    const triggerFileInput = useCallback(() => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    }, []);

    // Upload file locally
    const uploadFileLocally = useCallback(async (file) => {
        try {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const base64Data = reader.result.split(',')[1];
                        const uniqueFileId = `${viewerWidgetInstanceId}-${Date.now()}-${Math.random().toString(36).substr(2, 12)}`;
                        resolve({
                            id: uniqueFileId,
                            name: file.name,
                            size: file.size,
                            type: file.type,
                            data: base64Data,
                            storageType: 'local',
                            uploadedAt: new Date().toISOString(),
                            widgetInstanceId: viewerWidgetInstanceId
                        });
                    } catch (error) {
                        reject(error);
                    }
                };
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(file);
            });
        } catch (error) {
            throw new Error(`Failed to process file: ${file.name}`);
        }
    }, [viewerWidgetInstanceId]);

    const removeFile = useCallback((fileId) => {
        setUploadedFiles(prev => prev.filter(file => file.id !== fileId));
    }, []);

    // File preview functions
    const handlePreviewFile = useCallback(async (file) => {
        setLoadingPreview(true);
        setPreviewFile(file);
        setShowFilePreview(true);
        
        try {
            if (file.data) {
                const binaryString = atob(file.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                const blob = new Blob([bytes], { type: file.type });
                const blobUrl = URL.createObjectURL(blob);
                
                setPreviewFile(prev => ({
                    ...prev,
                    blobUrl: blobUrl
                }));
            }
        } catch (error) {
            console.error('Error loading file for preview:', error);
        } finally {
            setLoadingPreview(false);
        }
    }, []);

    const handleCloseFilePreview = useCallback(() => {
        if (previewFile && previewFile.blobUrl) {
            URL.revokeObjectURL(previewFile.blobUrl);
        }
        setPreviewFile(null);
        setShowFilePreview(false);
    }, [previewFile]);

    // Handle reference document download
    const handleReferenceDocDownload = useCallback((docId) => {
        const doc = referenceDocList.find(d => String(d.id) === String(docId));
        
        if (doc && doc.link) {
            try {
                const link = document.createElement('a');
                link.href = doc.link;
                link.download = doc.name || 'document';
                link.style.display = 'none';
                
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } catch (error) {
                console.error('Error with download link:', error);
                window.location.href = doc.link;
            }
        } else {
            alert('Reference document not found or no download link available.');
        }
    }, [referenceDocList]);

    const formatFileSize = useCallback((bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }, []);

    // Add annotation (uses onAnnotationsChange - triggers ADD microflow)
    const handleAddAnnotation = useCallback(() => {
        if (!canAddAnnotations) return;

        const richTextHtml = richTextRef.current?.innerHTML || '';
        const plainText = richTextRef.current?.innerText || commentText;

        if (plainText.trim()) {
            const newAnnotation = {
                id: Date.now(),
                comment: plainText.trim(),
                richTextContent: richTextHtml,
                area: selectedArea,
                timestamp: new Date().toISOString(),
                type: 'area-annotation',
                page: selectedArea?.page || currentPage,
                createdBy: currentUser,
                referenceDoc: selectedReferenceDoc,
                uploadedFiles: uploadedFiles,
                createdInMaximizedView: isMaximized,
                positioningVersion: 'v2-page-relative-area-only'
            };

            console.log(`➕ [Viewer ${viewerWidgetInstanceId}] Adding annotation - will trigger ADD microflow`);

            const updatedAnnotations = [...annotations, newAnnotation];
            onAnnotationsChange(updatedAnnotations); // This triggers ADD microflow

            // Clear form and close modal
            setShowCommentModal(false);
            setCommentText("");
            setSelectedReferenceDoc("");
            setSelectedRefDocName("");
            setReferenceSearchTerm("");
            setUploadedFiles([]);
            setSelectedArea(null);
            setAnnotationMode(false);
            setRichTextContent('');
            if (richTextRef.current) {
                richTextRef.current.innerHTML = '';
            }
        }
    }, [commentText, selectedReferenceDoc, uploadedFiles, selectedArea, annotations, onAnnotationsChange, currentPage, currentUser, canAddAnnotations, isMaximized, viewerWidgetInstanceId]);

    // FIXED: Delete annotation - EXACTLY LIKE IMAGE ANNOTATOR (triggers ONLY DELETE microflow)
    const handleDeleteAnnotation = useCallback((id) => {
        if (!canAddAnnotations || !allowDelete) return;
        
        const annotation = annotations.find(ann => ann.id === id);
        if (!annotation || !canEditAnnotation(annotation)) {
            alert('You can only delete your own annotations.');
            return;
        }
        
        if (window.confirm('Are you sure you want to delete this annotation?')) {
            addDebugLog("=== DELETING PDF ANNOTATION ===");
            addDebugLog(`Deleting annotation ID: ${id}`);
            
            const updatedAnnotations = annotations.filter(ann => ann.id !== id);
            
            console.log(`🗑️ [Viewer ${viewerWidgetInstanceId}] Deleting annotation - will trigger ONLY DELETE microflow`);
            
            // Call the parent's delete handler which will:
            // 1. Update the state
            // 2. Save to attribute directly
            // 3. Execute ONLY the delete microflow
            onAnnotationDelete(updatedAnnotations);
            
            addDebugLog("✅ Annotation deleted successfully");
            addDebugLog("=== END DELETING PDF ANNOTATION ===");
        }
    }, [annotations, onAnnotationDelete, canAddAnnotations, allowDelete, canEditAnnotation, addDebugLog, viewerWidgetInstanceId]);

    // Edit annotation
    const handleEditAnnotation = useCallback((annotation) => {
        if (!canAddAnnotations || !canEditAnnotation(annotation)) return;
        
        setEditingAnnotation(annotation);
        setCommentText(annotation.comment);
        setSelectedReferenceDoc(annotation.referenceDoc || '');
        setUploadedFiles(annotation.uploadedFiles || []);
        setRichTextContent(annotation.comment);
        
        if (annotation.referenceDoc) {
            const refDoc = referenceDocList.find(doc => String(doc.id) === String(annotation.referenceDoc));
            if (refDoc) {
                setSelectedRefDocName(refDoc.name);
                setReferenceSearchTerm(refDoc.name);
            }
        } else {
            setSelectedRefDocName('');
            setReferenceSearchTerm('');
        }
        
        setTimeout(() => {
            if (richTextRef.current) {
                richTextRef.current.innerHTML = annotation.richTextContent || annotation.comment;
                const event = new Event('input', { bubbles: true });
                richTextRef.current.dispatchEvent(event);
            }
        }, 100);
        
        setShowCommentModal(true);
    }, [canAddAnnotations, canEditAnnotation, referenceDocList]);

    // Save edited annotation (uses onAnnotationsChange - triggers ADD microflow)
    const handleSaveEdit = useCallback(() => {
        if (!editingAnnotation || !canAddAnnotations) return;

        const richTextHtml = richTextRef.current?.innerHTML || '';
        const plainText = richTextRef.current?.innerText || commentText;

        if (plainText.trim()) {
            const updatedAnnotations = annotations.map(ann => 
                ann.id === editingAnnotation.id 
                    ? { 
                        ...ann, 
                        comment: plainText.trim(), 
                        richTextContent: richTextHtml,
                        referenceDoc: selectedReferenceDoc,
                        uploadedFiles: uploadedFiles,
                        editedAt: new Date().toISOString()
                    }
                    : ann
            );
            onAnnotationsChange(updatedAnnotations); // This triggers ADD microflow (for edit)

            setEditingAnnotation(null);
            setCommentText("");
            setSelectedReferenceDoc("");
            setSelectedRefDocName("");
            setReferenceSearchTerm("");
            setUploadedFiles([]);
            setRichTextContent('');
            if (richTextRef.current) {
                richTextRef.current.innerHTML = '';
            }
            setShowCommentModal(false);
        }
    }, [editingAnnotation, commentText, selectedReferenceDoc, uploadedFiles, annotations, onAnnotationsChange, canAddAnnotations]);

    // Close modal
    const handleCloseModal = useCallback(() => {
        setShowCommentModal(false);
        setCommentText("");
        setSelectedReferenceDoc("");
        setSelectedRefDocName("");
        setReferenceSearchTerm("");
        setUploadedFiles([]);
        setSelectedArea(null);
        setEditingAnnotation(null);
        setAnnotationMode(false);
        setRichTextContent('');
        if (richTextRef.current) {
            richTextRef.current.innerHTML = '';
        }
    }, []);

    // Navigate to annotation
    const handleNavigateToAnnotation = useCallback((annotation) => {
        if (annotation.page && annotation.page !== currentPage) {
            goToPage(annotation.page);
        }
        
        setTimeout(() => {
            const widgetContainer = containerRef.current;
            const marker = widgetContainer ? widgetContainer.querySelector(`[data-annotation-id="${annotation.id}"]`) : null;
            if (marker) {
                marker.style.animation = 'pulse 2s ease-in-out 3';
                marker.style.transform = isMaximized ? 'scale(1.15)' : 'scale(1.1)';
                setTimeout(() => {
                    marker.style.animation = '';
                    marker.style.transform = 'scale(1)';
                }, 6000);
            }
        }, 500);
    }, [currentPage, goToPage, isMaximized]);

    // Filter annotations for current page
    const currentPageAnnotations = annotations.filter(ann => 
            (!ann.page || ann.page === currentPage) && ann.type === 'area-annotation'
        );

    if (!pdfUrl) {
        return createElement('div', {
            className: 'pdf-annotator-container maxmize_dpf_popup_ht_adj custom_pdf_annotator_widget pdf-viewer-empty',
            'data-widget-instance': viewerWidgetInstanceId,
            ref: containerRef
        }, [
            createElement('div', {
                key: 'empty-content',
                className: 'pdf-empty-content'
            }, [
                createElement('div', {
                    key: 'empty-icon',
                    className: 'pdf-empty-icon'
                }, '📄'),
                createElement('h3', {
                    key: 'empty-title',
                    className: 'pdf-empty-title'
                }, 'PDF Annotator Ready'),
                createElement('p', {
                    key: 'empty-message',
                    className: 'pdf-empty-message'
                }, 'Waiting for PDF URL from Mendix...'),
                currentUser && createElement('p', {
                    key: 'empty-user',
                    className: 'pdf-empty-user'
                }, `👤 Current user: ${currentUser}`),
                createElement('p', {
                    key: 'empty-editability',
                    className: 'pdf-empty-editability'
                }, `🔑 Area Annotations: ${canAddAnnotations ? 'Enabled' : 'Disabled'}`)
            ])
        ]);
    }

    return createElement('div', {
        className: `pdf-annotator-container maxmize_dpf_popup_ht_adj custom_pdf_annotator_widget ${isMaximized ? 'pdf-maximized' : ''}`,
        'data-widget-instance': viewerWidgetInstanceId,
        ref: containerRef,
        style: {
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none'
        }
    }, [
        // Toolbar
        createElement('div', {
            key: 'toolbar',
            className: 'pdf-toolbar'
        }, [
            createElement('div', {
                key: 'toolbar-left',
                className: 'pdf-toolbar-left'
            }, [
                createElement('button', {
                    key: 'maximize-btn',
                    onClick: handleMaximizeToggle,
                    className: `pdf-button pdf-maximize-minimize-btn ${isMaximized ? 'pdf-minimize-btn' : 'pdf-maximize-btn'}`,
                    title: isMaximized ? 'Minimize (Press Esc)' : 'Maximize'
                }, isMaximized ? 'Minimize' : 'Maximize')
            ]),
            
            createElement('div', {
                key: 'toolbar-right',
                className: 'pdf-toolbar-right'
            }, [
                // Page Navigation
                createElement('div', {
                    key: 'page-nav',
                    className: 'pdf-page-navigation'
                }, [
                    createElement('button', {
                        key: 'prev-btn',
                        onClick: () => goToPage(currentPage - 1),
                        disabled: currentPage <= 1,
                        className: `pdf-button pdf-page-prev-btn ${currentPage <= 1 ? 'disabled' : ''}`
                    }, '◀'),
                    createElement('span', {
                        key: 'page-info',
                        className: 'pdf-page-info'
                    }, `${currentPage} / ${numPages || 0}`),
                    createElement('button', {
                        key: 'next-btn',
                        onClick: () => goToPage(currentPage + 1),
                        disabled: currentPage >= numPages,
                        className: `pdf-button pdf-page-next-btn ${currentPage >= numPages ? 'disabled' : ''}`
                    }, '▶')
                ]),

                // Zoom Controls
                createElement('div', {
                    key: 'zoom-controls',
                    className: 'pdf-zoom-controls'
                }, [
                    createElement('button', {
                        key: 'zoom-out',
                        onClick: zoomOut,
                        disabled: scale <= 0.5,
                        className: `pdf-button pdf-zoom-out-btn ${scale <= 0.5 ? 'disabled' : ''}`
                    }, '-'),
                    createElement('span', {
                        key: 'zoom-info',
                        className: 'pdf-zoom-info'
                    }, `${Math.round(scale * 100)}%`),
                    createElement('button', {
                        key: 'zoom-in',
                        onClick: zoomIn,
                        disabled: scale >= 3.0,
                        className: `pdf-button pdf-zoom-in-btn ${scale >= 3.0 ? 'disabled' : ''}`
                    }, '+')
                ]),

                // Add Annotation Button
                canAddAnnotations && createElement('button', {
                    key: 'annotation-btn',
                    onClick: () => {
                        const newMode = !annotationMode;
                        setAnnotationMode(newMode);
                    },
                    className: `pdf-button pdf-add-annotation-btn ${annotationMode ? 'pdf-button-danger' : 'pdf-button-success'}`
                }, annotationMode ? 'Exit Area Selection' : '+ Add Area Annotation'),
                
                createElement('button', {
                    key: 'sidebar-btn',
                    onClick: () => setShowSidebar(!showSidebar),
                    className: 'pdf-button pdf-sidebar-toggle-btn'
                }, `Annotations (${annotations.length})`)
            ])
        ]),

        // Main Content
        createElement('div', {
            key: 'main-content',
            className: 'pdf-main-content'
        }, [
            // PDF Viewer Container
            createElement('div', {
                key: 'viewer-area',
                className: `pdf-viewer-area ${showSidebar ? 'with-sidebar' : 'full-width'}`,
                style: {
                    position: 'relative'
                }
            }, [
                // Loading indicator
                (isLoading || isPreparingSource || !isCanvasReady) && createElement('div', {
                    key: 'loading-overlay',
                    className: 'pdf-loading-overlay'
                }, [
                    createElement('div', {
                        key: 'loading-spinner',
                        className: 'pdf-loading-spinner'
                    }),
                    createElement('div', {
                        key: 'loading-text',
                        className: 'pdf-loading-text'
                    }, [
                        createElement('div', {
                            key: 'loading-message',
                            className: 'pdf-loading-message'
                        }, isPreparingSource ? `Preparing PDF (${loadMethod})...` : 
                        !isCanvasReady ? 'Loading high-resolution PDF may take sometime...' : 
                        'Loading PDF...'),
                        createElement('div', {
                            key: 'loading-details',
                            className: 'pdf-loading-details'
                        }, `Area selection mode • User: ${currentUser} • Fixed Microflows`)
                    ])
                ]),

                // Document and Page rendering
                processedPdfSource ? createElement('div', {
                    key: 'pdf-document-container',
                    className: 'pdf-document-container',
                    style: {
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                        overflow: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        padding: '5px',
                        boxSizing: 'border-box'
                    }
                }, [
                    createElement('div', {
                        key: 'pdf-page-wrapper',
                        ref: pdfPageRef,
                        className: 'pdf-page-wrapper',
                        style: {
                            position: 'relative',
                            display: 'inline-block',
                            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
                            backgroundColor: '#fff',
                            minWidth: 'max-content',
                            minHeight: 'max-content',
                            margin: '0',
                            boxSizing: 'border-box'
                        }
                    }, [
                        createElement(Document, {
                            key: 'pdf-document',
                            file: processedPdfSource,
                            onLoadSuccess: handleDocumentLoadSuccess,
                            onLoadError: handleDocumentLoadError,
                            options: documentOptions,
                            loading: createElement('div', {
                                className: 'pdf-document-loading'
                            }, [
                                createElement('div', {
                                    key: 'doc-loading-text',
                                    className: 'pdf-document-loading-text'
                                }, 'Loading PDF...'),
                                createElement('div', {
                                    key: 'doc-loading-details',
                                    className: 'pdf-document-loading-details'
                                }, 'Area selection ready • Fixed Microflows')
                            ])
                        }, [
                            createElement(Page, {
                                key: 'pdf-page',
                                pageNumber: currentPage,
                                scale: scale,
                                onRenderSuccess: handlePageRenderSuccess,
                                loading: createElement('div', {
                                    className: 'pdf-page-loading'
                                }, [
                                    createElement('div', {
                                        key: 'page-loading-text',
                                        className: 'pdf-page-loading-text'
                                    }, `Loading page ${currentPage}...`)
                                ])
                            })
                        ]),

                        // Area selection overlay
                        createElement('div', {
                            key: 'selection-overlay',
                            ref: overlayRef,
                            className: `pdf-selection-overlay ${annotationMode ? 'active' : ''}`,
                            onMouseDown: handleMouseDown,
                            onMouseMove: handleMouseMove,
                            onMouseUp: handleMouseUp,
                            title: annotationMode ? "Click and drag to select area" : "PDF Viewer",
                            style: {
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                zIndex: annotationMode ? 15 : -1,
                                cursor: annotationMode ? 'crosshair' : 'default',
                                pointerEvents: annotationMode ? 'auto' : 'none'
                            }
                        }, [
                            // Current drawing rectangle
                            currentRect && annotationMode && createElement('div', {
                                key: 'current-rect',
                                className: 'pdf-selection-rect current',
                                style: {
                                    position: 'absolute',
                                    left: `${currentRect.x}%`,
                                    top: `${currentRect.y}%`,
                                    width: `${currentRect.width}%`,
                                    height: `${currentRect.height}%`,
                                    backgroundColor: 'rgba(0, 123, 255, 0.25)',
                                    border: '2px solid #007bff',
                                    borderRadius: '3px',
                                    pointerEvents: 'none'
                                }
                            })
                        ]),

                        // Area annotations overlay
                        createElement('div', {
                            key: 'annotations-overlay',
                            className: `pdf-annotations-overlay ${isMaximized ? 'maximized-view' : 'normal-view'}`,
                            style: {
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                pointerEvents: 'none',
                                zIndex: 20
                            }
                        }, [
                            // Area annotation rectangles
                            ...currentPageAnnotations.map((annotation) => {
                                if (!annotation.area) return null;
                                
                                return createElement('div', {
                                    key: `area-${annotation.id}`,
                                    'data-annotation-id': annotation.id,
                                    className: `pdf-annotation-area ${isMaximized ? 'maximized' : 'normal'}`,
                                    style: {
                                        position: 'absolute',
                                        left: `${annotation.area.x}%`,
                                        top: `${annotation.area.y}%`,
                                        width: `${annotation.area.width}%`,
                                        height: `${annotation.area.height}%`,
                                        backgroundColor: 'rgba(0, 123, 255, 0.25)',
                                        border: isMaximized ? '3px solid #007bff' : '2px solid #007bff',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        pointerEvents: 'auto'
                                    },
                                    onClick: () => handleNavigateToAnnotation(annotation),
                                    title: `Area annotation by ${annotation.createdBy}: ${annotation.comment}`
                                });
                            })
                        ])
                    ]),

                    // Instruction message overlay
                    !annotationMode && canAddAnnotations && createElement('div', {
                        key: 'instruction-overlay',
                        className: 'pdf-instruction-overlay',
                        style: {
                            position: 'absolute',
                            bottom: '15px',
                            left: '15px',
                            backgroundColor: 'rgba(0, 123, 255, 0.9)',
                            color: 'white',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: '500',
                            zIndex: 1000,
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                            pointerEvents: 'none',
                            maxWidth: '200px',
                            textAlign: 'center',
                            animation: 'fadeInOut 3s ease-in-out infinite'
                        }
                    }, '💡 Click "Add Area Annotation"')
                ]) : createElement('div', {
                    key: 'preparing-container',
                    className: 'pdf-preparing-container'
                }, [
                    createElement('div', {
                        key: 'preparing-content',
                        className: 'pdf-preparing-content'
                    }, [
                        createElement('div', {
                            key: 'preparing-icon',
                            className: 'pdf-preparing-icon'
                        }, '⏳'),
                        createElement('div', {
                            key: 'preparing-text',
                            className: 'pdf-preparing-text'
                        }, 'Preparing PDF source...'),
                        createElement('div', {
                            key: 'preparing-details',
                            className: 'pdf-preparing-details'
                        }, 'Area selection mode • Fixed Microflows')
                    ])
                ])
            ]),

            // Annotations sidebar
            showSidebar && createElement('div', {
                key: 'annotations-sidebar',
                className: 'pdf-annotations-sidebar'
            }, [
                createElement('div', {
                    key: 'sidebar-header',
                    className: 'pdf-sidebar-header'
                }, [
                    createElement('div', {
                        key: 'sidebar-title-section',
                        className: 'pdf-sidebar-title-section'
                    }, [
                        createElement('div', {
                            key: 'title-with-count',
                            className: 'pdf-sidebar-title-wrapper'
                        }, [
                            createElement('h4', {
                                key: 'sidebar-title',
                                className: 'pdf-sidebar-title pdf-annotations-heading'
                            }, '📝 Area Annotations'),
                            createElement('span', {
                                key: 'sidebar-count',
                                className: 'pdf-sidebar-count pdf-annotations-count'
                            }, `(${annotations.length})`)
                        ]),
                        createElement('div', {
                            key: 'sidebar-page-info',
                            className: 'pdf-sidebar-page-info'
                        }, `Page ${currentPage} / ${numPages}`)
                    ])
                ]),

                createElement('div', {
                    key: 'sidebar-content',
                    className: 'pdf-sidebar-content'
                }, annotations.length === 0 ? 
                    createElement('div', {
                        key: 'no-annotations',
                        className: 'pdf-no-annotations'
                    }, [
                        createElement('div', {
                            key: 'no-annotations-icon',
                            className: 'pdf-no-annotations-icon'
                        }, '📝'),
                        createElement('p', {
                            key: 'no-annotations-text',
                            className: 'pdf-no-annotations-text'
                        }, 'No area annotations yet.'),
                        createElement('p', {
                            key: 'no-annotations-hint',
                            className: 'pdf-no-annotations-hint'
                        }, canAddAnnotations ? 'Click "+ Add Area Annotation" to get started!' : 'Area annotations are disabled for this user.'),
                        createElement('div', {
                            key: 'no-annotations-user',
                            className: 'pdf-no-annotations-user'
                        }, `Current user: ${currentUser}`),
                        createElement('div', {
                            key: 'no-annotations-microflows',
                            className: 'pdf-no-annotations-microflows'
                        }, `🔧 Fixed Microflows: ${executeMendixAction ? 'Ready' : 'Not Available'}`)
                    ]) :
                    annotations.map((annotation, index) => {
                        const isActive = annotation.page === currentPage;
                        const canEdit = canEditAnnotation(annotation);
                        const isExpanded = expandedAnnotations.has(annotation.id);
                        const hasAttachments = (annotation.uploadedFiles && annotation.uploadedFiles.length > 0) || annotation.referenceDoc;
                        const shouldShowReadMore = shouldTruncateText(annotation) || hasAttachments;
                        
                        return createElement('div', {
                            key: annotation.id,
                            className: `pdf-annotation-item pdf-annotation-item-consistent ${isActive ? 'current-page' : 'other-page'}`,
                            onClick: () => handleNavigateToAnnotation(annotation)
                        }, [
                            // Annotation header
                            createElement('div', {
                                key: 'annotation-header',
                                className: 'pdf-annotation-header'
                            }, [
                                createElement('div', {
                                    key: 'annotation-title',
                                    className: 'pdf-annotation-title'
                                }, [
                                    createElement('span', {
                                        key: 'annotation-number',
                                        className: 'pdf-annotation-number'
                                    }, `#${index + 1} Page ${annotation.page || 1}`),
                                    
                                    isActive && createElement('span', {
                                        key: 'current-badge',
                                        className: 'pdf-current-badge'
                                    }, 'CURRENT')
                                ]),
                                
                                // Action buttons
                                (canAddAnnotations && canEdit) && createElement('div', {
                                    key: 'annotation-actions',
                                    className: 'pdf-annotation-actions'
                                }, [
                                    createElement('button', {
                                        key: 'edit-btn',
                                        onClick: (e) => {
                                            e.stopPropagation();
                                            handleEditAnnotation(annotation);
                                        },
                                        className: 'pdf-action-button edit pdf-annotation-edit-btn',
                                        title: 'Edit annotation'
                                    }, '✏️'),
                                    
                                    allowDelete && createElement('button', {
                                        key: 'delete-btn',
                                        onClick: (e) => {
                                            e.stopPropagation();
                                            handleDeleteAnnotation(annotation.id);
                                        },
                                        className: 'pdf-action-button delete pdf-annotation-delete-btn',
                                        title: 'Delete annotation'
                                    }, '🗑️')
                                ])
                            ]),
                            
                            // Comment content
                            createElement('div', {
                                key: 'annotation-content',
                                className: 'pdf-annotation-content pdf-annotation-content-consistent'
                            }, [
                                annotation.richTextContent ? 
                                    createElement('div', {
                                        key: 'rich-text',
                                        className: 'pdf-annotation-rich-content',
                                        dangerouslySetInnerHTML: { 
                                            __html: isExpanded ? annotation.richTextContent : getTruncatedText(annotation, isExpanded)
                                        }
                                    }) : 
                                    createElement('p', {
                                        key: 'plain-text',
                                        className: 'pdf-annotation-text'
                                    }, isExpanded ? annotation.comment : getTruncatedText(annotation, isExpanded))
                            ]),
                            
                            // Read more/less button
                            shouldShowReadMore && createElement('div', {
                                key: 'read-more-section',
                                className: 'pdf-read-more-section',
                                style: { marginTop: '8px' }
                            }, [
                                createElement('button', {
                                    key: 'read-more-btn',
                                    onClick: (e) => {
                                        e.stopPropagation();
                                        toggleAnnotationExpansion(annotation.id);
                                    },
                                    className: 'pdf-read-more-btn',
                                    style: {
                                        background: 'none',
                                        border: 'none',
                                        color: '#8B5A2B',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontWeight: '500',
                                        textDecoration: 'underline',
                                        padding: '4px 0'
                                    }
                                }, isExpanded ? 'Read Less' : 'Read More')
                            ]),
                            
                            // Expanded content
                            isExpanded && hasAttachments && [
                                // Uploaded files
                                annotation.uploadedFiles && annotation.uploadedFiles.length > 0 && 
                                createElement('div', {
                                    key: 'files',
                                    className: 'pdf-annotation-files',
                                    style: { marginTop: '8px' }
                                }, [
                                    createElement('div', {
                                        key: 'files-title',
                                        className: 'pdf-annotation-files-title'
                                    }, 'Files:'),
                                    ...annotation.uploadedFiles.map(file => 
                                        createElement('div', {
                                            key: file.id,
                                            className: 'pdf-annotation-file-item pdf-clickable-file',
                                            onClick: (e) => {
                                                e.stopPropagation();
                                                handlePreviewFile(file);
                                            },
                                            title: 'Click to preview file'
                                        }, `📎 ${file.name} (${formatFileSize(file.size)})`)
                                    )
                                ]),
                                
                                // Reference document
                                annotation.referenceDoc && createElement('div', {
                                    key: 'reference-doc',
                                    className: 'pdf-annotation-reference-doc',
                                    style: {
                                        marginTop: '8px',
                                        padding: '8px 12px',
                                        backgroundColor: '#f0f9ff',
                                        borderRadius: '6px',
                                        border: '1px solid #0ea5e9'
                                    }
                                }, [
                                    createElement('div', {
                                        key: 'ref-title',
                                        className: 'pdf-annotation-files-title',
                                        style: { color: '#0ea5e9', marginBottom: '4px' }
                                    }, 'Reference Document:'),
                                    createElement('div', {
                                        key: 'ref-content',
                                        className: 'pdf-clickable-file',
                                        style: { 
                                            fontSize: '12px', 
                                            color: '#0369a1',
                                            cursor: 'pointer',
                                            textDecoration: 'underline',
                                            padding: '4px 8px',
                                            backgroundColor: '#e0f2fe',
                                            borderRadius: '4px',
                                            border: '1px solid #0ea5e9',
                                            transition: 'all 0.2s ease'
                                        },
                                        onClick: (e) => {
                                            e.stopPropagation();
                                            handleReferenceDocDownload(annotation.referenceDoc);
                                        },
                                        onMouseEnter: (e) => {
                                            e.target.style.backgroundColor = '#bae6fd';
                                        },
                                        onMouseLeave: (e) => {
                                            e.target.style.backgroundColor = '#e0f2fe';
                                        },
                                        title: 'Click to download reference document'
                                    }, (() => {
                                        const refDoc = referenceDocList.find(doc => String(doc.id) === String(annotation.referenceDoc));
                                        return refDoc ? `📄 ${refDoc.name}` : `📄 Document ID: ${annotation.referenceDoc}`;
                                    })())
                                ])
                            ],
                            
                            // User and timestamp
                            createElement('div', {
                                key: 'annotation-footer',
                                className: 'pdf-annotation-footer'
                            }, [
                                createElement('span', {
                                    key: 'annotation-user',
                                    className: 'pdf-annotation-user',
                                    style: {
                                        color: canEdit ? '#10B981' : '#6B7280',
                                        fontWeight: canEdit ? '600' : '500'
                                    }
                                }, `By: ${annotation.createdBy || 'Unknown User'}${canEdit ? ' (You)' : ''}`),
                                createElement('span', {
                                    key: 'annotation-date',
                                    className: 'pdf-annotation-date'
                                }, `${new Date(annotation.timestamp).toLocaleDateString()} • ${new Date(annotation.timestamp).toLocaleTimeString()}`)
                            ])
                        ]);
                    })
                )
            ])
        ]),

        // Comment Modal (same as before - no changes needed)
        showCommentModal && createElement('div', {
            key: 'comment-modal-overlay',
            className: 'pdf-comment-modal-overlay',
            style: {
                zIndex: isMaximized ? 60000 : 10000
            },
            onClick: (e) => {
                if (e.target === e.currentTarget) {
                    handleCloseModal();
                }
            }
        }, [
            createElement('div', {
                key: 'comment-modal',
                className: 'pdf-comment-modal',
                ref: modalContainerRef
            }, [
                createElement('div', {
                    key: 'modal-header',
                    className: 'pdf-modal-header'
                }, [
                    createElement('h3', {
                        key: 'modal-title',
                        className: 'pdf-modal-title'
                    }, editingAnnotation ? 'Edit Area Annotation' : `Add Area Annotation - Page ${selectedArea?.page || currentPage}`)
                ]),

                createElement('div', {
                    key: 'modal-body',
                    className: 'pdf-modal-body'
                }, [
                    // Rich text editor
                    createElement('div', {
                        key: 'richtext-section',
                        className: 'pdf-form-group'
                    }, [
                        createElement('label', {
                            key: 'richtext-label',
                            className: 'pdf-form-label'
                        }, 'Comment:'),
                        
                        createElement('div', {
                            key: 'richtext-toolbar',
                            className: 'pdf-richtext-toolbar'
                        }, [
                            createElement('button', {
                                key: 'bold-btn',
                                className: 'pdf-richtext-btn',
                                type: 'button',
                                onClick: () => applyRichTextFormat('bold')
                            }, 'B'),
                            createElement('button', {
                                key: 'italic-btn',
                                className: 'pdf-richtext-btn',
                                type: 'button',
                                onClick: () => applyRichTextFormat('italic')
                            }, 'I'),
                            createElement('button', {
                                key: 'underline-btn',
                                className: 'pdf-richtext-btn',
                                type: 'button',
                                onClick: () => applyRichTextFormat('underline')
                            }, 'U'),
                            createElement('button', {
                                key: 'list-btn',
                                className: 'pdf-richtext-btn',
                                type: 'button',
                                onClick: () => applyRichTextFormat('insertUnorderedList')
                            }, '•')
                        ]),
                        
                        createElement('div', {
                            key: 'richtext-editor',
                            ref: richTextRef,
                            className: 'pdf-richtext-editor',
                            contentEditable: true,
                            'data-placeholder': 'Enter your comment with formatting...',
                            onInput: () => {
                                if (richTextRef.current) {
                                    const content = richTextRef.current.innerText || '';
                                    setRichTextContent(content);
                                }
                            },
                            onKeyUp: () => {
                                if (richTextRef.current) {
                                    const content = richTextRef.current.innerText || '';
                                    setRichTextContent(content);
                                }
                            },
                            onPaste: () => {
                                setTimeout(() => {
                                    if (richTextRef.current) {
                                        const content = richTextRef.current.innerText || '';
                                        setRichTextContent(content);
                                    }
                                }, 0);
                            }
                        })
                    ]),
                    
                    // File upload section
                    createElement('div', {
                        key: 'file-section',
                        className: 'pdf-form-group'
                    }, [
                        createElement('label', {
                            key: 'file-label',
                            className: 'pdf-form-label'
                        }, 'Attach Files (Local Storage):'),
                        
                        createElement('div', {
                            key: 'file-upload-area',
                            className: 'pdf-file-upload-area'
                        }, [
                            createElement('input', {
                                key: `file-input-${viewerWidgetInstanceId}`,
                                ref: fileInputRef,
                                type: 'file',
                                id: `pdf-file-upload-input-${viewerWidgetInstanceId}`,
                                className: 'pdf-file-input',
                                'data-widget-id': viewerWidgetInstanceId,
                                multiple: true,
                                accept: '*/*',
                                onChange: handleFileUpload,
                                style: { display: 'none' },
                                onClick: (e) => {
                                    e.stopPropagation();
                                }
                            }),
                            
                            createElement('button', {
                                key: 'file-upload-trigger',
                                type: 'button',
                                onClick: (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    triggerFileInput();
                                },
                                className: 'pdf-file-upload-btn pdf-modal-file-upload-btn',
                                disabled: isUploading,
                                'data-widget-id': viewerWidgetInstanceId,
                                style: { 
                                    cursor: isUploading ? 'not-allowed' : 'pointer',
                                    opacity: isUploading ? 0.6 : 1
                                }
                            }, isUploading ? 'Processing...' : 'Choose Files')
                        ]),
                        
                        uploadedFiles.length > 0 && createElement('div', {
                            key: 'uploaded-files',
                            className: 'pdf-uploaded-files'
                        }, uploadedFiles.map(file => 
                            createElement('div', {
                                key: file.id,
                                className: 'pdf-uploaded-file'
                            }, [
                                createElement('span', {
                                    key: 'file-name',
                                    className: 'pdf-file-name'
                                }, file.name),
                                createElement('span', {
                                    key: 'file-size',
                                    className: 'pdf-file-size'
                                }, formatFileSize(file.size)),
                                createElement('button', {
                                    key: 'remove-btn',
                                    className: 'pdf-file-remove-btn pdf-uploaded-file-remove-btn',
                                    onClick: () => removeFile(file.id)
                                }, '×')
                            ])
                        ))
                    ]),
                    
                    // Reference Documents dropdown
                    referenceDocList.length > 0 && createElement('div', {
                        key: 'reference-section',
                        className: 'pdf-form-group'
                    }, [
                        createElement('label', {
                            key: 'reference-label',
                            className: 'pdf-form-label'
                        }, 'Tag Reference Document:'),
                        
                        createElement('div', {
                            key: 'reference-search-container',
                            ref: refDocDropdownRef,
                            className: 'reference-search-container',
                            style: { position: 'relative' }
                        }, [
                            createElement('div', {
                                key: 'search-input-wrapper',
                                className: 'reference-search-input-wrapper',
                                style: {
                                    position: 'relative',
                                    display: 'flex',
                                    alignItems: 'center'
                                }
                            }, [
                                createElement('input', {
                                    key: 'reference-search-input',
                                    ref: searchInputRef,
                                    type: 'text',
                                    className: 'reference-search-input',
                                    placeholder: 'Search and select a reference document...',
                                    value: referenceSearchTerm,
                                    onChange: handleReferenceSearchChange,
                                    onFocus: handleReferenceSearchFocus,
                                    style: {
                                        flex: 1,
                                        padding: '10px 40px 10px 12px',
                                        border: '1px solid #dee2e6',
                                        borderRadius: '4px',
                                        fontSize: '14px',
                                        backgroundColor: '#fff'
                                    }
                                }),
                                
                                createElement('div', {
                                    key: 'dropdown-arrow',
                                    className: 'reference-dropdown-arrow',
                                    onClick: () => setShowRefDocDropdown(!showRefDocDropdown),
                                    style: {
                                        position: 'absolute',
                                        right: '30px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        color: '#6b7280',
                                        userSelect: 'none'
                                    }
                                }, showRefDocDropdown ? '▲' : '▼'),
                                
                                selectedReferenceDoc && createElement('button', {
                                    key: 'clear-button',
                                    type: 'button',
                                    className: 'reference-clear-button',
                                    onClick: clearReferenceSelection,
                                    title: 'Clear selection',
                                    style: {
                                        position: 'absolute',
                                        right: '8px',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontSize: '16px',
                                        color: '#6b7280',
                                        padding: '0',
                                        width: '20px',
                                        height: '20px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }
                                }, '×')
                            ]),
                            
                            showRefDocDropdown && createElement('div', {
                                key: 'reference-dropdown-menu',
                                className: 'reference-dropdown-menu',
                                style: {
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    backgroundColor: 'white',
                                    border: '1px solid #dee2e6',
                                    borderTop: 'none',
                                    borderRadius: '0 0 4px 4px',
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    zIndex: 1000,
                                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                                }
                            }, filteredReferenceDocList().length > 0 ? [
                                selectedReferenceDoc && createElement('div', {
                                    key: 'clear-option',
                                    className: 'reference-dropdown-item',
                                    style: {
                                        padding: '8px 12px',
                                        cursor: 'pointer',
                                        backgroundColor: '#f8f9fa',
                                        borderBottom: '1px solid #dee2e6',
                                        fontSize: '14px',
                                        color: '#6b7280',
                                        fontStyle: 'italic'
                                    },
                                    onClick: clearReferenceSelection,
                                    onMouseEnter: (e) => {
                                        e.target.style.backgroundColor = '#e9ecef';
                                    },
                                    onMouseLeave: (e) => {
                                        e.target.style.backgroundColor = '#f8f9fa';
                                    }
                                }, '✕ Clear selection'),
                                
                                ...filteredReferenceDocList().map(doc => 
                                    createElement('div', {
                                        key: doc.id,
                                        className: 'reference-dropdown-item',
                                        style: {
                                            padding: '8px 12px',
                                            cursor: 'pointer',
                                            backgroundColor: selectedReferenceDoc === doc.id ? '#e7f3ff' : 'white',
                                            borderBottom: '1px solid #f0f0f0',
                                            fontSize: '14px',
                                            color: '#333',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        },
                                        onClick: () => handleSelectReferenceDoc(doc),
                                        onMouseEnter: (e) => {
                                            if (selectedReferenceDoc !== doc.id) {
                                                e.target.style.backgroundColor = '#f8f9fa';
                                            }
                                        },
                                        onMouseLeave: (e) => {
                                            if (selectedReferenceDoc !== doc.id) {
                                                e.target.style.backgroundColor = 'white';
                                            }
                                        }
                                    }, [
                                        createElement('span', {
                                            key: 'doc-icon',
                                            style: { fontSize: '16px' }
                                        }, '📄'),
                                        createElement('span', {
                                            key: 'doc-name',
                                            style: { 
                                                flex: 1,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            },
                                            title: doc.name
                                        }, doc.name),
                                        selectedReferenceDoc === doc.id && createElement('span', {
                                            key: 'selected-icon',
                                            style: { 
                                                color: '#007bff',
                                                fontSize: '16px',
                                                fontWeight: 'bold'
                                            }
                                        }, '✓')
                                    ])
                                )
                            ].filter(Boolean) : 
                                createElement('div', {
                                    key: 'no-results',
                                    className: 'reference-no-results',
                                    style: {
                                        padding: '12px',
                                        textAlign: 'center',
                                        color: '#6b7280',
                                        fontSize: '14px'
                                    }
                                }, 'No documents found')
                            )
                        ])
                    ]),

                    // Show current user + microflow status
                    createElement('div', {
                        key: 'user-display',
                        className: 'pdf-user-display'
                    }, [
                        createElement('div', {
                            key: 'user-info',
                            style: { marginBottom: '4px' }
                        }, `Creating area annotation as: ${currentUser}`),
                        createElement('div', {
                            key: 'microflow-status',
                            style: { 
                                fontSize: '12px', 
                                color: executeMendixAction ? '#10B981' : '#EF4444',
                                fontWeight: '500'
                            }
                        },)
                    ])
                ]),

                createElement('div', {
                    key: 'modal-footer',
                    className: 'pdf-modal-footer'
                }, [
                    createElement('button', {
                        key: 'cancel-btn',
                        onClick: handleCloseModal,
                        className: 'pdf-button pdf-button-cancel pdf-modal-cancel-btn'
                    }, 'Cancel'),
                    createElement('button', {
                        key: 'save-btn',
                        onClick: editingAnnotation ? handleSaveEdit : handleAddAnnotation,
                        disabled: (() => {
                            const richText = richTextContent.trim();
                            const plainText = commentText.trim();
                            return !richText && !plainText;
                        })(),
                        className: `pdf-button pdf-button-save pdf-modal-save-btn ${(() => {
                            const richText = richTextContent.trim();
                            const plainText = commentText.trim();
                            return (!richText && !plainText) ? 'disabled' : '';
                        })()}`
                    }, editingAnnotation ? 'Save Changes' : 'Add Area Annotation')
                ])
            ])
        ]),

        // File Preview Modal
        showFilePreview && previewFile && createElement('div', {
            key: 'file-preview-overlay',
            className: 'pdf-file-preview-overlay',
            style: {
                zIndex: isMaximized ? 60000 : 20000
            },
            onClick: (e) => {
                if (e.target === e.currentTarget) {
                    handleCloseFilePreview();
                }
            }
        }, [
            createElement('div', {
                key: 'file-preview-modal',
                className: 'pdf-file-preview-modal'
            }, [
                createElement('div', {
                    key: 'file-preview-header',
                    className: 'pdf-file-preview-header'
                }, [
                    createElement('h3', {
                        key: 'file-preview-title',
                        className: 'pdf-file-preview-title'
                    }, previewFile.name),
                    createElement('button', {
                        key: 'close-preview',
                        className: 'pdf-file-preview-close pdf-file-preview-close-btn',
                        onClick: handleCloseFilePreview
                    }, '×')
                ]),
                
                createElement('div', {
                    key: 'file-preview-content',
                    className: 'pdf-file-preview-content'
                }, [
                    loadingPreview ? 
                        createElement('div', {
                            key: 'loading-preview',
                            className: 'pdf-file-preview-loading'
                        }, [
                            createElement('div', {
                                key: 'spinner',
                                className: 'pdf-loading-spinner'
                            }),
                            createElement('p', {
                                key: 'loading-text'
                            }, 'Loading file...')
                        ]) :
                        previewFile.blobUrl ? 
                            (previewFile.type.startsWith('image/') ? 
                                createElement('img', {
                                    key: 'image-preview',
                                    src: previewFile.blobUrl,
                                    alt: previewFile.name,
                                    className: 'pdf-file-preview-image'
                                }) :
                                previewFile.type === 'application/pdf' ?
                                    createElement('iframe', {
                                        key: 'pdf-preview',
                                        src: previewFile.blobUrl,
                                        className: 'pdf-file-preview-pdf',
                                        title: previewFile.name
                                    }) :
                                    createElement('div', {
                                        key: 'download-preview',
                                        className: 'pdf-file-preview-download'
                                    }, [
                                        createElement('div', {
                                            key: 'file-icon',
                                            className: 'pdf-file-preview-icon'
                                        }, '📄'),
                                        createElement('p', {
                                            key: 'file-info'
                                        }, `${previewFile.name} (${formatFileSize(previewFile.size)})`),
                                        createElement('a', {
                                            key: 'download-link',
                                            href: previewFile.blobUrl,
                                            download: previewFile.name,
                                            className: 'pdf-file-preview-download-btn'
                                        }, 'Download File')
                                    ])
                            ) : null
                ])
            ])
        ])
    ]);
}