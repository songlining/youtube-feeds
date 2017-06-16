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
var restapi = require('./restapi/index');
var frontend = require('./frontend/index');

module.exports = router;

router.get('/api/playlist/*', restapi.add_playlist);
router.delete('/api/playlist/*', restapi.remove_playlist);
router.get('/api/feed/*', restapi.playlist_feed);
router.get('/api/info/playlist/*', restapi.playlist_info);
router.post('/api/url', restapi.process_url);
// router.get('/index.html', restapi.list_feeds);
router.get('/api/playlists', restapi.list_feeds_json);

router.get('/', frontend.homepage);
