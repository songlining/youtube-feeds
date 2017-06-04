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

const spawn = require('child_process').spawn;
var yt_cmd = '/usr/local/bin/youtube-dl';

var ytdl = require('ytdl-core');
var streamingS3 = require('streaming-s3');
var stream = require('stream');
const Feed = require('feed');
var s3 = require('s3');

var config = require('../env.json');
var accessKeyId = config.object_storage.accessKeyId;
var secretAccessKey = config.object_storage.secretAccessKey;
var endpoint=config.object_storage.endpoint;
var bucket_url =config.object_storage.bucket_url;
var db_url = config.couchdb.db_url;

var prom = require('nano-promises');
var nano = require('nano')(db_url);
var db = prom(nano).db.use('yt_rss');

// add one playlist and download the episodes
exports.add_playlist = function(req, res) {
    var url = req.url; 
    var playlist_id = url.substr(url.lastIndexOf('/') + 1);
    list_episodes(playlist_id, 10)
	.then(function(r) {
	    res.writeHead(200, {"Content-Type": "application/json"});
	    res.end(JSON.stringify({result: 'success'}));
	    for (var i = 0, len = r.length; i < len; i++) {
		let url = r[i].url;
		let title = r[i].title;
		let upload_date = r[i].upload_date;
		let playlist_title = r[i].playlist_title;
		// episode_id will be used as _id and it can not start with underscore in CouchDB
		let episode_id = 'episode:' + url.substr(url.lastIndexOf('/') + 1);
		let episode_file_name = url.substr(url.lastIndexOf('/') + 1) + '.m4a';
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
function list_episodes(playlist, n) {
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
		return;
	    }
	    var a = [];
	    try {
		var playlist_title = j.title;
	    } catch (e) {
		console.log("Got error, reject the promise.")
		reject(e);
		return;
	    }
	    register_playlist('playlist:' + playlist, {title: playlist_title});
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
	    return;
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
		console.log(`Warning: Episode ${title}: ${episode_id} already in registry.`);
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
	res.writeHead(200, {"Content-Type": "application/rss+xml"});
	res.end(body);
    }).catch(function(e) {
	res.writeHead(200, {"Content-Type": "application/json"});
	res.end(JSON.stringify({result: e}));
    });
}

function parseDateString(s) {
    let year = s.substring(0,4);
    let month = s.substring(4,6);
    let day = s.substring(6);
    return new Date(`${year}-${month}-${day}`);
}

// https://www.npmjs.com/package/feed
function playlist_to_feed(playlist) {
    return new Promise(function(resolve, reject) {
	playlist_info('playlist:' + playlist).then(function(info) {
	    let feed = new Feed({
		title: info.title
		// id: 'http://example.com/',
		// link: 'http://example.com/',
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
			   let d = r[i].doc.upload_date;
			   feed.addItem({
			       title: t,
			       link: url,
			       date: parseDateString(d)
			   });
		       }
		       resolve(feed.rss2());
		   }).catch(function(err) {
		       reject(err);
		       return;
		   });
	}).catch(function(e) {
	    reject(e);
	});
    })
}

function register_playlist(playlist, info) {
    return new Promise(function(resolve, reject) {
	db.get(playlist).then(function(r) {
	    console.log(playlist + " already registered.");
	    resolve();
	}).catch(function(e) {
	    if (e.statusCode = 404) {
		// playlist does not exist in registry
		db.insert({type: "playlist", info: info}, playlist).then(function([body, headers]) {
		    console.log(playlist + " registered");
		    resolve();
		}).catch(function(e) {
		    console.log("Error registering " + playlist + ". Error: " + e);
		    reject(e);
		    return;
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
	    return;
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
		return;
	    }
	    // file exists
	    resolve(data);
	});
    });
}

exports.list_feeds = function(req, res) {
    db.view("playlist",
	    "playlists",
	    {
		descending:true,
		include_docs:true
	    }
	   ).then(function([body, headers]) {
	       let r = body.rows;
	       res.writeHead(200, {'Content-Type': 'text/html'});
	       res.write(
		   `<!DOCTYPE html>
		       <html>
		       <head>
		       <meta charset="UTF-8">
		       <title>Youtube Feeds</title>
		       </head>
		       <body>
		       <table>`
	       );
	       for (let i = 0, len = r.length; i < len; i++) {
		   let id = r[i].doc._id;
		   let playlist_id = id.substr(id.lastIndexOf(':') + 1);
		   let title = r[i].doc.info.title;
		   res.write(
		       `
			   <tr>
			   <td><a href="/api/feed/${playlist_id}">${title}</a></td>
			   <td><a href="/api/playlist/${playlist_id}"><img border="0" alt="reload podcast" src="https://cdn0.iconfinder.com/data/icons/BrushedMetalIcons_meBaze/24/Reload-03.png" width="24" height="24"></a></td>
			   </tr>`
		   );
	       }
	       res.write(`</table></body></html>`);
	       res.end();
	   }).catch(function(err) {
	       console.log(err);
	       res.writeHead(200, {"Content-Type": "application/json"});
	       res.end(JSON.stringify({result: "playlist not found"}));
	   });
};

// retrieve playlist id from channel or user URLs
// curl --data "url=https://www.youtube.com/channel/UC9nnWZ9kRiNZ6d5UwF-sNKQ" http://localhost:6003/api/url
exports.process_url = function(req, res) {
    let url = req.body.url;
    if (url.startsWith('https://www.youtube.com/user/') || 
	url.startsWith('https://www.youtube.com/channel/')) {
	let read_buffer = '';
	let cmd = spawn(yt_cmd, 
			[url,
			 '-J', 
			 '--ignore-errors', 
			 '--playlist-end=1']);
	
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
		console.log(e);
	    }
	    let playlist_url = j.webpage_url;
	    var playlist_id = playlist_url.substr(playlist_url.lastIndexOf('=') + 1);
	    res.writeHead(200, {"Content-Type": "application/json"});
	    res.end(JSON.stringify({playlist_id: playlist_id}));
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
		   if (r.length == 0) {
		       console.log("No episodes exist under this playlist");
		       // need to check whether the playlist doc is still there, 
		       delete_playlist_doc(playlist)
			   .then(function(data) {
			       console.log(`Playlist ${playlist} has been deleted`)
			       reject("playlist doc has been deleted");
			   })
			   .catch(function(e) {
			       console.log(`Playlist ${playlist} does not exist: ${e}`)
			       reject("playlist doc non-exist");
			   });
		       return;
		   }
		   let files_to_delete = [];
		   for (let i = 0, len = r.length; i < len; i++) {
		       let doc = r[i].doc;
		       let pl = doc.playlist;
		       let url = doc.s3_url;
		       let id = doc._id;
		       let rev = doc._rev;
		       // remove the playlist from the array
		       let index = pl.indexOf(playlist);
		       if (index > -1) {
			   pl.splice(index, 1);
		       }
		       if (pl.length == 0) {
			   // array is empty, episode will be removed
			   let s3_file_name = url.substr(url.lastIndexOf('/') + 1);
			   files_to_delete.push({Key: s3_file_name});
			   // remove the doc
			   console.log(`removing ${doc}`);
			   db.destroy(id, rev).catch(function(err) {
			       console.error(err);
			   });
		       } else if (pl.length > 0) {
			   // array is not empty yet, episode will be kept. doc.playlist will be updated
			   doc.playlist = pl;
			   db.insert(doc)
			       .then(function(r) {
			       	   console.log("Episode " + id + ": playlist updated.")
			       })
			       .catch(function(err) {
				   console.log("Episode playlist update error: " + err)
			       });
		       }
		   }
		   // playlist doc to be removed
		   delete_playlist_doc(playlist)
		       .then(function(data) {
			   console.log(`Playlist ${playlist} has been deleted`)
		       })
		       .catch(function(e) {
			   console.log(`Playlist ${playlist} deletion error: ${e}`)
		       });
		   if (files_to_delete.length > 0) {
		       s3_delete_files(files_to_delete)
			   .then(function() {
			       console.log("s3 files deleted");
			   })
			   .catch(function(e) {
			       console.log("s3 file deletion error: " + e);
			       reject('s3 file deletion error:' + e);
			       return;
			   });
		   }
		   resolve(playlist); 
	       }).catch(function(err) {
		   reject(err);
		   return;
	       });
    })
}

function delete_playlist_doc(playlist) {
    return new Promise(function(resolve, reject) {
	db.get(`playlist:${playlist}`)
	    .then(function([body, headers]) {
		db.destroy(body._id, body._rev)
		    .then(function([body, headers]) {
			console.log(`playlist doc ${playlist} destroyed`);
			resolve(playlist);
		    })
		    .catch(function(err) {
			console.error(`Removing playlist doc with error: ${err}`);
			reject('error destroying playlist doc' + err);
		    })
			})
	    .catch(function(err) {
		console.error(`Get playlist doc with error: ${err}`);
		reject(err);
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
    db.view("playlist",
	    "playlists",
	    {
		descending:true,
		include_docs:true
	    }
	   ).then(function([body, headers]) {
	       let r = body.rows;
	       let list = [];
	       res.writeHead(200, {"Content-Type": "application/json; charset=utf-8"});
	       for (let i = 0, len = r.length; i < len; i++) {
		   let id = r[i].doc._id;
		   let playlist_id = id.substr(id.lastIndexOf(':') + 1);
		   let title = r[i].doc.info.title;
		   list.push({id: playlist_id, title: title});
	       }
	       res.write(JSON.stringify({playlists: list}));
	       res.end();
	   }).catch(function(err) {
	       console.log(err);
	       res.writeHead(200, {"Content-Type": "application/json"});
	       res.end(JSON.stringify({result: "playlist not found"}));
	   });
};
