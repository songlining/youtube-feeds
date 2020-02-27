/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var ytpl = require('ytpl');
var ytdl = require('ytdl-core');
var streamingS3 = require('streaming-s3');
var stream = require('stream');
const Feed = require('feed');
var s3 = require('s3');
var r=require("request");

var config = require('../env.json');
var accessKeyId = config.object_storage.accessKeyId;
var secretAccessKey = config.object_storage.secretAccessKey;
var endpoint=config.object_storage.endpoint;
var bucket_url =config.object_storage.bucket_url;
var neo4j_url = config.neo4j.url;
var neo4j_username = config.neo4j.username;
var neo4j_password = config.neo4j.password;

// for future user features
var current_user_id = "0";
var current_user_name = "larry";

// neo4j cypher REST call
function cypher(query,params,cb) {
    r.post({uri:neo4j_url,
            auth: {"username": neo4j_username, "password": neo4j_password},
            json:{statements:[{statement:query, parameters:params}]}},
           function(err,res) { cb(err,res.body)});
}
// add one playlist and download the episodes
exports.add_playlist = function(req, res) {
    var url = req.url; 
    var playlist_id = url.substr(url.lastIndexOf('/') + 1);
    ytpl(playlist_id, {limit: 1}, function(err, playlist) {
        if(err) {
            console.log(`add_playlist err: ${JSON.stringify(err)}`);
	          res.writeHead(200, {"Content-Type": "application/json"});
	          res.end(JSON.stringify({result: err}));
            return;
        } 
        let playlist_title = playlist.title;
	      register_playlist(playlist_id, playlist_title).then(
            list_episodes(playlist_id, 10).then(function(r) {
	              res.writeHead(200, {"Content-Type": "application/json"});
	              res.end(JSON.stringify({result: 'success'}));
	              for (var i = 0, len = r.length; i < len; i++) {
		                let url = r[i].url;
		                let uploadDate = r[i].uploadDate;
		                let title = r[i].title;
		                // episode_id will be used as _id and it can not start with underscore in CouchDB
		                let episode_id = url.substr(url.lastIndexOf('/') + 1);
		                let episode_file_name = url.substr(url.lastIndexOf('/') + 1) + '.m4a';
		                let episode_s3_url = bucket_url + episode_file_name;
		                check_file(episode_file_name).then(function() {
		                    console.log("File already existing in S3 or is being uploaded, no need to upload.");
		                }, function() {
		                    // it's a new file, go download and upload to Object Storage
		                    console.log("File not in S3, go fetching and uploading...");
		                    register_episode(playlist_id, episode_id, episode_s3_url, title, playlist_title, uploadDate);
		                    fetch_episode(url).catch(function(e) {
			                      console.log(e);
		                    });
                    });
	              }
	          })
	          .catch(function (e){
	              var r = JSON.stringify(e);
	              console.log(r);
	              res.send(r);
	          }));
    });
}

// return the last n episodes of a playlist
function list_episodes(playlist, n) {
    return new Promise(function(resolve, reject) {
        ytpl(playlist, async function(err, pl) {
            if(err) {
                reject(err);
            };
            let a = [];
            let pl_latest = pl.items.reverse().slice(0, n);
	          for (let i = 0, len = pl_latest.length; i < len; i++) {
                let id = pl_latest[i].id;
                let title = pl_latest[i].title;
                let info = null;
                try {
                    info = await ytdl.getInfo(id);
                } catch (e) {
                    console.log(`list_episodes: ytdl.getInfo error: ${e}`);
                    continue;
                }
                let uploadDate = info.player_response.microformat.playerMicroformatRenderer.uploadDate;
                a.push({url: id,
                        uploadDate: uploadDate,
			                  title: title});
            }
            resolve(a);
        });
    });
}

// download a single episode and return the S3 url
function fetch_episode(url) {
    console.log("Fetching episode, url = : ", url); // sample url: PYF8Y47qZQY
    return new Promise(function(resolve, reject) {
	      var passthrough = new stream.PassThrough()
	          .on('error', (err) => {
		            console.log('passThrough-error')
	          })
	          .on('end', () => {
		            console.log('passThrough-end')
	          })
	          .on('close', () => console.log('passThrough-close'))
	          .on('unpipe', () => console.log('passThrough-unpipe'))
	          .on('finish', () => console.log('passThrough-finish'));
	      ytdl(url, {filter: 'audioonly'})
	          .pipe(passthrough);
	      var uploader = new streamingS3(passthrough,
				                               {
					                                 accessKeyId: accessKeyId,
					                                 secretAccessKey: secretAccessKey,
					                                 region: "us-standard",
					                                 endpoint: endpoint,
					                                 sslEnabled: true
				                               },
				                               {
					                                 Bucket: 'yt-rss',
					                                 Key: url.substr(url.lastIndexOf('/') + 1) + '.m4a',
					                                 ACL: 'public-read',
					                                 ContentType: 'audio/mp4a'
				                               }
				                              );

	      uploader.begin();
	      uploader.on('data', function (bytesRead) {
	          process.stdout.write('.');
	      });
	      uploader.on('part', function (number) {
	          console.log('Part ', number, ' uploaded.');
	      });
	      // All parts uploaded, but upload not yet acknowledged.
	      uploader.on('uploaded', function (stats) {
	          console.log('On signal "uploaded", stats: ', stats);
	      });
	      uploader.on('finished', function (resp, stats) {
	          // resp.Location => s3 file url
	          console.log('On signal "finished", stats: ', stats);
	          resolve(resp.Location);
	      });
	      uploader.on('error', function (e) {
	          console.log('Upload error: ', e);
	          reject(e);
	          return;
	      });
    });
}

// register the episode in CouchDB
function register_episode(playlist,
			                    episode_id,
			                    s3_url,
			                    title,
			                    playlist_title,
                          uploadDate) {
    query = `
MERGE (f:Feed {id: "${playlist}", title: "${playlist_title}"})
MERGE (f)-[:HAS]->(e:Episode {id: "${episode_id}", s3_url: "${s3_url}", title: "${title}", uploadDate: "${uploadDate}"})
RETURN e.id
`;
    console.log(`register_episode, query: ${query}`);
    cypher(query, {}, function (err, data) {
        if (err) {
            console.log("err: " + JSON.stringify(err));
        } else {
            console.log("data: " + JSON.stringify(data));
        }
    });
}

exports.playlist_feed = function(req, res) {
    var url = req.url; // /api/feed/PLhQSOxFylseE_9B7Brn7E6ok9expnYiey
    playlist_to_feed(url.substr(url.lastIndexOf('/') + 1)).then(function(body) {
	      res.writeHead(200, {"Content-Type": "application/rss+xml"});
	      res.end(body);
    }).catch(function(e) {
	      res.writeHead(200, {"Content-Type": "application/json"});
	      res.end(JSON.stringify({result: e}));
    });
}

function parseDateString(s) {
    return new Date(s);
}

// https://www.npmjs.com/package/feed
function playlist_to_feed(playlist) {
    return new Promise(function(resolve, reject) {
	      playlist_info(playlist).then(function(title) {
	          let feed = new Feed({
		            title: title
		            // id: 'http://example.com/',
		            // link: 'http://example.com/',
	          });
            let query = `MATCH (Feed {id: "${playlist}"})-[:HAS]->(e:Episode) RETURN e.title, e.s3_url, e.uploadDate;`;
            cypher(query, {}, function (err, data) {
                if (err) {
                    console.log("playlist_to_feed err: " + JSON.stringify(err));
                    reject(err);
                } else {
                    console.log("playlist_to_feed data: " + JSON.stringify(data));
                    let e = data.results[0].data;
	                  for (let i = 0, len = e.length; i < len; i++) {
                        let t = e[i].row[0];
                        let url = e[i].row[1];
                        let d = e[i].row[2];
                        feed.addItem({
			                      title: t,
			                      link: url,
                            date: parseDateString(d)
                        });
                    }
                    resolve(feed.rss2());
                }
            });
	      }).catch(function(e) {
	          reject(e);
	      });
    })
}

function register_playlist(playlist, title) {
    return new Promise(function(resolve, reject) {
        query = `
MERGE (feeds:Feeds {user_id: ${current_user_id}, user_name: "${current_user_name}"})
MERGE (feed:Feed {id: "${playlist}", title: "${title}"})
MERGE (feeds)-[:HAS]->(feed)
RETURN feed.id`;
        console.log(`register_playlist, query: ${query}`);
        cypher(query, {}, function (err, data) {
            if (err) {
                console.log("err: " + JSON.stringify(err));
                reject(err);
            } else {
                console.log("data: " + JSON.stringify(data));
                resolve(data);
            }
        });
    });
}

function playlist_info(playlist) {
    return new Promise(function(resolve, reject) {
        query = `
MATCH (f:Feed {id: "${playlist}"})
RETURN f.title
`;
        console.log(`playlist_info, query: ${query}`);
        cypher(query, {}, function (err, data) {
            if (err) {
                console.log("err: " + JSON.stringify(err));
                reject(err);
            } else {
                console.log("data: " + JSON.stringify(data));
                try {
                    let title = data.results[0].data[0].row[0];
                    resolve(title);
                } catch (e) {
                    reject(e);
                }
            }
        });
    });
}

function check_file(file) {	
    return new Promise(function(resolve, reject) {
	      var client = s3.createClient({
	          maxAsyncS3: 20, // this is the default
	          s3RetryCount: 3, // this is the default
	          s3RetryDelay: 1000, // this is the default
	          multipartUploadThreshold: 20971520, // this is the default (20 MB)
	          multipartUploadSize: 15728640, // this is the default (15 MB)
	          s3Options: {
		            accessKeyId: accessKeyId,
		            secretAccessKey: secretAccessKey,
		            region: "us-standard",
		            endpoint: endpoint,
		            sslEnabled: true
		            // any other options are passed to new AWS.S3()
		            // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property
	          }
	      });

	      client.s3.headObject({
	          Bucket: 'yt-rss',
	          Key: file
	      }, function(err, data) {
	          if (err) {
		            // file does not exist (err.statusCode == 404)
                let e = file.substr(0, file.lastIndexOf('.'));
                query = `MATCH (e:Episode {id: "${e}"}) RETURN e.id`;
                console.log(`check_file, query: ${query}`);
                cypher(query, {}, function (err, data) {
                    if (err) {
                        console.log("err: " + JSON.stringify(err));
                        reject();
                        return;
                    } else {
                        console.log("data: " + JSON.stringify(data));
                        console.log("data.length: " + data.results[0].data.length);
                        if (data.results[0].data.length == 0) {
                            // file is not registered
                            console.log("file not in registry");
                            reject();
                            return;
                        } else {
                            // we have registered that file already so it might have been downloaded
                            // future improvement will be setting expiry of downloading based on timestamp
                            console.log("file is in registry");
                            resolve();
                            return;
                        }
                    }
                });
	          } else {
	              // file exists
	              resolve();
                return;
            }
	      });
    });
}

// retrieve playlist id from channel or user URLs
// curl --data "url=https://www.youtube.com/channel/UC9nnWZ9kRiNZ6d5UwF-sNKQ" http://localhost:6003/api/url
exports.process_url = function(req, res) {
    let url = req.body.url;
    url = 'https://' + url.match(/https?:\/\/([^\s]+)/)[1];
    // http won't work, has to convert to https
    console.log("Converted to URL: " + url); 
    if (url.startsWith('https://www.youtube.com/user/') || 
        url.startsWith('http://www.youtube.com/user/') || 
        url.startsWith('https://www.youtube.com/channel/') || 
	      url.startsWith('http://www.youtube.com/channel/')) {

        // convert from channel to playlist id
        ytpl.getPlaylistID(url, function(err, id) {
	          console.log(`channel playlist: ${id}`);
	          res.writeHead(200, {"Content-Type": "application/json"});
	          res.end(JSON.stringify({playlist_id: id}));
        });
    } else {
	      res.writeHead(200, {"Content-Type": "application/json"});
	      res.end(JSON.stringify({error: "Wrong URL format"}));
    }
}

// input sample: [ {Key: 'B7bqAsxee4I.m4a'}, {Key: 'BlKWMKpSiW0.m4a'} ];
function s3_delete_files(files) {	
    return new Promise(function(resolve, reject) {
	      console.log(`Files to be deleted from S3: ${JSON.stringify(files)}`);
	      if (files.length == 0) {
	          console.log(`s3_delete_files: input error - empty array`);
	          reject('input error: empty array');
	          return;
	      }
	      var client = s3.createClient({
	          maxAsyncS3: 20, // this is the default
	          s3RetryCount: 3, // this is the default
	          s3RetryDelay: 1000, // this is the default
	          multipartUploadThreshold: 20971520, // this is the default (20 MB)
	          multipartUploadSize: 15728640, // this is the default (15 MB)
	          s3Options: {
		            accessKeyId: accessKeyId,
		            secretAccessKey: secretAccessKey,
		            region: "us-standard",
		            endpoint: endpoint,
		            sslEnabled: true
	          }
	      });

	      let params = {
	          Bucket: 'yt-rss',
	          Delete: {Objects: files},
	          Quiet: false
	      };
	      let d = client.deleteObjects(params);
	      d.on('error', function(err) {
	          console.log(`Error while deleting S3 files: err`);
	          reject(err);
	      });
	      d.on('end', function() {
	          console.log(`S3 files deletion complete`);
	          resolve('delete complete');
	      });
    });
}

function remove_playlist(playlist) {
    return new Promise(function(resolve, reject) {
        // list all the episodes under this feed/playlist
        let query = `MATCH (Feed {id: "${playlist}"})-[:HAS]->(e:Episode) RETURN e.id, e.s3_url;`;
        cypher(query, {}, function (err, data) {
            if (err) {
                console.log("remove_playlist err: " + JSON.stringify(err));
                reject();
            } else {
                console.log("remove_playlist list of episodes: " + JSON.stringify(data));
                let files_to_delete = [];
                let episodes = data.results[0].data;
	              for (let i = 0, len = episodes.length; i < len; i++) {
                    let s3_url = episodes[i].row[1];
                    let s3_file_name = s3_url.substr(s3_url.lastIndexOf('/') + 1);
                    files_to_delete.push({Key: s3_file_name});
                }
                console.log("remove_playlist list of s3 file names: " + JSON.stringify(files_to_delete));
                s3_delete_files(files_to_delete).then(function() {
			              console.log("s3 files deleted");
			          }).catch(function(e) {
			              console.log("s3 file deletion error: " + e);
			              reject('s3 file deletion error:' + e);
			              return;
			          });

                // now, delete the registry of playlist
                // this query needs to be updated when multi-user is supported, as more than one user can point to the same Feed
                let query = `MATCH (f:Feed {id: "${playlist}"})-[rel:HAS]->(e:Episode) DETACH DELETE f, rel, e;`;
                console.log(`remove_playlist, query: ${query}`);
                cypher(query, {}, function (err, data) {
                    if (err) {
                        console.log("remove_playlist err: " + JSON.stringify(err));
                        reject();
                    } else {
                        console.log("remove_playlist done: " + JSON.stringify(data));
                        resolve();
                    }
                });
            }
        });
    });
}

exports.remove_playlist = function(req, res) {
    var url = req.url; 
    var playlist = url.substr(url.lastIndexOf('/') + 1);
    console.log(`playlist: ${playlist}`);
    remove_playlist(playlist)
	      .then(function() {
	          res.writeHead(200, {"Content-Type": "application/json"});
	          res.end(JSON.stringify({result: "success"}));
	      })
	      .catch(function () {
	          res.writeHead(200, {"Content-Type": "application/json"});
	          res.end(JSON.stringify({result: "failure"}));
	      });
}

exports.list_feeds_json = function(req, res) {
    query = `MATCH (f:Feed) RETURN f.id, f.title;`;
    console.log(`list_feeds_json, query: ${query}`);
    let list = [];
    cypher(query, {}, function (err, data) {
        if (err) {
            console.log("list_feeds_json err: " + JSON.stringify(err));
            reject();
        } else {
            console.log("list_feeds_json data: " + JSON.stringify(data));
            res.writeHead(200, {"Content-Type": "application/json; charset=utf-8"});
            let r = data.results[0].data;
            for (let i = 0, len = r.length; i < len; i++) {
                let id = r[i].row[0];
                let title = r[i].row[1];
                list.push({id: id, title: title});
            }
	          console.log(JSON.stringify(list));
            res.write(JSON.stringify({playlists: list}));
	          res.end();
        }
    });
};

exports.playlist_info = function(req, res) {
    let url = req.url; // /api/info/playlist/PLhQSOxFylseE_9B7Brn7E6ok9expnYiey
    let playlist = url.substr(url.lastIndexOf('/') + 1);
    playlist_info(playlist).then(function(title) {
        res.writeHead(200, {"Content-Type": "application/json"});
	      res.end(JSON.stringify({result: 'success', info: {title: title}})); 
    }).catch(function(e) {
    });
};
