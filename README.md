# youtube-feeds
A Node.js application that converts youtube playlist into audio podcast feeds.

# Prerequisites
## CouchDB
## S3 compatible Object Storage

# REST API's
The API's work around youtube playlists.  For example, here's the one I created for testing purpose: https://www.youtube.com/playlist?list=PLtq51fIaqF1v3OA5pSmXbmJiYOKemjs-M
## Create Audio Feeds from a playlist

HTTP PUT /api/playlist/the-playlist-id

For example, to test on localhost: curl -X PUT http://localhost:6003/api/playlist/PLtq51fIaqF1v3OA5pSmXbmJiYOKemjs-M

## Retrieve Audio Feeds from a playlist

HTTP GET /api/feed/the-playlist-id

For example: curl -X GET http://localhost:6003/api/feed/PLtq51fIaqF1v3OA5pSmXbmJiYOKemjs-M
