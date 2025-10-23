/**
 * This file was generated from Pdfannotations.xml
 * WARNING: All changes made to this file will be overwritten
 * @author Mendix Widgets Framework Team
 */

// Main widget props interface
export interface PdfannotationsContainerProps {
    name: string;
    class: string;
    style?: object;
    tabIndex?: number;

    // Properties from XML
    surl: {
        status: "available" | "loading" | "unavailable";
        value?: string;
        setValue?: (value: string) => void;
        displayValue?: string;
        validation?: string;
        readOnly: boolean;
    };
    pdfAnnotations: {
        status: "available" | "loading" | "unavailable";
        value?: string;
        setValue?: (value: string) => void;
        displayValue?: string;
        validation?: string;
        readOnly: boolean;
    };
}

// Preview props for Studio Pro
export interface PdfannotationsPreviewProps {
    className: string;
    style: string;
    styleObject?: object;
    readOnly: boolean;

    // Properties from XML  
    surl: string;
    pdfAnnotations: string;
}