// Page view counter. Sends nothing yet.
var views = Number(localStorage.getItem('views') || 0) + 1
localStorage.setItem('views', views)
