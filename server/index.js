import express from 'express'
import { createHash, createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto'

const app = express()
app.set('trust proxy', 1)
app.use(express.json({ limit: '12mb' }))

function driveImageUrl(value) {
  const url = String(value || '').trim()
  const localMatch = url.match(/^\/api\/drive-image\/([A-Za-z0-9_-]+)$/)
  if (localMatch) return url
  const id = url.match(/[?&]id=([^&]+)/)?.[1] || url.match(/\/d\/([^/]+)/)?.[1]
  if (!id || !/drive\.google\.com/i.test(url)) return url
  return `/api/drive-image/${encodeURIComponent(decodeURIComponent(id))}`
}

function driveStorageUrl(value) {
  const url = String(value || '').trim()
  const localMatch = url.match(/^\/api\/drive-image\/([A-Za-z0-9_-]+)$/)
  const id = localMatch?.[1] || url.match(/[?&]id=([^&]+)/)?.[1] || url.match(/\/d\/([^/]+)/)?.[1]
  if (!id || (!localMatch && !/drive\.google\.com/i.test(url))) return url
  return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(decodeURIComponent(id))}`
}

function safeSocialUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && url.hostname.includes('.') ? url.href.slice(0, 500) : ''
  } catch {
    return ''
  }
}

function speakersWithDisplayPhotos(speakers) {
  return speakers.map(speaker => ({ ...speaker, photoUrl: driveImageUrl(speaker.photoUrl), socialUrl: safeSocialUrl(speaker.socialUrl) }))
}

app.get('/api/drive-image/:id', async (req, res) => {
  const id = String(req.params.id || '')
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) return res.status(400).end()
  try {
    const image = await fetch(`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200`, {
      redirect: 'follow', signal: AbortSignal.timeout(15000),
    })
    const contentType = image.headers.get('content-type') || ''
    if (!image.ok || !contentType.startsWith('image/')) return res.status(502).json({ error: 'Drive no entregó una imagen pública para este archivo.' })
    const bytes = Buffer.from(await image.arrayBuffer())
    if (bytes.length > 12 * 1024 * 1024) return res.status(413).end()
    res.set('Content-Type', contentType)
    res.set('Cache-Control', 'public, max-age=3600')
    res.set('X-Content-Type-Options', 'nosniff')
    res.send(bytes)
  } catch (error) {
    console.error('drive image:', error.message)
    res.status(502).json({ error: 'No se pudo descargar la imagen pública desde Drive.' })
  }
})
const port = Number(process.env.API_PORT || 8787)
const gasUrl = process.env.GAS_WEB_APP_URL
const sharedSecret = process.env.GAS_SHARED_SECRET
const sessionSecret = process.env.SESSION_SECRET
const initialUsername = process.env.INITIAL_ADMIN_USERNAME
const initialPassword = process.env.INITIAL_ADMIN_PASSWORD
const wompiPublicKey = process.env.WOMPI_PUBLIC_KEY
const wompiIntegritySecret = process.env.WOMPI_INTEGRITY_SECRET
const wompiEventsSecret = process.env.WOMPI_EVENTS_SECRET
const wompiEnvironment = process.env.WOMPI_ENV || 'test'
const wompiRedirectUrl = process.env.WOMPI_REDIRECT_URL
const wompiExpectedPrefix = wompiEnvironment === 'prod' ? 'pub_prod_' : 'pub_test_'
const wompiReady = Boolean(wompiPublicKey?.startsWith(wompiExpectedPrefix) && wompiIntegritySecret && wompiEventsSecret && wompiRedirectUrl)
const paymentCatalog = {
  ticket: { name: 'Manilla de acceso', price: 30000, sizes: [], available: true },
  '1': { name: 'Camiseta Un Joven con la 10', price: 25000, sizes: ['S', 'M', 'L', 'XL'], available: true },
  '2': { name: 'Gorra Un Joven con la 10', price: 18000, sizes: ['Ajustable'], available: true },
  '3': { name: 'Tote Bag Oficial', price: 12000, sizes: [], available: false },
}

if (!gasUrl || !sharedSecret || !sessionSecret || sessionSecret.length < 32) {
  throw new Error('Configure GAS_WEB_APP_URL, GAS_SHARED_SECRET y SESSION_SECRET (mínimo 32 caracteres).')
}

const gas = async (action, data = {}) => {
  const response = await fetch(gasUrl, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: sharedSecret, action, ...data }),
    redirect: 'follow',
  })
  const raw = await response.text()
  let result
  try { result = JSON.parse(raw) }
  catch {
    const detail = raw.match(/(?:ReferenceError|Exception|Error):[^<\n]*/)?.[0] || `respuesta ${response.status} (${response.headers.get('content-type') || 'sin tipo'})`
    throw new Error(`Apps Script no devolvio JSON: ${detail}. Guarda y vuelve a desplegar apps-script/Code.gs completo.`)
  }
  if (!response.ok || !result.ok) {
    if (result.error === 'Unknown action') throw new Error('El Apps Script publicado esta desactualizado y no reconoce esta accion. Reemplaza su contenido por apps-script/Code.gs y publica una nueva version.');
    throw new Error(result.error || 'Error consultando Google Sheets')
  }
  return result
}
const getAdminCredential = async () => {
  const { credential } = await gas('getAdmin')
  if (credential) return credential
  if (!initialUsername || !initialPassword) throw new Error('Falta el administrador inicial en variables de entorno.')
  const salt = randomBytes(16).toString('hex')
  const first = { username: initialUsername, salt, passwordHash: scryptSync(initialPassword, salt, 64).toString('hex') }
  await gas('setAdmin', { credential: first })
  return first
}

const derive = (password, salt) => scryptSync(password, salt, 64).toString('hex')
const safeEqual = (a, b) => {
  const left = Buffer.from(a || '', 'hex')
  const right = Buffer.from(b || '', 'hex')
  return left.length === right.length && timingSafeEqual(left, right)
}
const issueSession = (username) => {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url')
  return `${payload}.${createHmac('sha256', sessionSecret).update(payload).digest('base64url')}`
}
const readSession = (req) => {
  const token = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('j10_session='))?.slice(12)
  if (!token) return null
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = createHmac('sha256', sessionSecret).update(payload).digest()
  const actual = Buffer.from(signature, 'base64url')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return data.exp > Date.now() ? data : null
  } catch { return null }
}
const requireAdmin = (req, res, next) => {
  const session = readSession(req)
  if (!session) return res.status(401).json({ error: 'Inicia sesión nuevamente.' })
  req.admin = session
  next()
}
const setSessionCookie = (res, username) => res.cookie('j10_session', issueSession(username), {
  httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 8 * 60 * 60 * 1000,
})
const attempts = new Map()
const phoneLookupAttempts = new Map()
const normalizePhone = (value) => {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  // Colombian mobile numbers may be stored locally (313...) or internationally (57 313...).
  if (digits.length === 12 && digits.startsWith('57')) digits = digits.slice(2)
  return digits
}
function createOrderConfirmationUrl(req) {
  try {
    const base = process.env.PUBLIC_SITE_URL || req.get('origin') || `${req.protocol}://${req.get('host')}`
    const url = new URL(base)
    if (!['https:', 'http:'].includes(url.protocol)) return ''
    url.pathname = '/'
    url.search = '?confirmar=1'
    url.hash = ''
    return url.toString()
  } catch { return '' }
}
const limitLoginAttempts = (req, res, next) => {
  const key = req.ip || 'local'
  const now = Date.now()
  const value = attempts.get(key) || { count: 0, start: now }
  if (now - value.start > 15 * 60 * 1000) { value.count = 0; value.start = now }
  value.count += 1
  attempts.set(key, value)
  if (value.count > 10) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' })
  next()
}
const limitPhoneLookups = (req, res, next) => {
  const key = req.ip || 'local'
  const now = Date.now()
  const value = phoneLookupAttempts.get(key) || { count: 0, start: now }
  if (now - value.start > 15 * 60 * 1000) { value.count = 0; value.start = now }
  value.count += 1
  phoneLookupAttempts.set(key, value)
  if (value.count > 8) return res.status(429).json({ error: 'Llegaste al limite de consultas. Intenta de nuevo en 15 minutos.' })
  next()
}

app.post('/api/admin/login', limitLoginAttempts, async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim()
    const password = String(req.body?.password || '')
    const credential = await getAdminCredential()
    if (!credential || credential.username !== username || !safeEqual(derive(password, credential.salt), credential.passwordHash)) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' })
    }
    setSessionCookie(res, credential.username)
    res.json({ ok: true, username: credential.username })
  } catch (error) {
    console.error('login:', error.message)
    res.status(503).json({ error: error.message || 'No fue posible conectar con la base administrativa.' })
  }
})

app.get('/api/admin/session', (req, res) => {
  const session = readSession(req)
  res.json({ authenticated: Boolean(session), username: session?.u || null })
})

app.post('/api/admin/logout', (_req, res) => {
  res.clearCookie('j10_session', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' })
  res.json({ ok: true })
})

app.get('/api/site-config', async (_req, res) => {
  try {
    const { settings } = await gas('getSettings')
    res.set('Cache-Control', 'no-store')
    res.json({
      speakersBackgroundUrl: driveImageUrl(settings?.speakersBackgroundUrl),
      nequiPaymentReady: Boolean(settings?.nequiPaymentNumber && settings?.nequiPaymentQrUrl),
    })
  } catch (error) {
    console.error('site-config:', error.message)
    res.status(503).json({ error: 'No se pudo cargar la configuracion publica.' })
  }
})

app.get('/api/speakers', async (_req, res) => {
  try {
    const { speakers = [], configured = false } = await gas('listSpeakers')
    res.set('Cache-Control', 'no-store')
    res.json({ speakers: speakersWithDisplayPhotos(speakers), configured })
  } catch (error) {
    console.error('speakers:', error.message)
    res.status(503).json({ error: 'No se pudieron cargar los predicadores.' })
  }
})

app.get('/api/admin/speakers', requireAdmin, async (_req, res) => {
  try {
    const { speakers = [], configured = false } = await gas('listSpeakers')
    res.set('Cache-Control', 'no-store')
    res.json({ speakers: speakersWithDisplayPhotos(speakers), configured })
  } catch (error) {
    console.error('admin speakers:', error.message)
    res.status(503).json({ error: error.message.includes('Apps Script publicado') ? error.message : 'No se pudieron cargar los predicadores de Google Sheets.' })
  }
})

app.post('/api/admin/speakers', requireAdmin, async (req, res) => {
  const input = req.body?.speakers
  if (!Array.isArray(input) || input.length > 30) return res.status(400).json({ error: 'La lista de predicadores no es valida.' })
  const invalidSocialUrl = input.some(speaker => {
    const value = String(speaker?.socialUrl || '').trim()
    if (!value) return false
    try { return new URL(value).protocol !== 'https:' || value.length > 500 } catch { return true }
  })
  if (invalidSocialUrl) return res.status(400).json({ error: 'El enlace de red social debe ser una URL HTTPS valida.' })
  const speakers = input.map(speaker => ({
    id: String(speaker?.id || '').trim().slice(0, 80),
    name: String(speaker?.name || '').trim().slice(0, 120),
    origin: String(speaker?.origin || '').trim().slice(0, 120),
    role: String(speaker?.role || '').trim().slice(0, 160),
    photoUrl: driveStorageUrl(String(speaker?.photoUrl || '').trim().slice(0, 1000)),
    socialUrl: safeSocialUrl(speaker?.socialUrl),
  }))
  if (speakers.some(speaker => !speaker.id || !speaker.name || !speaker.origin || !speaker.role)) return res.status(400).json({ error: 'Completa nombre, lugar de origen y descripcion de cada predicador.' })
  try {
    const result = await gas('saveSpeakers', { speakers })
    res.json({ ok: true, speakers: speakersWithDisplayPhotos(result.speakers || speakers), configured: true })
  } catch (error) {
    console.error('save speakers:', error.message)
    res.status(503).json({ error: error.message.includes('Apps Script publicado') ? error.message : 'No se pudieron guardar los predicadores en Google Sheets.' })
  }
})

app.post('/api/admin/speaker-photo', requireAdmin, async (req, res) => {
  const match = String(req.body?.dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!match || match[2].length > 11200000) return res.status(400).json({ error: 'Sube una foto JPG, PNG o WebP de maximo 8 MB.' })
  try {
    const { imageUrl } = await gas('uploadSpeakerPhoto', {
      mimeType: match[1], base64: match[2], fileName: String(req.body?.fileName || 'foto-predicador').slice(0, 80),
    })
    res.json({ ok: true, imageUrl: driveImageUrl(imageUrl) })
  } catch (error) {
    console.error('speaker photo:', error.message)
    res.status(503).json({ error: error.message.includes('Apps Script publicado') ? error.message : 'No se pudo guardar la foto en Drive.' })
  }
})

app.post('/api/admin/speakers-background', requireAdmin, async (req, res) => {
  if (req.body?.clear === true) {
    try {
      await gas('clearSpeakersImage')
      return res.json({ ok: true, imageUrl: '' })
    } catch (error) { return res.status(503).json({ error: error.message }) }
  }
  const match = String(req.body?.dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!match || match[2].length > 11200000) return res.status(400).json({ error: 'Sube una imagen JPG, PNG o WebP de maximo 8 MB.' })
  try {
    const { imageUrl } = await gas('uploadSpeakersImage', {
      mimeType: match[1], base64: match[2], fileName: String(req.body?.fileName || 'fondo-invitados').slice(0, 80),
    })
    res.json({ ok: true, imageUrl: driveImageUrl(imageUrl) })
  } catch (error) {
    console.error('speakers-background:', error.message)
    res.status(503).json({ error: 'No se pudo guardar la imagen en Drive y Sheets. Revisa permisos de Apps Script.' })
  }
})

app.post('/api/admin/payment-settings', requireAdmin, async (req, res) => {
  const nequiPaymentNumber = String(req.body?.nequiPaymentNumber || '').trim()
  const nequiAccountName = String(req.body?.nequiAccountName || '').trim()
  const submittedEmails = Array.isArray(req.body?.orderNotificationEmails)
    ? req.body.orderNotificationEmails
    : String(req.body?.orderNotificationEmail || '').split(/[\n,;]/)
  const orderNotificationEmails = [...new Set(submittedEmails.map(email => String(email || '').trim().toLowerCase()).filter(Boolean))]
  if (nequiPaymentNumber && !/^[+\d\s().-]{7,24}$/.test(nequiPaymentNumber)) return res.status(400).json({ error: 'Revisa el número de Nequi.' })
  if (nequiAccountName.length > 100) return res.status(400).json({ error: 'El nombre del titular es demasiado largo.' })
  if (orderNotificationEmails.length > 10) return res.status(400).json({ error: 'Puedes guardar hasta 10 correos de notificacion.' })
  if (orderNotificationEmails.some(email => email.length > 254 || !/^\S+@\S+\.\S+$/.test(email))) return res.status(400).json({ error: 'Revisa los correos de aviso; alguno no tiene un formato valido.' })
  try {
    await gas('savePaymentSettings', { settings: { nequiPaymentNumber, nequiAccountName, orderNotificationEmails } })
    res.json({ ok: true })
  } catch (error) {
    console.error('payment settings:', error.message)
    res.status(503).json({ error: error.message.includes('Apps Script publicado') ? error.message : 'No se pudo guardar la configuracion de pago en Google Sheets.' })
  }
})

app.get('/api/admin/payment-settings', requireAdmin, async (_req, res) => {
  try {
    const { settings } = await gas('getSettings')
    res.set('Cache-Control', 'no-store')
    res.json({
      nequiPaymentNumber: settings?.nequiPaymentNumber || '',
      nequiAccountName: settings?.nequiAccountName || '',
      nequiPaymentQrUrl: driveImageUrl(settings?.nequiPaymentQrUrl),
      orderNotificationEmails: Array.isArray(settings?.orderNotificationEmails)
        ? settings.orderNotificationEmails
        : (settings?.orderNotificationEmail ? [settings.orderNotificationEmail] : []),
    })
  } catch (error) {
    console.error('admin payment settings:', error.message)
    res.status(503).json({ error: 'No se pudo cargar la configuracion de pago de Google Sheets.' })
  }
})

app.post('/api/admin/test-order-email', requireAdmin, async (_req, res) => {
  try {
    const result = await gas('testOrderNotificationEmail')
    res.json({ ok: true, sentTo: result.sentTo })
  } catch (error) {
    console.error('test order email:', error.message)
    res.status(503).json({ error: error.message })
  }
})

app.post('/api/admin/payment-qr', requireAdmin, async (req, res) => {
  if (req.body?.clear === true) {
    try {
      await gas('clearPaymentQr')
      return res.json({ ok: true, imageUrl: '' })
    } catch (error) { return res.status(503).json({ error: 'No se pudo quitar el QR de Google Drive y Sheets.' }) }
  }
  const match = String(req.body?.dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!match || match[2].length > 11200000) return res.status(400).json({ error: 'Sube una imagen JPG, PNG o WebP de máximo 8 MB.' })
  try {
    const { imageUrl } = await gas('uploadPaymentQr', {
      mimeType: match[1], base64: match[2], fileName: String(req.body?.fileName || 'nequi-qr').slice(0, 80),
    })
    res.json({ ok: true, imageUrl: driveImageUrl(imageUrl) })
  } catch (error) {
    console.error('payment QR:', error.message)
    res.status(503).json({ error: error.message.includes('Apps Script publicado') ? error.message : 'No se pudo guardar el QR en Drive y Sheets. Revisa los permisos de Apps Script.' })
  }
})

app.get('/api/payments/status', (_req, res) => {
  res.json({ wompi: wompiReady, environment: wompiEnvironment })
})

app.post('/api/orders/lookup-by-phone', limitPhoneLookups, async (req, res) => {
  const phone = normalizePhone(req.body?.phone)
  if (phone.length < 7 || phone.length > 15) return res.status(400).json({ error: 'Escribe el mismo numero de telefono que usaste al comprar.' })
  try {
    // Normalize both sides in the API, so an older Apps Script deployment that
    // compares phone strings literally still matches +57 and local formats.
    const { orders = [] } = await gas('listPaymentOrders')
    const matched = orders.filter(order => normalizePhone(order.phone) === phone)
    res.set('Cache-Control', 'no-store')
    res.json({ orders: matched.map(order => ({
      orderSuffix: String(order.reference || '').slice(-6),
      reference: String(order.reference || ''),
      createdAt: order.createdAt,
      itemName: order.itemName,
      size: order.size || '',
      amountInCents: Number(order.amountInCents),
      currency: order.currency || 'COP',
      paymentStatus: order.paymentStatus,
      // The access code is only returned after an administrator approves payment.
      pickupCode: order.paymentStatus === 'APPROVED' ? String(order.pickupCode || '') : '',
      ticketDelivery: order.ticketDelivery || '',
      merchPickup: order.merchPickup || '',
    })) })
  } catch (error) {
    console.error('order phone lookup:', error.message)
    res.status(503).json({ error: error.message.includes('Apps Script publicado') ? error.message : 'No se pudo consultar el pedido en este momento.' })
  }
})

app.get('/api/payments/nequi/config', async (_req, res) => {
  try {
    const { settings } = await gas('getSettings')
    res.set('Cache-Control', 'no-store')
    res.json({
      paymentNumber: settings?.nequiPaymentNumber || '',
      accountName: settings?.nequiAccountName || '',
      paymentQrUrl: driveImageUrl(settings?.nequiPaymentQrUrl),
      ready: Boolean(settings?.nequiPaymentNumber && settings?.nequiPaymentQrUrl),
    })
  } catch (error) {
    console.error('nequi config:', error.message)
    res.status(503).json({ error: 'No se pudo cargar la configuracion de Nequi.' })
  }
})

app.post('/api/payments/wompi/checkout', async (req, res) => {
  if (!wompiReady) return res.status(503).json({ error: 'Wompi requiere llave publica, secretos de integridad y eventos, y URL de retorno configuradas para el mismo ambiente.' })
  const { itemId, size, name, email, phone, expectedPrice, expectedName } = req.body || {}
  const item = paymentCatalog[String(itemId)]
  if (!item) return res.status(400).json({ error: 'Producto no valido.' })
  if (!item.available) return res.status(409).json({ error: 'Este producto aun no esta disponible para compra.' })
  if (Number(expectedPrice) !== item.price || (expectedName && String(expectedName) !== item.name)) return res.status(409).json({ error: 'El catalogo local difiere del precio oficial del servidor. Actualiza los productos antes de cobrar.' })
  if (!String(name || '').trim() || !/^\S+@\S+\.\S+$/.test(String(email || ''))) return res.status(400).json({ error: 'Revisa el nombre y el correo electronico.' })
  if (item.sizes.length && !item.sizes.includes(String(size || ''))) return res.status(400).json({ error: 'Selecciona una talla disponible.' })
  try {
    const reference = `J10${Date.now()}${randomBytes(12).toString('hex')}`
    const amountInCents = item.price * 100
    const currency = 'COP'
    const integrity = createHash('sha256').update(`${reference}${amountInCents}${currency}${wompiIntegritySecret}`).digest('hex')
    const order = {
      reference, orderId: reference, buyerName: String(name).trim().slice(0, 120), email: String(email).trim().toLowerCase().slice(0, 254),
      phone: String(phone || '').trim().slice(0, 30), itemId: String(itemId), itemName: item.name, size: String(size || ''), amountInCents, currency, pickupCode: String(randomInt(1000, 10000)),
      confirmationUrl: createOrderConfirmationUrl(req),
    }
    await gas('createPaymentOrder', { order })
    const checkout = new URL('https://checkout.wompi.co/p/')
    checkout.search = new URLSearchParams({
      'public-key': wompiPublicKey, currency, 'amount-in-cents': String(amountInCents), reference,
      'signature:integrity': integrity, 'redirect-url': `${wompiRedirectUrl}?reference=${encodeURIComponent(reference)}`,
    }).toString()
    res.json({ url: checkout.toString(), reference })
  } catch (error) {
    console.error('wompi checkout:', error.message)
    res.status(503).json({ error: 'No se pudo crear el pedido pendiente en Google Sheets.' })
  }
})

app.post('/api/payments/nequi/checkout', async (req, res) => {
  const { itemId, size, name, email, phone, expectedPrice, expectedName } = req.body || {}
  const item = paymentCatalog[String(itemId)]
  if (!item) return res.status(400).json({ error: 'Producto no válido.' })
  if (!item.available) return res.status(409).json({ error: 'Este producto aún no está disponible para compra.' })
  if (Number(expectedPrice) !== item.price || (expectedName && String(expectedName) !== item.name)) return res.status(409).json({ error: 'El catálogo local difiere del precio oficial del servidor. Actualiza los productos antes de cobrar.' })
  if (!String(name || '').trim() || !/^\S+@\S+\.\S+$/.test(String(email || ''))) return res.status(400).json({ error: 'Revisa el nombre y el correo electrónico.' })
  if (!/^\+?\d[\d\s().-]{6,22}$/.test(String(phone || ''))) return res.status(400).json({ error: 'Escribe un número de teléfono válido; lo usaremos para vincular el código de acceso a tu compra.' })
  if (item.sizes.length && !item.sizes.includes(String(size || ''))) return res.status(400).json({ error: 'Selecciona una talla disponible.' })
  try {
    const { settings } = await gas('getSettings')
    if (!settings?.nequiPaymentNumber || !settings?.nequiPaymentQrUrl) return res.status(503).json({ error: 'El administrador todavía no configuró el QR y el número de Nequi.' })
    const reference = `J10${Date.now()}${randomBytes(12).toString('hex')}`
    const order = {
      reference, orderId: reference, buyerName: String(name).trim().slice(0, 120), email: String(email).trim().toLowerCase().slice(0, 254),
      phone: String(phone).trim().slice(0, 30), itemId: String(itemId), itemName: item.name, size: String(size || ''),
      amountInCents: item.price * 100, currency: 'COP', paymentMethod: 'NEQUI_MANUAL', pickupCode: '',
      confirmationUrl: createOrderConfirmationUrl(req),
    }
    await gas('createPaymentOrder', { order })
    res.json({ reference })
  } catch (error) {
    console.error('nequi checkout:', error.message)
    res.status(503).json({ error: 'No se pudo crear el pedido pendiente en Google Sheets.' })
  }
})

app.get('/api/payments/wompi/status/:reference', async (req, res) => {
  try {
    const { order } = await gas('getPaymentOrder', { reference: req.params.reference })
    if (!order) return res.status(404).json({ error: 'No encontramos esa referencia.' })
    const approved = order.paymentStatus === 'APPROVED'
    res.set('Cache-Control', 'no-store')
    res.json({
      status: order.paymentStatus, amountInCents: Number(order.amountInCents), currency: order.currency,
      itemName: order.itemName, size: order.size, reference: order.reference,
      ...(approved ? { buyerName: order.buyerName, pickupCode: order.pickupCode } : {}),
    })
  } catch (error) {
    console.error('wompi status:', error.message)
    res.status(503).json({ error: 'No se pudo consultar el estado del pago.' })
  }
})

app.get('/api/payments/status/:reference', async (req, res) => {
  try {
    const { order } = await gas('getPaymentOrder', { reference: req.params.reference })
    if (!order) return res.status(404).json({ error: 'No encontramos esa referencia.' })
    const approved = order.paymentStatus === 'APPROVED'
    const response = {
      status: order.paymentStatus, amountInCents: Number(order.amountInCents), currency: order.currency,
      itemName: order.itemName, size: order.size, reference: order.reference, paymentMethod: order.paymentMethod,
    }
    if (order.paymentMethod === 'NEQUI_MANUAL' && !approved) {
      const { settings } = await gas('getSettings')
      response.paymentNumber = settings?.nequiPaymentNumber || ''
      response.accountName = settings?.nequiAccountName || ''
      response.paymentQrUrl = driveImageUrl(settings?.nequiPaymentQrUrl)
    }
    if (approved) {
      response.buyerName = order.buyerName
      response.pickupCode = order.pickupCode
      response.phoneLast4 = String(order.phone || '').replace(/\D/g, '').slice(-4)
    }
    res.set('Cache-Control', 'no-store')
    res.json(response)
  } catch (error) {
    console.error('payment status:', error.message)
    res.status(503).json({ error: 'No se pudo consultar el estado del pedido.' })
  }
})

const eventProperty = (root, path) => path.split('.').reduce((value, key) => value?.[key], root)
const sameHex = (left, right) => {
  const a = Buffer.from(String(left || '').toUpperCase(), 'hex')
  const b = Buffer.from(String(right || '').toUpperCase(), 'hex')
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b)
}
app.post('/api/webhooks/wompi', async (req, res) => {
  if (!wompiEventsSecret) return res.sendStatus(503)
  const event = req.body
  if (event?.event !== 'transaction.updated' || !Array.isArray(event.signature?.properties) || !event.timestamp) return res.sendStatus(400)
  const signedValues = event.signature.properties.map(path => eventProperty(event.data, path))
  if (signedValues.some(value => value === undefined || value === null)) return res.sendStatus(400)
  const checksum = createHash('sha256').update(`${signedValues.join('')}${event.timestamp}${wompiEventsSecret}`).digest('hex')
  if (!sameHex(checksum, event.signature.checksum || req.get('X-Event-Checksum'))) return res.sendStatus(401)
  if (event.environment !== (wompiEnvironment === 'prod' ? 'prod' : 'test')) return res.sendStatus(400)
  const transaction = event.data.transaction
  try {
    const { order } = await gas('getPaymentOrder', { reference: transaction.reference })
    if (!order || Number(order.amountInCents) !== Number(transaction.amount_in_cents) || order.currency !== transaction.currency) return res.sendStatus(200)
    await gas('updatePaymentOrder', { reference: transaction.reference, update: {
      paymentStatus: transaction.status, transactionId: transaction.id, paymentMethod: transaction.payment_method_type || '',
    } })
    res.sendStatus(200)
  } catch (error) {
    console.error('wompi webhook:', error.message)
    res.sendStatus(503)
  }
})

app.get('/api/admin/profile', requireAdmin, async (_req, res) => {
  try {
    const credential = await getAdminCredential()
    res.json({ username: credential.username })
  } catch (error) { res.status(503).json({ error: error.message }) }
})

app.get('/api/admin/orders', requireAdmin, async (_req, res) => {
  try {
    const { orders } = await gas('listPaymentOrders')
    res.set('Cache-Control', 'no-store')
    res.json({ orders: (orders || []).map(order => ({
      id: order.orderId, reference: order.reference, name: order.buyerName, email: order.email, phone: order.phone,
      item: order.itemName, size: order.size || '', total: Number(order.amountInCents) / 100,
      status: order.paymentStatus, code: String(order.pickupCode || ''), paymentMethod: order.paymentMethod,
      disbursementStatus: order.disbursementStatus,
    })) })
  } catch (error) {
    console.error('admin orders:', error.message)
    res.status(503).json({ error: 'No se pudieron cargar los pedidos de Google Sheets.' })
  }
})

app.put('/api/admin/orders/:reference/buyer', requireAdmin, async (req, res) => {
  const buyerName = String(req.body?.buyerName || '').trim().slice(0, 120)
  const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 254)
  const phone = String(req.body?.phone || '').trim().slice(0, 30)
  if (!buyerName) return res.status(400).json({ error: 'Escribe el nombre del comprador.' })
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Escribe un correo electronico valido.' })
  if (normalizePhone(phone).length < 7 || normalizePhone(phone).length > 15) return res.status(400).json({ error: 'Escribe un telefono valido.' })
  try {
    const result = await gas('updatePaymentBuyer', { reference: req.params.reference, buyer: { buyerName, email, phone } })
    if (!result.ok) return res.status(404).json({ error: result.error || 'No se encontro el pedido.' })
    res.json({ ok: true })
  } catch (error) {
    console.error('update buyer:', error.message)
    res.status(503).json({ error: error.message })
  }
})

app.delete('/api/admin/orders/:reference', requireAdmin, async (req, res) => {
  try {
    const result = await gas('deletePaymentOrder', { reference: req.params.reference })
    if (!result.ok) return res.status(404).json({ error: result.error || 'No se encontro el pedido.' })
    res.json({ ok: true })
  } catch (error) {
    console.error('delete buyer order:', error.message)
    res.status(503).json({ error: error.message })
  }
})

app.delete('/api/admin/orders', requireAdmin, async (_req, res) => {
  try {
    const result = await gas('clearPaymentOrders')
    res.json({ ok: true, deleted: Number(result.deleted || 0) })
  } catch (error) {
    console.error('clear buyer orders:', error.message)
    res.status(503).json({ error: error.message })
  }
})

app.post('/api/admin/orders/:reference/confirm-nequi', requireAdmin, async (req, res) => {
  try {
    const { confirmed, error } = await gas('confirmManualNequiOrder', { reference: req.params.reference, pickupCode: String(randomInt(1000, 10000)) })
    if (!confirmed) return res.status(409).json({ error: error || 'No se pudo confirmar este pedido.' })
    res.json({ ok: true })
  } catch (error) {
    console.error('confirm nequi payment:', error.message)
    res.status(503).json({ error: 'No se pudo confirmar el pago en Google Sheets.' })
  }
})

app.post('/api/admin/validate-entry', requireAdmin, async (req, res) => {
  const pickupCode = String(req.body?.pickupCode || '').trim()
  const reference = String(req.body?.reference || '').trim().slice(0, 100)
  if (!/^\d{4}$/.test(pickupCode)) return res.status(400).json({ error: 'Ingresa el codigo de cuatro digitos o escanea el QR de acceso.' })
  try {
    const result = await gas('validatePickupCode', { reference, pickupCode })
    if (!result.valid) return res.status(result.ambiguous ? 409 : 404).json({ error: result.error || 'No se pudo validar este acceso.' })
    res.set('Cache-Control', 'no-store')
    res.json({ valid: true, alreadyUsed: Boolean(result.alreadyUsed), order: result.order })
  } catch (error) {
    console.error('validate entry:', error.message)
    res.status(503).json({ error: error.message.includes('Apps Script publicado') ? error.message : 'No se pudo validar el codigo en Google Sheets.' })
  }
})

app.post('/api/admin/credentials', requireAdmin, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '')
  const username = String(req.body?.username || '').trim()
  const newPassword = String(req.body?.newPassword || '')
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) return res.status(400).json({ error: 'El usuario debe tener entre 3 y 40 caracteres: letras, números, punto, guion o guion bajo.' })
  if (newPassword.length < 12 || newPassword.length > 128) return res.status(400).json({ error: 'La nueva contraseña debe tener entre 12 y 128 caracteres.' })
  try {
    const credential = await getAdminCredential()
    if (!safeEqual(derive(currentPassword, credential.salt), credential.passwordHash)) return res.status(401).json({ error: 'La contraseña actual no coincide.' })
    const salt = randomBytes(16).toString('hex')
    const passwordHash = derive(newPassword, salt)
    await gas('setAdmin', { credential: { username, salt, passwordHash } })
    setSessionCookie(res, username)
    res.json({ ok: true, username })
  } catch (error) {
    console.error('credentials:', error.message)
    res.status(503).json({ error: 'No fue posible guardar los cambios en Google Sheets.' })
  }
})

if (process.env.VERCEL !== '1') app.listen(port, '127.0.0.1', () => console.log(`API administrativa escuchando en http://127.0.0.1:${port}`))

export default app
