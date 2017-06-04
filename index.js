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

var express = require('express');
var http = require('http');
var path = require('path');
var fs = require('fs');
var bodyParser = require('body-parser');

var app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('appName', 'youtube-feeds');
// disable the following line in Bluemix. App will start on port 6003 in Bluemix
app.set('port', process.env.PORT || 6003);
// enable the following line in Bluemix
// app.set('port', appEnv.port);

// prepare server
app.use('/js', express.static(__dirname + '/node_modules/jquery/dist')); // redirect JS jQuery

app.use('/js', express.static(__dirname + '/node_modules/clipboard/dist')); 

app.use('/js', express.static(__dirname + '/javascripts')); // local ones
app.use('/css', express.static(__dirname + '/css')); // local ones

app.set('views', path.join(__dirname + '/www'));
app.use(express.static(__dirname + '/www'));

app.set('view engine', 'pug');

// Define your own router file in controller folder, export the router, add it into the index.js.
// app.use('/', require("./controller/yourOwnRouter"));

app.use('/', require("./controller/router"));

http.createServer(app).listen(app.get('port'), function(req, res) {
    console.log(app.get('appName')+' is listening on port: ' + app.get('port'));
});

