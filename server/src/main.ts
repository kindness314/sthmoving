import { startServer } from './app'
import { readServerConfig } from './config'

const config = readServerConfig()

startServer(config)
  .then((started) => {
    console.log(`sthmoving 服务已监听 ${started.port} 端口`)
    const shutdown = () => {
      started
        .close()
        .then(() => process.exit(0))
        .catch((error: unknown) => {
          console.error(error)
          process.exit(1)
        })
    }
    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  })
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
