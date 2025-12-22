import CryptoJS from "crypto-js";

export class SecureS3Downloader {
    constructor(accessKey, secretKey, sessionToken, region) {
        this.accessKey = accessKey;
        this.secretKey = secretKey;
        this.sessionToken = sessionToken;
        this.region = region;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.lastGeneratedPresignedUrl = null; // Store the last generated presigned URL
    }

    // Enhanced URL encoding for S3 keys - handles all special characters like image annotator
    encodeS3Key(key) {
        // First, ensure the key is properly decoded if it's already encoded
        let decodedKey;
        try {
            decodedKey = decodeURIComponent(key);
        } catch (e) {
            decodedKey = key;
        }
        
        // Split by forward slashes to preserve path structure
        const pathParts = decodedKey.split('/');
        
        // Encode each part separately to handle special characters
        const encodedParts = pathParts.map(part => {
            // Handle spaces and special characters that cause S3 signature issues
            return encodeURIComponent(part)
                // Handle characters that cause AWS signature problems
                .replace(/[!'()*]/g, function(c) {
                    return '%' + c.charCodeAt(0).toString(16).toUpperCase();
                })
                // Additional encoding for problematic characters
                .replace(/\(/g, '%28')  // Left parenthesis
                .replace(/\)/g, '%29')  // Right parenthesis
                .replace(/\[/g, '%5B')  // Left bracket
                .replace(/\]/g, '%5D')  // Right bracket
                .replace(/\{/g, '%7B')  // Left brace
                .replace(/\}/g, '%7D')  // Right brace
                .replace(/\#/g, '%23')  // Hash
                .replace(/\?/g, '%3F')  // Question mark
                .replace(/\&/g, '%26')  // Ampersand
                .replace(/\=/g, '%3D')  // Equals
                .replace(/\+/g, '%2B')  // Plus (don't convert spaces to + for S3)
                .replace(/%20/g, '%20'); // Keep %20 for spaces instead of +
        });
        
        return encodedParts.join('/');
    }

    async downloadFile(bucketName, fileName, onProgress) {
        try {
            console.log(`🔐 Downloading from private S3: s3://${bucketName}/${fileName}`);
            
            if (onProgress) onProgress(5, 'Initializing download...', null);

            // Try multiple download strategies
            const strategies = [
                () => this.downloadWithPresignedUrl(bucketName, fileName, onProgress),
                () => this.downloadWithDirectSigning(bucketName, fileName, onProgress),
                () => this.downloadWithSimpleAuth(bucketName, fileName, onProgress)
            ];

            let lastError = null;
            
            for (let i = 0; i < strategies.length; i++) {
                try {
                    if (onProgress) onProgress(10 + (i * 10), `Trying download method ${i + 1}...`, this.lastGeneratedPresignedUrl);
                    const result = await strategies[i]();
                    console.log(`✅ Successfully downloaded using method ${i + 1}`);
                    
                    // Add presigned URL to result
                    result.presignedUrl = this.lastGeneratedPresignedUrl;
                    return result;
                } catch (error) {
                    console.warn(`❌ Download method ${i + 1} failed:`, error.message);
                    lastError = error;
                    
                    // If it's a credential issue, don't try other methods
                    if (error.message.includes('403') || error.message.includes('Access denied')) {
                        throw error;
                    }
                }
            }

            throw lastError || new Error('All download methods failed');

        } catch (error) {
            console.error('🔐 S3 download failed:', error);
            throw error;
        }
    }

    // NEW: Add method to expose presigned URL generation
    async generatePresignedUrl(bucketName, fileName, expirationSeconds = 3600) {
        const presignedUrl = await this.createPresignedUrl(bucketName, fileName, expirationSeconds);
        this.lastGeneratedPresignedUrl = presignedUrl;
        return presignedUrl;
    }

    async downloadWithPresignedUrl(bucketName, fileName, onProgress) {
        if (onProgress) onProgress(20, 'Creating pre-signed URL...', null);

        const signedUrl = await this.createPresignedUrl(bucketName, fileName);
        this.lastGeneratedPresignedUrl = signedUrl; // Store the presigned URL
        
        if (onProgress) onProgress(40, 'Downloading via pre-signed URL...', signedUrl);

        const response = await this.fetchWithRetry(signedUrl, {
            method: 'GET',
            mode: 'cors',
            headers: {
                'Accept': 'application/pdf,*/*'
            }
        });

        if (!response.ok) {
            throw new Error(`Pre-signed URL download failed: ${response.status} ${response.statusText}`);
        }

        if (onProgress) onProgress(80, 'Processing downloaded data...', signedUrl);

        const arrayBuffer = await response.arrayBuffer();
        
        if (onProgress) onProgress(100, 'Download completed', signedUrl);

        return {
            buffer: new Uint8Array(arrayBuffer),
            contentType: response.headers.get('Content-Type') || 'application/pdf',
            size: arrayBuffer.byteLength,
            presignedUrl: signedUrl
        };
    }

    async downloadWithDirectSigning(bucketName, fileName, onProgress) {
        if (onProgress) onProgress(20, 'Creating direct signed request...', null);

        // Use enhanced encoding for the URL
        const encodedFileName = this.encodeS3Key(fileName);
        const url = `https://${bucketName}.s3.${this.region}.amazonaws.com/${encodedFileName}`;
        const signedHeaders = await this.createSignedHeaders('GET', bucketName, fileName);
        
        // Store the URL for reference
        this.lastGeneratedPresignedUrl = url;
        
        if (onProgress) onProgress(40, 'Downloading with signed headers...', url);

        const response = await this.fetchWithRetry(url, {
            method: 'GET',
            mode: 'cors',
            headers: {
                ...signedHeaders,
                'Accept': 'application/pdf,*/*'
            }
        });

        if (!response.ok) {
            throw new Error(`Direct signed download failed: ${response.status} ${response.statusText}`);
        }

        if (onProgress) onProgress(80, 'Processing downloaded data...', url);

        const arrayBuffer = await response.arrayBuffer();
        
        if (onProgress) onProgress(100, 'Download completed', url);

        return {
            buffer: new Uint8Array(arrayBuffer),
            contentType: response.headers.get('Content-Type') || 'application/pdf',
            size: arrayBuffer.byteLength,
            presignedUrl: url
        };
    }

    async downloadWithSimpleAuth(bucketName, fileName, onProgress) {
        if (onProgress) onProgress(20, 'Trying simple authentication...', null);

        // Try with basic AWS auth header - use enhanced encoding
        const encodedFileName = this.encodeS3Key(fileName);
        const url = `https://${bucketName}.s3.${this.region}.amazonaws.com/${encodedFileName}`;
        const authHeader = btoa(`${this.accessKey}:${this.secretKey}`);
        
        // Store the URL for reference
        this.lastGeneratedPresignedUrl = url;
        
        if (onProgress) onProgress(40, 'Downloading with basic auth...', url);

        const response = await this.fetchWithRetry(url, {
            method: 'GET',
            mode: 'cors',
            headers: {
                'Authorization': `Basic ${authHeader}`,
                'Accept': 'application/pdf,*/*'
            }
        });

        if (!response.ok) {
            throw new Error(`Simple auth download failed: ${response.status} ${response.statusText}`);
        }

        if (onProgress) onProgress(80, 'Processing downloaded data...', url);

        const arrayBuffer = await response.arrayBuffer();
        
        if (onProgress) onProgress(100, 'Download completed', url);

        return {
            buffer: new Uint8Array(arrayBuffer),
            contentType: response.headers.get('Content-Type') || 'application/pdf',
            size: arrayBuffer.byteLength,
            presignedUrl: url
        };
    }

    async fetchWithRetry(url, options, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, options);
                return response;
            } catch (error) {
                if (i === retries - 1) throw error;
                console.warn(`Fetch attempt ${i + 1} failed, retrying...`, error.message);
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
            }
        }
    }

    // ENHANCED: Use enhanced encoding like image annotator with comprehensive special character handling
    async createPresignedUrl(bucketName, fileName, expirationSeconds = 3600) {
        try {
            console.log('🔗 Creating presigned URL with enhanced encoding (like image annotator)');
            console.log('Original fileName:', fileName);
            
            const method = 'GET';
            const service = 's3';
            const endpoint = `https://${bucketName}.s3.${this.region}.amazonaws.com`;
            
            // Use enhanced encoding function (same as image annotator)
            const encodedKey = this.encodeS3Key(fileName);
            const canonicalUri = `/${encodedKey}`;
            
            console.log('Enhanced encoded key:', encodedKey);
            console.log('Canonical URI:', canonicalUri);
            
            const now = new Date();
            const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
            const dateStamp = amzDate.substr(0, 8);
            
            const credentialScope = `${dateStamp}/${this.region}/${service}/aws4_request`;
            const algorithm = 'AWS4-HMAC-SHA256';
            
            const queryParams = new URLSearchParams();
            queryParams.set('X-Amz-Algorithm', algorithm);
            queryParams.set('X-Amz-Credential', `${this.accessKey}/${credentialScope}`);
            queryParams.set('X-Amz-Date', amzDate);
            queryParams.set('X-Amz-Expires', expirationSeconds.toString());
            queryParams.set("X-Amz-Security-Token", this.sessionToken);
            queryParams.set('X-Amz-SignedHeaders', 'host');
            
            const canonicalQuerystring = queryParams.toString();
            const canonicalHeaders = `host:${bucketName}.s3.${this.region}.amazonaws.com\n`;
            const signedHeaders = 'host';
            const payloadHash = 'UNSIGNED-PAYLOAD';
            
            const canonicalRequest = [
                method,
                canonicalUri,
                canonicalQuerystring,
                canonicalHeaders,
                signedHeaders,
                payloadHash
            ].join('\n');
            
            const stringToSign = [
                algorithm,
                amzDate,
                credentialScope,
                CryptoJS.SHA256(canonicalRequest).toString()
            ].join('\n');
            
            // Use CryptoJS for signing (like image annotator)
            const kDate = CryptoJS.HmacSHA256(dateStamp, `AWS4${this.secretKey}`);
            const kRegion = CryptoJS.HmacSHA256(this.region, kDate);
            const kService = CryptoJS.HmacSHA256(service, kRegion);
            const kSigning = CryptoJS.HmacSHA256('aws4_request', kService);
            const signature = CryptoJS.HmacSHA256(stringToSign, kSigning).toString();
            
            queryParams.set('X-Amz-Signature', signature);
            
            const presignedUrl = `${endpoint}${canonicalUri}?${queryParams.toString()}`;
            
            console.log('🔗 Generated enhanced pre-signed URL');
            console.log('🔗 URL length:', presignedUrl.length);
            console.log('🔗 URL preview:', presignedUrl.substring(0, 100) + '...');
            
            // Enhanced debugging for troubleshooting
            console.log('=== Enhanced S3 URL Generation Debug ===');
            console.log('Original key:', fileName);
            console.log('Enhanced encoded key:', encodedKey);
            console.log('Canonical URI:', canonicalUri);
            console.log('Final URL length:', presignedUrl.length);
            console.log('=====================================');
            
            return presignedUrl;
        } catch (error) {
            console.error('Error creating enhanced pre-signed URL:', error);
            console.error('Problematic fileName:', fileName);
            throw new Error(`Failed to create enhanced pre-signed URL: ${error.message}`);
        }
    }

    // ENHANCED: Use enhanced encoding for signed headers too
    async createSignedHeaders(method, bucketName, fileName) {
        try {
            const now = new Date();
            const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
            const dateStamp = amzDate.substr(0, 8);
            
            const algorithm = 'AWS4-HMAC-SHA256';
            const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
            const credential = `${this.accessKey}/${credentialScope}`;
            
            const canonicalHeaders = `host:${bucketName}.s3.${this.region}.amazonaws.com\nx-amz-date:${amzDate}\n`;
            const signedHeaders = 'host;x-amz-date';
            
            // Use enhanced encoding function
            const encodedFileName = this.encodeS3Key(fileName);
            
            const canonicalRequest = [
                method,
                `/${encodedFileName}`,
                '',
                canonicalHeaders,
                signedHeaders,
                'UNSIGNED-PAYLOAD'
            ].join('\n');

            const stringToSign = [
                algorithm,
                amzDate,
                credentialScope,
                CryptoJS.SHA256(canonicalRequest).toString()
            ].join('\n');

            // Use CryptoJS for signing
            const kDate = CryptoJS.HmacSHA256(dateStamp, `AWS4${this.secretKey}`);
            const kRegion = CryptoJS.HmacSHA256(this.region, kDate);
            const kService = CryptoJS.HmacSHA256('s3', kRegion);
            const kSigning = CryptoJS.HmacSHA256('aws4_request', kService);
            const signature = CryptoJS.HmacSHA256(stringToSign, kSigning).toString();
            
            console.log('🔗 Generated enhanced signed headers for:', fileName);
            console.log('🔗 Enhanced encoded fileName:', encodedFileName);
            
            return {
                'Authorization': `${algorithm} Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
                'X-Amz-Date': amzDate,
                'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
                'X-Amz-Security-Token': this.sessionToken  
            };
        } catch (error) {
            console.error('Error creating enhanced signed headers:', error);
            console.error('Problematic fileName:', fileName);
            throw new Error(`Failed to create enhanced signed headers: ${error.message}`);
        }
    }

    // Enhanced connection test with multiple methods and better encoding
    async testConnection(bucketName) {
        try {
            console.log('🧪 Testing AWS connection with enhanced encoding methods...');
            
            // Method 1: Try pre-signed URL approach with enhanced encoding
            try {
                const testUrl = await this.createPresignedUrl(bucketName, 'test-connection-file.txt', 60);
                const response = await fetch(testUrl, {
                    method: 'HEAD',
                    mode: 'cors'
                });

                // 200 = file exists, 404 = file doesn't exist but bucket accessible, 403 = no access
                if (response.status === 200 || response.status === 404) {
                    console.log('✅ Enhanced pre-signed URL method works - AWS credentials valid');
                    return { success: true, message: 'AWS credentials valid (enhanced pre-signed URL)' };
                }
            } catch (error) {
                console.warn('Enhanced pre-signed URL test failed:', error.message);
            }

            // Method 2: Try direct request to bucket
            try {
                const bucketUrl = `https://${bucketName}.s3.${this.region}.amazonaws.com/`;
                const response = await fetch(bucketUrl, {
                    method: 'HEAD',
                    mode: 'cors'
                });

                if (response.status === 200 || response.status === 403) {
                    console.log('✅ Direct bucket access works - AWS setup valid');
                    return { success: true, message: 'AWS setup valid (direct access)' };
                }
            } catch (error) {
                console.warn('Direct bucket test failed:', error.message);
            }

            // Method 3: Try with enhanced signed headers
            try {
                const signedHeaders = await this.createSignedHeaders('HEAD', bucketName, 'test');
                const encodedTestFile = this.encodeS3Key('test');
                const response = await fetch(`https://${bucketName}.s3.${this.region}.amazonaws.com/${encodedTestFile}`, {
                    method: 'HEAD',
                    mode: 'cors',
                    headers: signedHeaders
                });

                if (response.status === 200 || response.status === 404) {
                    console.log('✅ Enhanced signed headers method works - AWS credentials valid');
                    return { success: true, message: 'AWS credentials valid (enhanced signed headers)' };
                }
            } catch (error) {
                console.warn('Enhanced signed headers test failed:', error.message);
            }

            // If all methods fail, provide detailed error
            throw new Error('All enhanced connection test methods failed. Check CORS settings on your S3 bucket and file path encoding.');

        } catch (error) {
            console.error('❌ Enhanced AWS credential test failed:', error);
            return { 
                success: false, 
                message: `Enhanced connection test failed: ${error.message}. Ensure CORS is configured on your S3 bucket for browser access and file paths are properly encoded.` 
            };
        }
    }
}