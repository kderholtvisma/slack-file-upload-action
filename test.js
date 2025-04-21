const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('isomorphic-fetch');

// Helper function to log errors
function finishWithError(message) {
    console.log(message);
    process.exit(1);
}

// Step 1: Get upload URL
async function getUploadURL(token, filePath, filename) {
    const fileSize = fs.statSync(filePath).size;
    
    // Using FormData
    const form = new FormData();
    form.append('token', token);
    form.append('filename', filename);
    form.append('length', fileSize);
    
    return new Promise((resolve, reject) => {
        form.submit('https://slack.com/api/files.getUploadURLExternal', (err, res) => {
            if (err) {
                reject(err);
                return;
            }
            
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.ok) {
                        resolve(response);
                    } else {
                        console.error(`Get upload URL error: ${data}`);
                        reject(response.error);
                    }
                } catch (e) {
                    reject(e.message);
                }
            });
        });
    });
}

// Step 2: Upload file to the URL
async function uploadFile(uploadUrl, filePath) {
    try {
        const response = await fetch(uploadUrl, {
            method: 'PUT',
            body: fs.createReadStream(filePath),
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': fs.statSync(filePath).size
            }
        });
        
        if (!response.ok) {
            throw new Error(`Upload failed with status ${response.status}`);
        }
        
        return true;
    } catch (error) {
        console.error('Error uploading file:', error);
        throw error;
    }
}

// Step 3: Complete the upload
async function completeUpload(token, fileId, channel) {
    // Using FormData
    const form = new FormData();
    form.append('token', token);
    
    // Add file details
    form.append('files', JSON.stringify([{
        id: fileId
    }]));
    
    // Add channel if provided
    if (channel) form.append('channel_id', channel);
    
    return new Promise((resolve, reject) => {
        form.submit('https://slack.com/api/files.completeUploadExternal', (err, res) => {
            if (err) {
                reject(err);
                return;
            }
            
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.ok) {
                        resolve(response);
                    } else {
                        console.error(`Complete upload error: ${data}`);
                        reject(response.error);
                    }
                } catch (e) {
                    reject(e.message);
                }
            });
        });
    });
}

async function run() {
    try {
        // Test variables
        const token = process.env.SLACK_TOKEN;
        const filePath = './README.md'; // Use an existing file for testing
        const channel = process.env.TEST_CHANNEL;
        const filename = path.basename(filePath);
        
        // Check if token is provided
        if (!token) {
            return finishWithError('SLACK_TOKEN environment variable must be set');
        }
        
        console.log(`Testing file upload: ${filename} from path: ${filePath}`);
        
        // Step 1: Get upload URL
        console.log('Step 1: Getting upload URL...');
        const uploadUrlResponse = await getUploadURL(token, filePath, filename);
        const { upload_url, file_id } = uploadUrlResponse;
        console.log(`Got upload URL for file ID: ${file_id}`);
        
        // Step 2: Upload file to URL
        console.log('Step 2: Uploading file...');
        await uploadFile(upload_url, filePath);
        console.log(`File uploaded successfully`);
        
        // Step 3: Complete the upload
        console.log('Step 3: Completing upload...');
        const completeResponse = await completeUpload(token, file_id, channel);
        console.log('Upload completed successfully');
        console.log(JSON.stringify(completeResponse, null, 2));
        
        console.log('Test completed successfully ✓');
    } catch (error) {
        finishWithError(`Test failed: ${error}`);
    }
}

run();