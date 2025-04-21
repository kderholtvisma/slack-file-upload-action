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
        const req = https.request(options, (res) => {
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                try {
                    const data = JSON.parse(rawData);
                    if (data.ok) {
                        resolve(data);
                    } else {
                        reject(data.error);
                    }
                } catch (error) {
                    reject(error.message);
                }
            });
        });
        req.on('error', (error) => reject(error));
        if (body) req.write(body);
        req.end();
    });
}

async function getUploadUrl(token, filename, filetype) {
    const options = {
        hostname: 'slack.com',
        path: '/api/files.getUploadURLExternal',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };

    const body = JSON.stringify({
        filename,
        length: fs.statSync(filename).size,
        ...(filetype && { filetype })
    });

    const response = await makeApiRequest(options, body);
    return response;
}

async function uploadFileToUrl(uploadUrl, filePath) {
    return new Promise((resolve, reject) => {
        const fileStream = fs.createReadStream(filePath);
        const options = new URL(uploadUrl);
        
        const req = https.request({
            hostname: options.hostname,
            path: options.pathname + options.search,
            method: 'PUT',
            headers: {
                'Content-Length': fs.statSync(filePath).size,
                'Content-Type': 'application/octet-stream'
            }
        }, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve();
            } else {
                let errorData = '';
                res.on('data', (chunk) => { errorData += chunk; });
                res.on('end', () => reject(`Upload failed: ${res.statusCode} ${errorData}`));
            }
        });
        
        req.on('error', (error) => reject(error));
        fileStream.pipe(req);
    });
}

async function completeUpload(token, fileId, channel, initial_comment, thread_ts, title) {
    const options = {
        hostname: 'slack.com',
        path: '/api/files.completeUploadExternal',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };

    const body = JSON.stringify({
        files: [{
            id: fileId,
            ...(title && { title }),
        }],
        ...(channel && { channel_id: channel }),
        ...(initial_comment && { initial_comment }),
        ...(thread_ts && { thread_ts })
    });

    const response = await makeApiRequest(options, body);
    return response;
}

async function run() {
    try {
        const token = core.getInput('token');
        const filePath = core.getInput('path');
        const channel = core.getInput('channel');
        const filename = core.getInput('filename') || path.basename(filePath);
        const filetype = core.getInput('filetype');
        const initial_comment = core.getInput('initial_comment');
        const thread_ts = core.getInput('thread_ts');
        const title = core.getInput('title');

        // Step 1: Get upload URL
        const uploadUrlResponse = await getUploadUrl(token, filename, filetype);
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
