function sendOrder(event) {
  event.preventDefault()
  var data = new FormData(document.getElementById('order'))
  console.log('order', Object.fromEntries(data))
  document.getElementById('order').hidden = true
  document.getElementById('thanks').hidden = false
  return false
}
