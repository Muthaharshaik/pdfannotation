import { createElement } from "react";

// Error Boundary Component for PDF Annotations Widget
export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { 
            hasError: false, 
            error: null, 
            errorInfo: null 
        };
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        // Log error details
        console.error('🚨 PDF Annotations Widget Error:', error);
        console.error('🚨 Error Info:', errorInfo);
        
        this.setState({
            error: error,
            errorInfo: errorInfo
        });

        // You can also log to an error reporting service here
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        }
    }

    handleRetry = () => {
        this.setState({ 
            hasError: false, 
            error: null, 
            errorInfo: null 
        });
    };

    render() {
        if (this.state.hasError) {
            return createElement('div', {
                style: {
                    width: '100%',
                    height: '500px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%)',
                    border: '2px solid #f5c6cb',
                    borderRadius: '12px',
                    padding: '2rem',
                    textAlign: 'center'
                }
            }, [
                // Error icon
                createElement('div', {
                    key: 'error-icon',
                    style: {
                        fontSize: '64px',
                        marginBottom: '1.5rem',
                        animation: 'pulse 2s ease-in-out infinite'
                    }
                }, '💥'),

                // Error title
                createElement('h2', {
                    key: 'error-title',
                    style: {
                        color: '#721c24',
                        marginBottom: '1rem',
                        fontSize: '24px',
                        fontWeight: '600'
                    }
                }, 'PDF Annotations Widget Error'),

                // Error message
                createElement('p', {
                    key: 'error-message',
                    style: {
                        color: '#721c24',
                        marginBottom: '1.5rem',
                        fontSize: '16px',
                        maxWidth: '600px',
                        lineHeight: '1.5'
                    }
                }, this.state.error ? this.state.error.message : 'An unexpected error occurred while loading the PDF annotations widget.'),

                // Error details (expandable)
                this.state.error && createElement('details', {
                    key: 'error-details',
                    style: {
                        background: 'rgba(255, 255, 255, 0.8)',
                        border: '1px solid #d1ecf1',
                        borderRadius: '6px',
                        padding: '1rem',
                        marginBottom: '1.5rem',
                        maxWidth: '100%',
                        width: '600px',
                        textAlign: 'left'
                    }
                }, [
                    createElement('summary', {
                        key: 'summary',
                        style: {
                            cursor: 'pointer',
                            fontWeight: '600',
                            color: '#0c5460',
                            marginBottom: '0.5rem'
                        }
                    }, '🔍 Technical Details (Click to expand)'),
                    
                    createElement('div', {
                        key: 'error-stack',
                        style: {
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            color: '#721c24',
                            background: '#fff',
                            padding: '0.75rem',
                            borderRadius: '4px',
                            border: '1px solid #dee2e6',
                            overflowX: 'auto',
                            whiteSpace: 'pre-wrap'
                        }
                    }, [
                        createElement('strong', { key: 'error-name' }, 'Error: '),
                        this.state.error.toString(),
                        this.state.errorInfo && createElement('div', {
                            key: 'component-stack',
                            style: { marginTop: '0.5rem' }
                        }, [
                            createElement('strong', { key: 'stack-label' }, 'Component Stack:'),
                            createElement('div', { 
                                key: 'stack-trace',
                                style: { fontSize: '11px', marginTop: '0.25rem' }
                            }, this.state.errorInfo.componentStack)
                        ])
                    ])
                ]),

                // Troubleshooting tips
                createElement('div', {
                    key: 'troubleshooting',
                    style: {
                        background: 'rgba(255, 255, 255, 0.9)',
                        border: '1px solid #bee5eb',
                        borderRadius: '8px',
                        padding: '1.5rem',
                        marginBottom: '1.5rem',
                        textAlign: 'left',
                        maxWidth: '600px'
                    }
                }, [
                    createElement('h4', {
                        key: 'tips-title',
                        style: {
                            margin: '0 0 1rem 0',
                            color: '#0c5460',
                            fontSize: '16px'
                        }
                    }, '🛠️ Troubleshooting Tips:'),
                    
                    createElement('ul', {
                        key: 'tips-list',
                        style: {
                            margin: 0,
                            paddingLeft: '1.5rem',
                            color: '#0c5460',
                            fontSize: '14px',
                            lineHeight: '1.6'
                        }
                    }, [
                        createElement('li', { key: 'tip1' }, 'Check that all AWS credentials are correctly configured'),
                        createElement('li', { key: 'tip2' }, 'Verify that the S3 bucket and file exist'),
                        createElement('li', { key: 'tip3' }, 'Ensure your internet connection is stable'),
                        createElement('li', { key: 'tip4' }, 'Try refreshing the page or reloading the widget'),
                        createElement('li', { key: 'tip5' }, 'Check browser console for additional error details'),
                        createElement('li', { key: 'tip6' }, 'Contact support if the issue persists')
                    ])
                ]),

                // Action buttons
                createElement('div', {
                    key: 'error-actions',
                    style: {
                        display: 'flex',
                        gap: '1rem',
                        flexWrap: 'wrap',
                        justifyContent: 'center'
                    }
                }, [
                    // Retry button
                    createElement('button', {
                        key: 'retry-btn',
                        onClick: this.handleRetry,
                        style: {
                            background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
                            color: 'white',
                            border: 'none',
                            padding: '0.75rem 1.5rem',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '16px',
                            fontWeight: '600',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            transition: 'transform 0.2s ease'
                        },
                        onMouseEnter: (e) => {
                            e.target.style.transform = 'translateY(-2px)';
                        },
                        onMouseLeave: (e) => {
                            e.target.style.transform = 'translateY(0)';
                        }
                    }, '🔄 Retry'),

                    // Reload page button
                    createElement('button', {
                        key: 'reload-btn',
                        onClick: () => window.location.reload(),
                        style: {
                            background: 'linear-gradient(135deg, #6c757d 0%, #5a6268 100%)',
                            color: 'white',
                            border: 'none',
                            padding: '0.75rem 1.5rem',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '16px',
                            fontWeight: '600',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            transition: 'transform 0.2s ease'
                        },
                        onMouseEnter: (e) => {
                            e.target.style.transform = 'translateY(-2px)';
                        },
                        onMouseLeave: (e) => {
                            e.target.style.transform = 'translateY(0)';
                        }
                    }, '🔃 Reload Page')
                ]),

                // Widget info
                createElement('div', {
                    key: 'widget-info',
                    style: {
                        marginTop: '2rem',
                        fontSize: '12px',
                        color: '#6c757d',
                        fontStyle: 'italic'
                    }
                }, [
                    'PDF Annotations Widget v2.0.0 • ',
                    createElement('span', {
                        key: 'timestamp'
                    }, new Date().toLocaleString())
                ]),

                // CSS for animations
                createElement('style', {
                    key: 'error-styles'
                }, `
                    @keyframes pulse {
                        0%, 100% { 
                            opacity: 1; 
                            transform: scale(1);
                        }
                        50% { 
                            opacity: 0.7; 
                            transform: scale(1.05);
                        }
                    }
                `)
            ]);
        }

        // If no error, render children normally
        return this.props.children;
    }
}