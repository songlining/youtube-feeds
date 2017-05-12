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
var express = require('express');
var router = express.Router();
var playlist = require('./features/playlist');

module.exports = router;

// router.get('/api/playlist/*', playlist.show_episodes);
router.get('/api/playlist/*', playlist.add_playlist);
router.get('/api/feed/*', playlist.playlist_feed);
router.post('/api/url', playlist.process_url);
router.get('/index.html', playlist.list_feeds);
