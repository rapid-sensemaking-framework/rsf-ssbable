const { init, shutdown, SSBable } = require('./index')

init().then(() => {
  const tester = new SSBable('@LokfrMODq1nbyPNR5MrxmI2thhszC4pfCn8OsLwcxIs=.ed25519')
  tester.listen(message => {
    console.log('got a message!', message)
  })
  tester.speak('to myself')
})