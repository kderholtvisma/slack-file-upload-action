# Slack file upload action

This action uploads files to Slack using the new external upload APIs. It is fully compatible with Slack's API changes going into effect on November 12, 2025, when the legacy `files.upload` API will be discontinued.

**IMPORTANT UPDATE:** This action now uses the recommended `files.getUploadURLExternal` and `files.completeUploadExternal` APIs for future compatibility. The migration is transparent to users - all existing workflows should continue to work without changes.

## Inputs

### `token`

**Required** Slack app token. See [Internal app tokens](https://slack.com/intl/en-ru/help/articles/215770388-Create-and-regenerate-API-tokens#internal-app-tokens)
* Create app
* Add `files:write` permission
* Install app to your workspace
* Invite bot to required channels `/invite <botname>`
* Use bot token from `OAuth & Permissions` page
### `path`

**Required** Path to file

### `channel`

Slack channel for upload


### `filename`

Filename of file
   
### `filetype`

A file type identifier.
   
### `initial_comment`

The message text introducing the file in specified channels.
    
### `title`

Title of file
    

## Example usage

```
on: [push]

jobs:
  slack_upload_job:
    runs-on: ubuntu-latest
    name: Upload test file
    steps:
      - name: Checkout
        uses: actions/checkout@v1
      - run: echo "Test file " > test.txt
      - name: Upload to slack step
        uses: adrey/slack-file-upload-action@master
        with:
          token: ${{ secrets.SLACK_TOKEN }}
          path: test.txt
          channel: random
```


