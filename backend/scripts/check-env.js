require('dotenv').config()

const required = ['JWT_SECRET', 'ADMIN_ORIGIN', 'SALE_ORIGIN', 'DATABASE_PATH']
const missing = required.filter((key) => !process.env[key])

if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`)
  process.exit(1)
}

console.log(JSON.stringify({
  ok: true,
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 8080),
  databasePath: process.env.DATABASE_PATH,
  corsOrigins: [process.env.ADMIN_ORIGIN, process.env.SALE_ORIGIN],
  jwtSecretConfigured: Boolean(process.env.JWT_SECRET),
}, null, 2))
