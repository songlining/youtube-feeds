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

const ytpl = require('@distube/ytpl');
const ytdl = require('@distube/ytdl-core');
const stream = require('stream');
const { Feed } = require('feed');
const { S3Client, HeadObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const axios = require('axios');

var config = require('../env.json');
var accessKeyId = config.object_storage.accessKeyId;
var secretAccessKey = config.object_storage.secretAccessKey;
var endpoint=config.object_storage.endpoint;
var bucket_url =config.object_storage.bucket_url;
var neo4j_url = config.neo4j.url;
var neo4j_username = config.neo4j.username;
var neo4j_password = config.neo4j.password;

// Initialize S3 Client
const s3Client = new S3Client({
    credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey
    },
    region: 'us-standard',
    endpoint: endpoint,
    forcePathStyle: true // Required for non-AWS S3 compatible services
});

// for future user features
var current_user_id = "0";
var current_user_name = "larry";

// add one playlist and download the episodes
exports.add_playlist = async function(req, res) {
    var playlist_id = req.params.id;
    try {
        const playlist = await ytpl(playlist_id, {limit: 1});
        let playlist_title = escape(playlist.title);
        await register_playlist(playlist_id, playlist_title);
        const r = await list_episodes(playlist_id, 10);
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify({result: 'success'}));

        for (var i = 0, len = r.length; i < len; i++) {
            let url = r[i].url;
            let title = escape(r[i].title);
            // episode_id will be used as _id and it can not start with underscore in CouchDB - this limitation
            // is obsolete as we are using neo4j now.
            let episode_id = url.substr(url.lastIndexOf('/') + 1);
            let episode_file_name = url.substr(url.lastIndexOf('/') + 1) + '.m4a';
            let episode_s3_url = bucket_url + episode_file_name;
            check_file(playlist_id, episode_file_name).then(function(result) {
                switch (result) {
                case 0:
                    // file not in registry, not in S3
                    register_episode(playlist_id, episode_id, episode_s3_url, title, playlist_title);
                    fetch_episode(url).catch(function(e) {
                        console.log(e);
                    });
                    break;
                case 1:
                    // file not in registry, in S3
                    register_episode(playlist_id, episode_id, episode_s3_url, title, playlist_title);
                    break;
                case 2:
                    // file is in registry, not in S3, Feed relationship exists
                    // assuming file is being downloaded, so no uploading to S3. Future version will have more granular measures.
                    break;
                case 3:
                    // file is in registry, not in S3, Feed relationship does not exist
                    register_feed_and_rel(playlist_id, episode_id);
                    break;
                case 4:
                    // in S3file is in registry, in S3, Feed relationship exists
                    break;
                case 5:
                    // file is in registry, in S3, Feed relationship does not exist
                    register_feed_and_rel(playlist_id, episode_id);
                    break;
                }
            }, function() {
            });
        }
    } catch(err) {
        console.log(`add_playlist err: ${JSON.stringify(err)}`);
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify({result: err.message || err}));
    }
}

exports.playlist_feed = function(req, res) {
    var playlist_id = req.params.id; // /api/feed/PLhQSOxFylseE_9B7Brn7E6ok9expnYiey
    playlist_to_feed(playlist_id).then(function(body) {
	      res.writeHead(200, {"Content-Type": "application/rss+xml"});
	      res.end(body);
    }).catch(function(e) {
	      res.writeHead(200, {"Content-Type": "application/json"});
	      res.end(JSON.stringify({result: e}));
    });
}

// retrieve playlist id from channel or user URLs
// curl --data "url=https://www.youtube.com/channel/UC9nnWZ9kRiNZ6d5UwF-sNKQ" http://localhost:6003/api/url
exports.process_url = async function(req, res) {
    let url = req.body.url;
    url = 'https://' + url.match(/https?:\/\/([^\s]+)/)[1];
    // http won't work, has to convert to https
    console.log("Converted to URL: " + url);
    if (url.startsWith('https://www.youtube.com/user/') ||
        url.startsWith('http://www.youtube.com/user/') ||
        url.startsWith('https://www.youtube.com/channel/') ||
        url.startsWith('http://www.youtube.com/channel/')) {

        try {
            // convert from channel to playlist id
            const id = await ytpl.getPlaylistID(url);
            console.log(`channel playlist: ${id}`);
            res.writeHead(200, {"Content-Type": "application/json"});
            res.end(JSON.stringify({playlist_id: id}));
        } catch(err) {
            console.log(`process_url err: ${JSON.stringify(err)}`);
            res.writeHead(200, {"Content-Type": "application/json"});
            res.end(JSON.stringify({error: err.message || "Failed to get playlist ID"}));
        }
    } else {
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify({error: "Wrong URL format"}));
    }
}

exports.remove_playlist = function(req, res) {
    var playlist = req.params.id;
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

exports.list_feeds_json = async function(req, res) {
    query = `MATCH (f:Feed) RETURN f.id, f.title;`;
    console.log(`list_feeds_json, query: ${query}`);
    let list = [];
    try {
        let data = await cypher_async(query, {});
        console.log("list_feeds_json data: " + JSON.stringify(data));
        res.writeHead(200, {"Content-Type": "application/json; charset=utf-8"});
        let r = data.results[0].data;
        for (let i = 0, len = r.length; i < len; i++) {
            let id = r[i].row[0];
            let title = unescape(r[i].row[1]);
            list.push({id: id, title: title});
        }
	      console.log(JSON.stringify(list));
        res.write(JSON.stringify({playlists: list}));
	      res.end();
    } catch (e) {
        console.log("list_feeds_json err: " + JSON.stringify(e));
	      res.writeHead(200, {"Content-Type": "application/json"});
	      res.end(JSON.stringify({result: e}));
        return;
    }
};

exports.playlist_info = function(req, res) {
    let playlist = req.params.id; // /api/info/playlist/PLhQSOxFylseE_9B7Brn7E6ok9expnYiey
    playlist_info(playlist).then(function(title) {
        res.writeHead(200, {"Content-Type": "application/json"});
	      res.end(JSON.stringify({result: 'success', info: {title: title}})); 
    }).catch(function(e) {
    });
};

// neo4j cypher REST call
function cypher(query,params,cb) {
    axios.post(neo4j_url, {
        statements: [{statement: query, parameters: params}]
    }, {
        auth: {
            username: neo4j_username,
            password: neo4j_password
        }
    })
    .then(res => cb(null, res.data))
    .catch(err => cb(err, null));
}

async function cypher_async(query,params) {
    try {
        const result = await axios.post(neo4j_url, {
            statements: [{statement: query, parameters: params}]
        }, {
            auth: {
                username: neo4j_username,
                password: neo4j_password
            }
        });
        return result.data;
    } catch (e) {
        throw e;
    }
}

// return the last n episodes of a playlist
async function list_episodes(playlist, n) {
    try {
        const pl = await ytpl(playlist, {limit: n});
        let a = [];
        let pl_latest = pl.items;
        for (let i = 0, len = pl_latest.length; i < len; i++) {
            let id = pl_latest[i].id;
            let title = pl_latest[i].title;
            a.push({url: id, title: title});
        }
        return a;
    } catch(err) {
        throw err;
    }
}

// download a single episode and return the S3 url
async function fetch_episode(url) {
    console.log("Fetching episode, url = : ", url); // sample url: PYF8Y47qZQY
    return new Promise((resolve, reject) => {
        const passthrough = new stream.PassThrough()
            .on('error', (err) => {
                console.log('passThrough-error', err);
                reject(err);
            })
            .on('end', () => {
                console.log('passThrough-end');
            })
            .on('close', () => console.log('passThrough-close'))
            .on('unpipe', () => console.log('passThrough-unpipe'))
            .on('finish', () => console.log('passThrough-finish'));

        const ytdlStream = ytdl(url, {
            filter: 'audioonly',
            quality: 'lowestaudio'
        });

        ytdlStream.on('error', (err) => {
            console.log('ytdl-error', err);
            passthrough.destroy();
            reject(err);
        });

        ytdlStream.pipe(passthrough);

        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: 'yt-rss',
                Key: url.substr(url.lastIndexOf('/') + 1) + '.m4a',
                ACL: 'public-read',
                ContentType: 'audio/mp4a',
                Body: passthrough
            }
        });

        upload.on('httpUploadProgress', (progress) => {
            if (progress.loaded && progress.total) {
                const percentage = Math.round((progress.loaded / progress.total) * 100);
                process.stdout.write(`\rUpload progress: ${percentage}%`);
            } else {
                process.stdout.write('.');
            }
        });

        upload.done()
            .then((result) => {
                console.log('\nUpload finished:', result.Location);
                resolve(result.Location);
            })
            .catch((err) => {
                console.log('Upload error: ', err);
                reject(err);
            });
    });
}

// register the episode
async function register_episode(
    playlist,
		episode_id,
		s3_url,
		title,
		playlist_title
) {
    let info = null;
    let uploadDate = new Date().toISOString();
    try {
        info = await ytdl.getInfo(episode_id);
        if (info && info.player_response && info.player_response.microformat && info.player_response.microformat.playerMicroformatRenderer) {
            uploadDate = info.player_response.microformat.playerMicroformatRenderer.uploadDate;
        }
    } catch (e) {
        console.log(`list_episodes: ytdl.getInfo error: ${e}`);
    }
    let query = `
MERGE (f:Feed {id: "${playlist}", title: "${playlist_title}"})
MERGE (f)-[:HAS]->(e:Episode {id: "${episode_id}", s3_url: "${s3_url}", title: "${title}", uploadDate: "${uploadDate}"})
RETURN e.id
`;
    console.log(`register_episode, query: ${query}`);
    try {
        let data = await cypher_async(query, {});
        console.log("data: " + JSON.stringify(data));
        return;
    } catch (err) {
        console.log("err: " + JSON.stringify(err));
    }
}

async function register_playlist(playlist, title) {
    query = `
MERGE (feeds:Feeds {user_id: ${current_user_id}, user_name: "${current_user_name}"})
MERGE (feed:Feed {id: "${playlist}", title: "${title}"})
MERGE (feeds)-[:HAS]->(feed)
RETURN feed.id`;
    console.log(`register_playlist, query: ${query}`);
    let data = await cypher_async(query, {});
    try {
        console.log("data: " + JSON.stringify(data));
        return data;
    } catch (e) {
        console.log("err: " + JSON.stringify(e));
    }
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
                        let t = unescape(e[i].row[0]);
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
                    resolve(unescape(title));
                } catch (e) {
                    reject(e);
                }
            }
        });
    });
}

async function check_file(playlist_id, file) {
    try {
        let s3error = null;

        // Check if file exists in S3
        try {
            await s3Client.send(new HeadObjectCommand({
                Bucket: 'yt-rss',
                Key: file
            }));
        } catch (err) {
            if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
                s3error = { code: 'NotFound' };
            } else {
                throw err;
            }
        }

        // Check if file is registered
        let e = file.substr(0, file.lastIndexOf('.'));
        const query = `
MATCH (e:Episode {id: "${e}"})
OPTIONAL MATCH (f:Feed {id: "${playlist_id}"})-[:HAS]->(e)
RETURN e.id, f.id
`;
        console.log(`check_file, query: ${query}`);

        const data = await cypher_async(query, {});
        console.log("data: " + JSON.stringify(data));
        console.log("data.length: " + data.results[0].data.length);

        if (data.results[0].data.length == 0) {
            if (s3error && s3error.code == 'NotFound') {
                // file is not registered, not in S3
                console.log(`file not in registry, not in S3`);
                return 0;
            } else {
                // file not in registry, in S3
                console.log("file not in registry, in S3");
                return 1;
            }
        } else {
            if (s3error && s3error.code == 'NotFound') {
                // file in registry, not in S3
                if (data.results[0].data[0].row[1]) {
                    // Feed relationship exists
                    console.log("file is in registry, not in S3, Feed relationship exists");
                    return 2;
                } else {
                    // Feed relationship doesn't not exist
                    console.log("file is in registry, not in S3, Feed relationship does not exist");
                    return 3;
                }
            } else {
                // file in registry, in S3
                if (data.results[0].data[0].row[1]) {
                    console.log("file is in registry, in S3, Feed relationship exists");
                    return 4;
                } else {
                    console.log("file is in registry, in S3, Feed relationship does not exist");
                    return 5;
                }
            }
        }
    } catch (error) {
        console.log("check_file error: " + JSON.stringify(error));
        throw error;
    }
}


// input sample: [ {Key: 'B7bqAsxee4I.m4a'}, {Key: 'BlKWMKpSiW0.m4a'} ];
async function s3_delete_files(files) {
    console.log(`Files to be deleted from S3: ${JSON.stringify(files)}`);
    if (files.length == 0) {
        console.log(`s3_delete_files: input error - empty array`);
        throw new Error('input error: empty array');
    }

    try {
        const params = {
            Bucket: 'yt-rss',
            Delete: {
                Objects: files,
                Quiet: false
            }
        };

        const result = await s3Client.send(new DeleteObjectsCommand(params));
        console.log(`S3 files deletion complete`, result);
        return 'delete complete';
    } catch (err) {
        console.log(`Error while deleting S3 files:`, err);
        throw err;
    }
}

async function remove_playlist(playlist) {
        // list all the episodes under this feed/playlist
        try {
            let query = `MATCH (Feed {id: "${playlist}"})-[:HAS]->(e:Episode) RETURN e.id, e.s3_url;`;
            let data = await cypher_async(query, {});
            console.log("remove_playlist list of episodes: " + JSON.stringify(data));
            let files_to_delete = [];
            let episodes = data.results[0].data;
            let episodes_in_registry = [];
	          for (let i = 0, len = episodes.length; i < len; i++) {
                // check if this episode is only associated with this playlist
                let eid = episodes[i].row[0];
                try {
                    query = `MATCH (e:Episode {id: "${eid}"})<-[rel:HAS]-(f:Feed) RETURN rel`;
                    let data = await cypher_async(query, {});
                    if (data.results[0].data.length > 1) {
                        // there are other Feed's pointing to this episode, we won't remove it from registry and S3
                        console.log(`remove_playlist, this episode has other Feed pointing to it.`);
                        continue;
                    } else {
                        // we can safely remove this episode from registry and S3
                        let s3_url = episodes[i].row[1];
                        let s3_file_name = s3_url.substr(s3_url.lastIndexOf('/') + 1);
                        files_to_delete.push({Key: s3_file_name});
                        episodes_in_registry.push(eid);
                    }
                } catch (error) {
                    throw error;
                }
            }
            console.log("remove_playlist list of s3 file names: " + JSON.stringify(files_to_delete));
            s3_delete_files(files_to_delete).then(function() {
			          console.log("s3 files deleted");
			      }).catch(function(e) {
			          console.log("s3 file deletion error: " + e);
			      });
            try {
                // now, delete the registry of playlist
                query = `MATCH (f:Feed {id: "${playlist}"}) DETACH DELETE f;`;
                console.log(`remove_playlist, query: ${query}`);
                data = await cypher_async(query, {});
                console.log("remove_playlist done: " + JSON.stringify(data));
            } catch (err) {
                console.log("remove_playlist err: " + JSON.stringify(err));
                throw err;
            }
            try {
                // delete the registry of episodes
                let l = JSON.stringify(episodes_in_registry);
                query = `MATCH (e:Episode) WHERE e.id in ${l} DETACH DELETE e`;
                console.log(`remove_playlist, query: ${query}`);
                data = await cypher_async(query, {});
                console.log("remove_playlist done: " + JSON.stringify(data));
            } catch (err) {
                console.log("remove_playlist err: " + JSON.stringify(err));
                throw err;
            }
        } catch (err) {
            console.log("remove_playlist err: " + JSON.stringify(err));
            throw err;
        }
}

function parseDateString(s) {
    return new Date(s);
}

async function register_feed_and_rel(playlist_id, episode_id) {
    let query = `
MATCH (e:Episode {id: "${episode_id}"})
MATCH (f:Feed {id: "${playlist_id}"})
MERGE (f)-[rel:HAS]->(e)
`;
    console.log(`register_feed_and_rel, query: ${query}`);
    try {
        let data = await cypher_async(query, {});
        console.log("data: " + JSON.stringify(data));
        return;
    } catch (err) {
        console.log("err: " + JSON.stringify(err));
    }
}
