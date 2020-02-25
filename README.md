# youtube-feeds
A Node.js application that converts youtube playlist into audio podcast feeds. 

You can use it to DIY your own podcast service that turns your favorite youtube list (music?) into ads-free high quality audio podcast. 

I am running my one on the [Bluemix Kubernetes](https://www.ibm.com/blogs/bluemix/2017/03/kubernetes-now-available-ibm-bluemix-container-service/) cluster.  However I can't tell you where it is until I have put in the OpenID support :)

## What's next
In short term this is my plan:
 1. ~~Having a proper GUI interface - currently there is a very basic HTML interface;~~ << this has been done.
 2. OpenID support so people can create their one podcast list;

## Prerequisites
  * ~~CouchDB: registry of the feeds.  You need to create a [design document](https://github.com/songlining/youtube-feeds/blob/master/cloudant/design_doc) in your database.~~
  * neo4j: the backend data store has changed to neo4j, it's so much easier to operate. Type the following Cypher statements after the database is created:
```
CREATE CONSTRAINT ON (f:Feed)
ASSERT (f.id) IS NODE KEY

CREATE CONSTRAINT ON (f:Feeds)
ASSERT (f.user_id) IS NODE KEY

CREATE CONSTRAINT ON (e:Episode)
ASSERT (e.id) IS NODE KEY

```
  
  * S3 API compatible Object Storage: audio files are stored here

# REST API's
The API's work around youtube playlists.  For example, here's the one I created for testing purpose: 

https://www.youtube.com/playlist?list=PLtq51fIaqF1v3OA5pSmXbmJiYOKemjs-M

## Create Audio Feeds from a playlist

_HTTP GET /api/playlist/the-playlist-id_

This will trigger the application to:
 1. Fetch the latest 10 episodes from the specified playlist;
 2. upload the episodes in audio format to an S3 compatible object storage
 3. register the episodes information in a CouchDB database

For example, to test on localhost: 

curl -X GET http://localhost:6003/api/playlist/PLtq51fIaqF1v3OA5pSmXbmJiYOKemjs-M

## Delete the playlist with its episodes

_HTTP DELETE /api/playlist/the-playlist-id_

## Retrieve Audio Feeds from a playlist

_HTTP GET /api/feed/the-playlist-id_

This will output an [RSS2 feed](https://en.wikipedia.org/wiki/RSS) like the one below:

curl -X GET http://localhost:6003/api/feed/PL5iU7FJMp9AfEM7RGvSA7Zqldn_6-256O
```xml
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
    <channel>
        <title>AOPA Live Stories</title>
        <link></link>
        <description></description>
        <lastBuildDate>Wed, 10 May 2017 10:04:38 GMT</lastBuildDate>
        <docs>http://blogs.law.harvard.edu/tech/rss</docs>
        <generator>Feed for Node.js</generator>
        <item>
            <title><![CDATA[WACOS by Shue]]></title>
            <link>http://yt-rss.s3-api.us-geo.objectstorage.softlayer.net/nQUY8AVI-bQ.m4a</link>
            <guid>http://yt-rss.s3-api.us-geo.objectstorage.softlayer.net/nQUY8AVI-bQ.m4a</guid>
        </item>
        <item>
            <title><![CDATA[Flying to the Bahamas]]></title>
            <link>http://yt-rss.s3-api.us-geo.objectstorage.softlayer.net/DLtdjA_qkYY.m4a</link>
            <guid>http://yt-rss.s3-api.us-geo.objectstorage.softlayer.net/DLtdjA_qkYY.m4a</guid>
        </item>
        <item>
            <title><![CDATA[SAM 27000]]></title>
            <link>http://yt-rss.s3-api.us-geo.objectstorage.softlayer.net/BlKWMKpSiW0.m4a</link>
            <guid>http://yt-rss.s3-api.us-geo.objectstorage.softlayer.net/BlKWMKpSiW0.m4a</guid>
        </item>
    </channel>
</rss>
```
This URL can be put into your favorate podcast app such as _Podcast & Radio Addict_ and now your have own podcast service feeding you audio from the youtube playlist created by either yourself or somebody else!  It's ads-free!

# Containerization
A [Dockerfile](https://github.com/songlining/dockerfiles/blob/master/youtube-feeds/Dockerfile) has been provided to put everything into the container. Make sure env.json is in the same directory of the Dockerfile when running _docker build_.

# How to use it?
The audio files can be stored in either AWS S3 or IBM Cloud Obejct Storage). The playlist registry information is in CouchDB. This application is writtin in a way that it doesn't have any touch on the local storage.  Downloading/converting the youtube episodes, uploading them to S3 are all through the Node.js stream pipes. 

If you want to setup a personal RSS feed like me you have various options either running the Node.js application in a VM or create a Docker container using the provided Dockerfile and then run the container either in a VM or in my case on the [IBM Kubernetes as a Service](https://www.ibm.com/blogs/bluemix/2017/03/kubernetes-now-available-ibm-bluemix-container-service/). 

If you use the Lite/free IBM K8S cluster you will be able to run your containers in a free node with 2 CPU's and 4GB of RAM. It's good enough to serve the podcast service for yourself.  The Lite cluster won't give you Ingress or Load Balancer functions. You will only be able to use NodePort to expose your service.  Well, it's free and for me it's good enough.

## env.json
[A sample env.json file](https://github.com/songlining/youtube-feeds/blob/master/controller/env.json) has been provided for your reference.  You need to populate this file with your own credentials.

# Limitation
I am still working on the reason why podcast players on Apple devices can't play the podcasts.  My favorite podcast player is Podcast Addict which works like charm.
