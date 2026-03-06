const geckos = require('@geckos.io/server').default
const http = require('http')
const fs = require('fs')
const path = require('path')
const dgram = require('dgram')

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(fs.readFileSync(path.join(__dirname, 'index.html')))
  } 
  else if (req.url && req.url.startsWith('/geckos/')) {
    const geckosClientRoot = path.join(__dirname, 'node_modules', '@geckos.io', 'client', 'lib')

    const relativePath = decodeURIComponent(req.url.replace(/^\/geckos\//, ''))
    const safePath = path.normalize(relativePath).replace(/^([.][.][\/])+/, '')
    const filePath = path.join(geckosClientRoot, safePath)

    if (!filePath.startsWith(geckosClientRoot)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404)
      res.end('Not Found')
      return
    }

    const ext = path.extname(filePath).toLowerCase()
    const contentType = ext === '.js'
      ? 'application/javascript'
      : ext === '.map'
        ? 'application/json'
        : ext === '.d.ts'
          ? 'text/plain'
          : 'application/octet-stream'

    res.writeHead(200, { 'Content-Type': contentType })
    res.end(fs.readFileSync(filePath))
  }
})

const io = geckos({ 
  iceServers: [],
  cors: { allowAuthorization: false }
})

io.addServer(server)

// Socket UDP único para receber dados do bridge Python
const udpServer = dgram.createSocket('udp4')
const clients = new Set()

udpServer.on('message', (msg) => {
  try {
    const data = JSON.parse(msg.toString())
    // Envia para TODOS os clientes WebRTC conectados
    io.emit('tick', data)
  } catch (e) {}
})

udpServer.bind(10208, () => {
  console.log('📡 UDP Server ouvindo na porta 10208')
})

io.onConnection(channel => {
  console.log('--- SENTINEL: Browser Conectado ---', channel.id)
  clients.add(channel.id)
  
  channel.onDisconnect(() => {
    console.log('--- SENTINEL: Browser Desconectado ---', channel.id)
    clients.delete(channel.id)
  })
})

server.listen(3000, () => {
  console.log('🚀 SENTINEL ATIVO: http://localhost:3000')
  console.log('📡 Aguardando dados UDP na porta 10208')
  console.log('🌐 WebRTC pronto para clientes')
})
