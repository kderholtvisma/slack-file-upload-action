const core = require('@actions/core');
const github = require('@actions/github');
var https = require('https');
var FormData = require('form-data');
var fs = require('fs');
var path = require('path');

function finishWithError(message) {
    console.log(message);
    core.setFailed(message);
}

function finish(result) {
    core.setOutput("result", result);
}

function makeApiRequest(options, body) {
    return new Promise((resolve, reject) => {
        try {
            console.log(`Making API request to ${options.hostname}${options.path}`);
            console.log(`Request headers: ${JSON.stringify(options.headers)}`);
            
            const req = https.request(options, (res) => {
                console.log(`Response status code: ${res.statusCode}`);
                console.log(`Response headers: ${JSON.stringify(res.headers)}`);
                
                let rawData = '';
                res.on('data', (chunk) => { 
                    rawData += chunk; 
                });
                
                res.on('end', () => {
                    console.log(`Response data: ${rawData}`);
                    try {
                        const data = JSON.parse(rawData);
                        if (data.ok) {
                            resolve(data);
                        } else {
                            const errorDetails = {
                                error: data.error || "Unknown error",
                                warnings: data.warning || [],
                                metadata: data.response_metadata || {}
                            };
                            console.error(`API error: ${JSON.stringify(errorDetails)}`);
                            reject(data.error || "API request failed without error message");
                        }
                    } catch (error) {
                        console.error(`Error parsing response: ${error.message}`);
                        reject(error.message);
                    }
                });
            });
            
            req.on('error', (error) => {
                console.error(`Request error: ${error.message}`);
                reject(error);
            });
            
            if (body) {
                req.write(body);
                console.log(`Request body sent: ${body}`);
            }
            
            req.end();
            console.log('Request sent');
        } catch (error) {
            console.error(`Error in makeApiRequest: ${error.message}`);
            reject(error);
        }
    });
}

async function getUploadUrl(token, filePath, filename, filetype) {
    try {
        const fileSize = fs.statSync(filePath).size;
        
        // Create request body
        const requestData = {
            filename: filename,
            length: fileSize
        };
        
        if (filetype) {
            requestData.filetype = filetype;
        }
        
        const bodyString = JSON.stringify(requestData);
        
        const options = {
            hostname: 'slack.com',
            path: '/api/files.getUploadURLExternal',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': Buffer.byteLength(bodyString),
                'Authorization': `Bearer ${token}`
            }
        };
        
        console.log(`Requesting upload URL for file: ${filename}, size: ${fileSize} bytes`);
        console.log(`Request data: ${JSON.stringify(requestData)}`);
        
        const response = await makeApiRequest(options, bodyString);
        return response;
    } catch (error) {
        console.error(`Error in getUploadUrl: ${error.message}`);
        throw error;
    }
}

async function uploadFileToUrl(uploadUrl, filePath) {
    return new Promise((resolve, reject) => {
        try {
            console.log(`Uploading file from ${filePath} to ${uploadUrl}`);
            const fileStream = fs.createReadStream(filePath);
            const fileSize = fs.statSync(filePath).size;
            console.log(`File size: ${fileSize} bytes`);
            
            const options = new URL(uploadUrl);
            console.log(`Upload hostname: ${options.hostname}, path: ${options.pathname + options.search}`);
            
            const req = https.request({
                hostname: options.hostname,
                path: options.pathname + options.search,
                method: 'PUT',
                headers: {
                    'Content-Length': fileSize,
                    'Content-Type': 'application/octet-stream'
                }
            }, (res) => {
                console.log(`Upload response status code: ${res.statusCode}`);
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log('File upload successful');
                    resolve();
                } else {
                    let errorData = '';
                    res.on('data', (chunk) => { errorData += chunk; });
                    res.on('end', () => {
                        console.error(`Upload failed: ${res.statusCode} ${errorData}`);
                        reject(`Upload failed: ${res.statusCode} ${errorData}`);
                    });
                }
            });
            
            req.on('error', (error) => {
                console.error(`Upload error: ${error.message}`);
                reject(error);
            });
            
            fileStream.pipe(req);
        } catch (error) {
            console.error(`Error in uploadFileToUrl: ${error.message}`);
            reject(error);
        }
    });
}

async function completeUpload(token, fileId, channel, initial_comment, thread_ts, title) {
    try {
        console.log(`Completing upload for file ID: ${fileId}`);
        
        // Build request data
        let requestData = {
            files: [{
                id: fileId
            }]
        };
        
        // Add title if provided
        if (title) {
            requestData.files[0].title = title;
        }
        
        // Add channel
        if (channel) {
            // Check if it's a single channel or multiple comma-separated channels
            if (channel.includes(',')) {
                requestData.channel_ids = channel.split(',');
            } else {
                requestData.channel_id = channel;
            }
        }
        
        // Add additional parameters if provided
        if (initial_comment) {
            requestData.initial_comment = initial_comment;
        }
        
        if (thread_ts) {
            requestData.thread_ts = thread_ts;
        }
        
        const bodyString = JSON.stringify(requestData);
        
        const options = {
            hostname: 'slack.com',
            path: '/api/files.completeUploadExternal',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': Buffer.byteLength(bodyString),
                'Authorization': `Bearer ${token}`
            }
        };

        console.log(`Complete upload request data: ${JSON.stringify(requestData, null, 2)}`);
        const response = await makeApiRequest(options, bodyString);
        console.log(`Complete upload response: ${JSON.stringify(response)}`);
        return response;
    } catch (error) {
        console.error(`Error in completeUpload: ${error}`);
        throw error;
    }
}

async function run() {
    try {
        const token = core.getInput('token');
        const filePath = core.getInput('path');
        console.log(`Input file path: ${filePath}`);
        
        // Verify file exists and is accessible
        if (!fs.existsSync(filePath)) {
            throw new Error(`File does not exist: ${filePath}`);
        }
        
        const channel = core.getInput('channel');
        const filename = core.getInput('filename') || path.basename(filePath);
        const filetype = core.getInput('filetype');
        const initial_comment = core.getInput('initial_comment');
        const thread_ts = core.getInput('thread_ts');
        const title = core.getInput('title');

        console.log(`Uploading file: ${filename} (${filetype || 'auto-detect type'}) from path: ${filePath}`);
        
        // Step 1: Get upload URL
        const uploadUrlResponse = await getUploadUrl(token, filePath, filename, filetype);
        console.log(`Got upload URL response: ${JSON.stringify(uploadUrlResponse)}`);
        const { upload_url, file_id } = uploadUrlResponse;

        // Step 2: Upload file to URL
        await uploadFileToUrl(upload_url, filePath);

        // Step 3: Complete the upload
        const completeResponse = await completeUpload(token, file_id, channel, initial_comment, thread_ts, title);
        
        const result = JSON.stringify(completeResponse);
        finish(result);
    } catch (error) {
        finishWithError(error);
    }
}

run()
