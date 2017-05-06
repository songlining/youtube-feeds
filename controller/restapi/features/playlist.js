/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
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

const spawn = require('child_process').spawn;
var yt_cmd = '/usr/local/bin/youtube-dl';

var ytdl = require('ytdl-core');
var streamingS3 = require('streaming-s3');
var stream = require('stream');
const Feed = require('feed');
var s3 = require('s3');

var config = require('../../env.json');
var accessKeyId = config.object_storage.accessKeyId;
var secretAccessKey = config.object_storage.secretAccessKey;
var endpoint=config.object_storage.endpoint;
var bucket_url =config.object_storage.bucket_url;
var db_url = config.couchdb.db_url;

var prom = require('nano-promises');
var nano = require('nano')(db_url);
var db = prom(nano).db.use('yt_rss');

// test for a short one: curl -X PUT http://localhost:6003/api/playlist/PLtq51fIaqF1tvW9savyaRWlhkpeBYYhWr
// returns: [{"url":"tuSsCHhrpV8","title":"FT Sportster - Build | Flite Test"},{"url":"8l__ooIUCho","title":"FT Bronco Build | Flite Test"}]
exports.show_episodes = function(req, res) {
    var url = req.url; // /api/playlist/PLhQSOxFylseE_9B7Brn7E6ok9expnYiey
    playlist_episodes(url.substr(url.lastIndexOf('/') + 1), 5)
	.then(function(r) {
	    res.send(JSON.stringify(r));
	})
	.catch(function (e){
	    var r = JSON.stringify(e);
	    console.log(r);
	    res.send(r);
	});
}

// add one playlist and download the episodes
exports.add_playlist = function(req, res) {
    var url = req.url; 
    var playlist_id = url.substr(url.lastIndexOf('/') + 1);
    playlist_episodes(playlist_id, 5)
	.then(function(r) {
	    res.end("Upload in progress...");
	    for (var i = 0, len = r.length; i < len; i++) {
		let url = r[i].url;
		let title = r[i].title;
		let upload_date = r[i].upload_date;
		let playlist_title = r[i].playlist_title;
		let episode_id = url.substr(url.lastIndexOf('/') + 1);
		let episode_file_name = episode_id + '.m4a';
		let episode_s3_url = bucket_url + episode_file_name;
		check_file(episode_file_name).then(function() {
		    console.log("File already existing in Object Storage, no need to upload.");
		}).catch(function() {
		    // it's a new file, go download and upload to Object Storage
		    console.log("File not in ICOS, go fetching and uploading...");
		    fetch_episode(url).catch(function(e) {
			console.log(e);
		    });
		});
		register_episode(playlist_id, episode_id, episode_s3_url, title, upload_date, playlist_title);
	    }
	})
	.catch(function (e){
	    var r = JSON.stringify(e);
	    console.log(r);
	    res.send(r);
	});
}

// return the last n episodes of a playlist
function playlist_episodes(playlist, n) {
    return new Promise(function(resolve, reject) {
	let read_buffer = '';
	let cmd = spawn(yt_cmd, 
			['https://www.youtube.com/playlist?list=' + playlist, 
			 '-J', 
			 '--ignore-errors', 
			 '--playlist-end=' + n]);
	
	cmd.stdout.on('data', (data) => {
	    read_buffer = read_buffer + data;
	});
	cmd.stderr.on('data', (data) => {
	    console.log(`stderr: ${data}`);
	});
	cmd.on('close', (code) => {
	    console.log(`child process exited with code ${code}`);
	    try {
		var j = JSON.parse(read_buffer);
	    } catch(e) {
		reject(e);
	    }
	    console.log(j);
	    var a = [];
	    var playlist_title = j.title;
	    register_playlist(playlist, {title: playlist_title});
	    j.entries.forEach(function(e) {
		// a private episode can be a null value in the array
		// to test: 
		// curl -X PUT http://localhost:6003/api/playlist/PLATwx1z00HsdanKZcTMQEc-n_Bhu_aZ76
		if (e != null) {
		    a.push({url: e.id,
			    title: e.title,
			    upload_date: e.upload_date,
			    playlist_title: playlist_title});
		}
	    });
	    resolve(a);
	});
    })
}

// download a single episode and return the S3 url
function fetch_episode(url) {
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
	    // console.log(bytesRead, ' bytes read.');
	    process.stdout.write('.');
	});
	uploader.on('part', function (number) {
	    console.log('Part ', number, ' uploaded.');
	});
	// All parts uploaded, but upload not yet acknowledged.
	uploader.on('uploaded', function (stats) {
	    console.log('Upload stats: ', stats);
	});
	uploader.on('finished', function (resp, stats) {
	    // resp.Location => s3 file url
	    resolve(resp.Location);
	});
	uploader.on('error', function (e) {
	    console.log('Upload error: ', e);
	    uploader.end();
	    reject(e);
	});
    })
}

// register the episode in CouchDB
function register_episode(playlist,
			  episode_id,
			  s3_url,
			  title,
			  upload_date,
			  playlist_title) {
    var doc = {playlist: [playlist],
	       episode_id: episode_id,
	       s3_url: s3_url,
	       title: title,
	       upload_date: upload_date,
	       playlist_title: playlist_title,
	       type: 'episode' // the other type is 'playlist'
	      };
    console.log(" Before nano insert, doc: " + JSON.stringify(doc));
    db.insert(doc, episode_id)
	.then(function([body, headers]) {
	    console.log("Episode " + episode_id + " registered.")
	})
	.catch(function(err) {
	    if (err.statusCode == 409 && err.error == 'conflict') {
		console.log("Warning: Episode already in registry.");
		db.get(episode_id).then(function(r) {
		    let e = r[0];
		    let rev = e._rev;
		    if (e.playlist.indexOf(playlist) == -1) {
			// the new playlist is not in the existing episode's playlists
			console.log("Adding playlist " + playlist + " to episode " + episode_id);
			e.playlist.push(playlist);
			// update back to registry
			db.insert(e).catch(function(err) {
			    console.log("Insert error: " + err);
			});
		    }
		});
	    }
	});
}

exports.playlist_feed = function(req, res) {
    var url = req.url; // /api/feed/PLhQSOxFylseE_9B7Brn7E6ok9expnYiey
    playlist_to_feed(url.substr(url.lastIndexOf('/') + 1)).then(function(body) {
	res.send(body);
    });
}

// https://www.npmjs.com/package/feed
function playlist_to_feed(playlist) {
    return new Promise(function(resolve, reject) {
	playlist_info(playlist).then(function(info) {
	    let feed = new Feed({
		title: info.title,
		// id: 'http://example.com/',
		// link: 'http://example.com/',
		updated: new Date()
	    });
	    db.view("playlist",
		    "episodes",
		    {
			startkey:[playlist, {}],
			endkey:[playlist, null],
			descending:true,
			include_docs:true
		    }
		   ).then(function([body, headers]) {
		       let r = body.rows;
		       for (let i = 0, len = r.length; i < len; i++) {
			   let t = r[i].doc.title;
			   let url = r[i].doc.s3_url;
			   feed.addItem({
			       title: t,
			       link: url
			   });
		       }
		       resolve(feed.rss2());
		   }).catch(function(err) {
		       reject(err);
		   });
	});
    })
}

function register_playlist(playlist, info) {
    return new Promise(function(resolve, reject) {
	db.get(playlist).then(function(r) {
	    console.log("Playlist " + playlist + " already registered.");
	    resolve();
	}).catch(function(e) {
	    if (e.statusCode = 404) {
		// playlist does not exist in registry
		db.insert({type: "playlist", info: info}, playlist).then(function([body, headers]) {
		    console.log("Playlist " + playlist + " registered");
		    resolve();
		}).catch(function(e) {
		    console.log("Error registering playlist " + playlist + ". Error: " + e);
		    reject(e);
		});
	    }
	});
    });
}

function playlist_info(playlist) {
    return new Promise(function(resolve, reject) {
	db.get(playlist).then(function(r) {
	    resolve(r[0].info)
	}).catch(function(e) {
	    reject(e);
	});
    })
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
		reject(err);
	    }
	    // file exists
	    resolve(data);
	});
    });
}
