# Migration Guide - Modernization Update

This document outlines all the changes made to modernize the youtube-feeds repository.

## Summary of Changes

The repository has been fully modernized with updated dependencies, security fixes, and modern JavaScript practices. All vulnerabilities have been resolved.

## Dependency Updates

### Major Package Updates

| Package | Old Version | New Version | Notes |
|---------|------------|-------------|-------|
| express | ^4.16.3 | ^5.2.1 | Major version update |
| body-parser | ^1.17.1 | ^2.2.1 | Major version update |
| bootstrap | ^3.4.1 | ^5.3.8 | Major version update with UI changes |
| clipboard | ^1.7.1 | ^2.0.11 | Major version update |
| pug | ^2.0.0-rc.1 | ^3.0.3 | Major version update |
| feed | ^1.0.2 | ^5.1.0 | Major version update |
| nano | ^6.2.0 | ^11.0.3 | Major version update |
| ytdl-core | ^1.0.7 | ^4.11.5 | Major version update |
| jquery | ^3.4.1 | ^3.7.1 | Security updates |

### Package Replacements

#### Deprecated Packages Removed
- **fs** (0.0.1-security) - Removed (use built-in Node.js `fs` module)
- **http** (0.0.0) - Removed (use built-in Node.js `http` module)
- **path** (^0.12.7) - Removed (use built-in Node.js `path` module)
- **util** (^0.12.2) - Removed (use built-in Node.js `util` module)
- **natives** (^1.1.6) - Removed (no longer needed)
- **nano-promises** (^1.2.0) - Removed (nano v11 has built-in promises)

#### Modern Replacements
- **request** (^2.72.0) → **axios** (^1.7.9)
  - The `request` module is deprecated
  - All HTTP calls now use axios with modern promise-based API

- **ytpl** (^0.1.20) → **@distube/ytpl** (^1.2.3)
  - Original ytpl is no longer supported
  - @distube/ytpl is actively maintained and compatible

- **s3** (^4.4.0) + **streaming-s3** (^0.4.1) → **@aws-sdk/client-s3** (^3.712.0) + **@aws-sdk/lib-storage** (^3.712.0)
  - Old AWS SDK v2 packages had vulnerabilities
  - AWS SDK v3 provides modular, secure, and modern S3 operations
  - Better streaming support with Upload class

## Code Changes

### 1. API Migration to Promises/Async-Await

All callback-based functions have been converted to modern async/await:

- `add_playlist()` - Now async function
- `process_url()` - Now async function
- `list_episodes()` - Now async function
- `fetch_episode()` - Now async function
- `check_file()` - Now async function
- `s3_delete_files()` - Now async function

### 2. HTTP Client Migration (request → axios)

**Before:**
```javascript
var r = require("request");
var rP = promisify(r.post);

r.post({uri: url, auth: {...}, json: {...}}, function(err, res) {
    callback(err, res.body)
});
```

**After:**
```javascript
const axios = require('axios');

const result = await axios.post(url, {...}, {
    auth: {...}
});
return result.data;
```

### 3. YouTube Playlist API Migration

**Before:**
```javascript
ytpl(playlist_id, {limit: 1}, function(err, playlist) {
    if(err) reject(err);
    // process playlist
});
```

**After:**
```javascript
const playlist = await ytpl(playlist_id, {limit: 1});
// process playlist
```

### 4. AWS S3 Migration (v2 → v3)

**Before:**
```javascript
var s3 = require('s3');
var streamingS3 = require('streaming-s3');

var uploader = new streamingS3(stream, {
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey,
    ...
}, {
    Bucket: 'yt-rss',
    Key: filename,
    ...
});
uploader.begin();
```

**After:**
```javascript
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

const s3Client = new S3Client({
    credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey
    },
    endpoint: endpoint,
    region: 'us-standard',
    forcePathStyle: true
});

const upload = new Upload({
    client: s3Client,
    params: {
        Bucket: 'yt-rss',
        Key: filename,
        Body: stream
    }
});

const result = await upload.done();
```

**S3 Operations Updated:**
- `HeadObjectCommand` - Check if object exists
- `DeleteObjectsCommand` - Delete multiple objects
- `Upload` class - Multipart upload with streaming

### 5. Frontend Updates (Bootstrap 3 → 5)

**Changes in www/index.pug:**

- Updated CDN links from Bootstrap 3.3.7 to 5.3.3
- Replaced glyphicons with Bootstrap Icons
- Updated CSS classes:
  - `.panel` → `.card`
  - `.panel-heading` → `.card-header`
  - `.panel-body` → `.card-body`
  - `.btn-default` → `.btn-primary`
  - `.glyphicon` → `.bi` (Bootstrap Icons)
  - `.input-group-btn` → removed (button directly in input-group)

- jQuery is no longer a Bootstrap dependency but kept for custom code
- Bootstrap JS bundle now includes Popper.js

### 6. Feed Module Update

**Before:**
```javascript
const Feed = require('feed');
let feed = new Feed({...});
```

**After:**
```javascript
const { Feed } = require('feed');
let feed = new Feed({...});
```

## Environment Requirements

### Node.js Version
- **Minimum:** Node.js 18.0.0 or higher
- **Recommended:** Node.js 20+ for best AWS SDK v3 support
- Added `engines` field to package.json

## Breaking Changes

### 1. AWS SDK Configuration
If you have custom S3 configuration in env.json, ensure it includes:
- `accessKeyId`
- `secretAccessKey`
- `endpoint`
- `bucket_url`

### 2. Neo4j Configuration
No changes to neo4j configuration required.

### 3. Bootstrap UI
The UI has been updated to Bootstrap 5. If you have custom CSS:
- Review [Bootstrap 5 migration guide](https://getbootstrap.com/docs/5.3/migration/)
- Update any custom classes that reference Bootstrap 3 components

## Security Improvements

### Before Migration
- 8 vulnerabilities (3 moderate, 3 high, 2 critical)
- Multiple deprecated packages with security issues

### After Migration
- **0 vulnerabilities**
- All packages are actively maintained
- Modern security practices implemented

## Testing Recommendations

After updating, test the following functionality:

1. **Playlist Operations:**
   - Add new playlist: `GET /api/playlist/{playlist_id}`
   - Remove playlist: `DELETE /api/playlist/{playlist_id}`
   - Get feed: `GET /api/feed/{playlist_id}`

2. **URL Processing:**
   - Test channel URL conversion: `POST /api/url`

3. **S3 Operations:**
   - Verify audio upload to S3
   - Verify file deletion from S3

4. **Frontend:**
   - Check UI rendering with Bootstrap 5
   - Test clipboard functionality
   - Verify all buttons and forms work

## References

- [AWS SDK for JavaScript v3 Documentation](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/welcome.html)
- [@distube/ytpl Package](https://www.npmjs.com/package/@distube/ytpl)
- [Axios Documentation](https://axios-http.com/)
- [Bootstrap 5 Documentation](https://getbootstrap.com/docs/5.3/)
- [Express 5 Migration Guide](https://expressjs.com/en/guide/migrating-5.html)
- [Feed Package v5](https://www.npmjs.com/package/feed)

## Support

If you encounter any issues after migration:
1. Ensure Node.js version is 18.0.0 or higher
2. Delete `node_modules` and `package-lock.json`, then run `npm install`
3. Check that env.json has all required configuration
4. Review the console for any deprecation warnings
