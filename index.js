const core = require('@actions/core');
const github = require('@actions/github');
const https = require('https');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

function finishWithError(message) {
    console.log(message);
    core.setFailed(message);
}

function finish(result) {
    core.setOutput("result", result);
}

// Helper function to make HTTP requests
function makeRequest(options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(data);
                    if (parsedData.ok) {
                        resolve(parsedData);
                    } else {
                        console.error(`API Error: ${data}`);
                        reject(parsedData.error || 'Unknown error');
                    }
                } catch (e) {
                    reject(e.message);
                }
            });
        });

        req.on('error', (error) => reject(error.message));

        if (body) {
            req.write(body);
        }

        req.end();
    });
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

// Step 2: Upload file to the URL - Fixed to use POST as per docs
async function uploadFile(uploadUrl, filePath) {
    const fileContent = fs.readFileSync(filePath);
    const filename = path.basename(filePath);

    // Create a form data to properly upload the file
    const form = new FormData();
    form.append('file', fileContent, {
        filename: filename,
        contentType: 'application/octet-stream',
    });

    const url = new URL(uploadUrl);

    return new Promise((resolve, reject) => {
        form.submit({
            host: url.hostname,
            path: url.pathname + url.search,
            protocol: url.protocol,
            method: 'POST'
        }, (err, res) => {
            if (err) {
                reject(err);
                return;
            }

            if (res.statusCode >= 200 && res.statusCode < 300) {
                // Success - read any response data if needed
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    resolve(data || 'Upload successful');
                });
            } else {
                let errorData = '';
                res.on('data', (chunk) => errorData += chunk);
                res.on('end', () => {
                    reject(`Upload failed: Status ${res.statusCode}, ${errorData}`);
                });
            }
        });
    });
}

// Step 3: Complete the upload - Fixed structure of parameters
async function completeUpload(token, fileId, channel, initialComment, threadTs, title) {
    // Create a form data object
    const form = new FormData();
    form.append('token', token);

    // Add file details - properly structured as per API docs
    const fileData = {
        id: fileId
    };

    if (title) {
        fileData.title = title;
    }

    form.append('files', JSON.stringify([fileData]));

    // Add other parameters
    if (channel) form.append('channel_id', channel);
    if (initialComment) form.append('initial_comment', initialComment);
    if (threadTs) form.append('thread_ts', threadTs);

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
        // Get inputs
        const token = core.getInput('token');
        const filePath = core.getInput('path');
        const channel = core.getInput('channel');
        const filename = core.getInput('filename') || path.basename(filePath);
        const filetype = core.getInput('filetype');
        const initialComment = core.getInput('initial_comment');
        const threadTs = core.getInput('thread_ts');
        const title = core.getInput('title');

        console.log(`Uploading file: ${filename} from path: ${filePath}`);

        // Check if file exists
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        // Step 1: Get upload URL
        const uploadUrlResponse = await getUploadURL(token, filePath, filename);
        const { upload_url, file_id } = uploadUrlResponse;
        console.log(`Got upload URL for file ID: ${file_id}`);

        // Step 2: Upload file to URL
        await uploadFile(upload_url, filePath);
        console.log(`File uploaded successfully`);

        // Step 3: Complete the upload
        const completeResponse = await completeUpload(token, file_id, channel, initialComment, threadTs, title);
        console.log(`Upload completed successfully`);

        finish(JSON.stringify(completeResponse));
    } catch (error) {
        finishWithError(error.message || error);
    }
}

run();