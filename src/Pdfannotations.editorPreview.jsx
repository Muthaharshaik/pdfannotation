import { createElement } from "react";

// Preview component - ONLY default export for Mendix
export default function preview(props) {
    const containerStyle = {
        display: 'flex',
        flexDirection: 'column',
        height: '200px',
        padding: '1rem',
        background: '#f8f9fa',
        border: '2px dashed #6c757d',
        borderRadius: '8px',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center'
    };

    return (
        <div style={containerStyle}>
            <div style={{ fontSize: '48px', marginBottom: '1rem' }}>📄</div>
            <h3 style={{ margin: '0 0 1rem 0', color: '#495057' }}>
                📋 PDF Annotations Widget
            </h3>
            <p style={{ margin: '0.5rem 0', fontSize: '14px', color: '#6c757d' }}>
                <strong>S3 URL:</strong> {props.surl || "[Configure S3 URL]"}
            </p>
            <p style={{ margin: '0.5rem 0', fontSize: '14px', color: '#6c757d' }}>
                <strong>Annotations:</strong> {props.pdfAnnotations || "[Auto-managed]"}
            </p>
            <div style={{ marginTop: '1rem', fontSize: '12px', color: '#6c757d' }}>
                💡 This widget will load and display PDFs from S3 with annotation capabilities
            </div>
        </div>
    );
}