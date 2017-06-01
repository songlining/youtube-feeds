
$( document ).ready(function() {
    new Clipboard('.btn');
    $.get('/api/playlists', function (data, status) {
	let playlists = data.playlists;
	for (let i = 0, len = playlists.length; i < len; i++) {
	    let id = playlists[i].id;
	    let title = playlists[i].title;
	    $('div.btn-group-lg').append(`
<div class="btn-toolbar">
  <button class="btn btn-primary btn-sm" data-clipboard-text="http://${location.host}/api/feed/${id}">
    ${title}
  </button>
</div>
				      `);
	}
    });
})
