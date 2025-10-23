// Editor configuration - ONLY default export for Mendix
const PdfannotationsProps = {
    surl: {
        caption: "S3 URL",
        description: "The S3 URL of the PDF file to display",
        objectHeaders: ["Caption", "Value"],
        objects: []
    },
    pdfAnnotations: {
        caption: "PDF Annotations", 
        description: "JSON string containing the PDF annotations data",
        objectHeaders: ["Caption", "Value"],
        objects: []
    }
};

const Properties = [
    {
        key: "surl",
        caption: "S3 URL",
        description: "This is the link from S3 for the uploaded PDF file",
        objectHeaders: ["Caption", "Value"],
        objects: []
    },
    {
        key: "pdfAnnotations", 
        caption: "PDF Annotations",
        description: "Here we will store the annotation data for the PDF",
        objectHeaders: ["Caption", "Value"],
        objects: []
    }
];

// Default export for Mendix compatibility
export default {
    PdfannotationsProps,
    Properties
};