# youtube-feeds
A Node.js application that converts youtube playlist into audio podcast feeds.

## Prerequisites
  * CouchDB: registry of the feeds
  * S3 compatible Object Storage: audio files are stored here

# REST API's
The API's work around youtube playlists.  For example, here's the one I created for testing purpose: https://www.youtube.com/playlist?list=PLtq51fIaqF1v3OA5pSmXbmJiYOKemjs-M
## Create Audio Feeds from a playlist

_HTTP GET /api/playlist/the-playlist-id_

For example, to test on localhost: curl -X GET http://localhost:6003/api/playlist/PLtq51fIaqF1v3OA5pSmXbmJiYOKemjs-M

## Retrieve Audio Feeds from a playlist

_HTTP GET /api/feed/the-playlist-id_

For example: curl -X GET http://localhost:6003/api/feed/PLtq51fIaqF1v3OA5pSmXbmJiYOKemjs-M

# Containerization
A [Dockerfile](https://github.com/songlining/dockerfiles/blob/master/youtube-feeds/Dockerfile) has been provided to put everything into the container. Make sure env.json is in the same directory of the Dockerfile when running _docker build_.
