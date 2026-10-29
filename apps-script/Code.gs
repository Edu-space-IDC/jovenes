/** Store only the admin username and a salted scrypt hash in the spreadsheet. */
function doPost(e) {
  try {
    // Keep the response helper inside doPost so this endpoint is self-contained.
    var output = function(value) {
      return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
    };
    var input = JSON.parse((e.postData && e.postData.contents) || '{}');
    var props = PropertiesService.getScriptProperties();
    var expected = props.getProperty('GAS_SHARED_SECRET');
    if (!expected || input.secret !== expected) return output({ ok: false, error: 'Unauthorized' });
    var configuredSheetId = props.getProperty('SPREADSHEET_ID');
    if (!configuredSheetId) return output({ ok: false, error: 'Missing SPREADSHEET_ID' });
    // Accept either the spreadsheet ID or its full URL from Script Properties.
    var match = configuredSheetId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    var sheetId = match ? match[1] : configuredSheetId.trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(sheetId)) return output({ ok: false, error: 'SPREADSHEET_ID must be a spreadsheet ID or Google Sheets URL' });
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName('Admin') || ss.insertSheet('Admin');
    if (sheet.getLastRow() === 0) sheet.appendRow(['username', 'salt', 'passwordHash', 'updatedAt']);
    if (input.action === 'getAdmin') {
      if (sheet.getLastRow() < 2) return output({ ok: true, credential: null });
      var row = sheet.getRange(2, 1, 1, 3).getDisplayValues()[0];
      return output({ ok: true, credential: { username: row[0], salt: row[1], passwordHash: row[2] } });
    }
    if (input.action === 'setAdmin') {
      var c = input.credential || {};
      if (!c.username || !c.salt || !c.passwordHash) return output({ ok: false, error: 'Invalid credential payload' });
      var lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        sheet.getRange(2, 1, 1, 4).setValues([[c.username, c.salt, c.passwordHash, new Date()]]);
      } finally { lock.releaseLock(); }
      return output({ ok: true });
    }
    if (input.action === 'getSettings') {
      var config = ss.getSheetByName('Configuracion') || ss.insertSheet('Configuracion');
      if (config.getLastRow() === 0) config.appendRow(['key', 'value', 'updatedAt']);
      var rows = config.getLastRow() > 1 ? config.getRange(2, 1, config.getLastRow() - 1, 2).getDisplayValues() : [];
      var settings = {};
      rows.forEach(function(row) { if (row[0]) settings[row[0]] = row[1]; });
      var notificationEmails = parseOrderNotificationEmails_(settings.orderNotificationEmails, settings.orderNotificationEmail);
      return output({ ok: true, settings: {
        speakersBackgroundUrl: settings.speakersBackgroundUrl || '',
        nequiPaymentNumber: settings.nequiPaymentNumber || '',
        nequiAccountName: settings.nequiAccountName || '',
        nequiPaymentQrUrl: settings.nequiPaymentQrUrl || '',
        orderNotificationEmails: notificationEmails,
        orderNotificationEmail: notificationEmails[0] || '',
      } });
    }
    if (input.action === 'savePaymentSettings') {
      var paymentSettings = input.settings || {};
      saveConfigValue_(ss, 'nequiPaymentNumber', String(paymentSettings.nequiPaymentNumber || '').slice(0, 24));
      saveConfigValue_(ss, 'nequiAccountName', String(paymentSettings.nequiAccountName || '').slice(0, 100));
      var notificationEmails = parseOrderNotificationEmails_(paymentSettings.orderNotificationEmails, paymentSettings.orderNotificationEmail);
      if (notificationEmails.length > 10) return output({ ok: false, error: 'Puedes guardar hasta 10 correos de notificacion.' });
      saveConfigValue_(ss, 'orderNotificationEmails', JSON.stringify(notificationEmails));
      saveConfigValue_(ss, 'orderNotificationEmail', '');
      return output({ ok: true });
    }
    if (input.action === 'testOrderNotificationEmail') {
      var notificationEmails = parseOrderNotificationEmails_(getConfigValue_(ss, 'orderNotificationEmails'), getConfigValue_(ss, 'orderNotificationEmail'));
      if (!notificationEmails.length) return output({ ok: false, error: 'Primero guarda al menos un correo de avisos en la configuracion de Pagos.' });
      var testFailures = [];
      notificationEmails.forEach(function(email) {
        var testResult = sendEmailSafely_({
          to: email,
          subject: 'Prueba de correo — Congreso Un Joven con la 10',
          body: 'El envio de correos de pedidos esta funcionando. Recibiras aqui los avisos de nuevos pagos manuales por Nequi.',
          htmlBody: '<p>El envio de correos de pedidos esta funcionando.</p><p>Recibiras aqui los avisos de nuevos pagos manuales por Nequi.</p>',
          name: 'Congreso Un Joven con la 10',
        });
        if (!testResult.ok) testFailures.push(email + ': ' + testResult.error);
      });
      if (testFailures.length) return output({ ok: false, error: testFailures.join('; ') });
      return output({ ok: true, sentTo: notificationEmails });
    }
    if (input.action === 'uploadPaymentQr') {
      var qrMimeType = String(input.mimeType || '');
      if (['image/jpeg', 'image/png', 'image/webp'].indexOf(qrMimeType) === -1) return output({ ok: false, error: 'Use una imagen JPG, PNG o WebP.' });
      var qrBase64 = String(input.base64 || '');
      if (!qrBase64 || qrBase64.length > 11200000) return output({ ok: false, error: 'La imagen debe pesar menos de 8 MB.' });
      var qrBlob = Utilities.newBlob(Utilities.base64Decode(qrBase64), qrMimeType, String(input.fileName || 'nequi-qr'));
      var qrFile = DriveApp.createFile(qrBlob);
      qrFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      var qrUrl = 'https://drive.google.com/uc?export=view&id=' + qrFile.getId();
      saveConfigValue_(ss, 'nequiPaymentQrUrl', qrUrl);
      return output({ ok: true, imageUrl: qrUrl });
    }
    if (input.action === 'clearPaymentQr') {
      saveConfigValue_(ss, 'nequiPaymentQrUrl', '');
      return output({ ok: true, imageUrl: '' });
    }
    if (input.action === 'uploadSpeakersImage') {
      var mimeType = String(input.mimeType || '');
      if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mimeType) === -1) return output({ ok: false, error: 'Use una imagen JPG, PNG o WebP.' });
      var base64 = String(input.base64 || '');
      if (!base64 || base64.length > 11200000) return output({ ok: false, error: 'La imagen debe pesar menos de 8 MB.' });
      var blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, String(input.fileName || 'fondo-invitados'));
      var file = DriveApp.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      var imageUrl = 'https://drive.google.com/uc?export=view&id=' + file.getId();
      saveConfigValue_(ss, 'speakersBackgroundUrl', imageUrl);
      return output({ ok: true, imageUrl: imageUrl });
    }
    if (input.action === 'uploadSpeakerPhoto') {
      var speakerPhotoMimeType = String(input.mimeType || '');
      if (['image/jpeg', 'image/png', 'image/webp'].indexOf(speakerPhotoMimeType) === -1) return output({ ok: false, error: 'Use una imagen JPG, PNG o WebP.' });
      var speakerPhotoBase64 = String(input.base64 || '');
      if (!speakerPhotoBase64 || speakerPhotoBase64.length > 11200000) return output({ ok: false, error: 'La foto debe pesar menos de 8 MB.' });
      var speakerPhotoBlob = Utilities.newBlob(Utilities.base64Decode(speakerPhotoBase64), speakerPhotoMimeType, String(input.fileName || 'foto-predicador'));
      var speakerPhotoFile = DriveApp.createFile(speakerPhotoBlob);
      speakerPhotoFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return output({ ok: true, imageUrl: 'https://drive.google.com/uc?export=view&id=' + speakerPhotoFile.getId() });
    }
    if (input.action === 'listSpeakers') {
      var speakerSheet = speakersSheet_(ss);
      return output({ ok: true, speakers: listSpeakers_(ss), configured: speakerSheet.getRange(1, 26).getDisplayValue() === 'CONFIGURED' });
    }
    if (input.action === 'saveSpeakers') return output(saveSpeakers_(ss, input.speakers));
    if (input.action === 'clearSpeakersImage') {
      saveConfigValue_(ss, 'speakersBackgroundUrl', '');
      return output({ ok: true, imageUrl: '' });
    }
    if (input.action === 'createPaymentOrder') return output(createPaymentOrder_(ss, input.order));
    if (input.action === 'getPaymentOrder') return output({ ok: true, order: getPaymentOrder_(ss, input.reference) });
    if (input.action === 'updatePaymentOrder') return output(updatePaymentOrder_(ss, input.reference, input.update));
    if (input.action === 'updatePaymentBuyer') return output(updatePaymentBuyer_(ss, input.reference, input.buyer));
    if (input.action === 'deletePaymentOrder') return output(deletePaymentOrder_(ss, input.reference));
    if (input.action === 'clearPaymentOrders') return output(clearPaymentOrders_(ss));
    if (input.action === 'confirmManualNequiOrder') return output(confirmManualNequiOrder_(ss, input.reference, input.pickupCode));
    if (input.action === 'validatePickupCode') return output(validatePickupCode_(ss, input.reference, input.pickupCode));
    if (input.action === 'listPaymentOrders') return output({ ok: true, orders: listPaymentOrders_(ss) });
    if (input.action === 'lookupOrdersByPhone') return output(lookupOrdersByPhone_(ss, input.phone));
    return output({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return output({ ok: false, error: String(err.message || err) });
  }
}

function saveConfigValue_(ss, key, value) {
  var sheet = ss.getSheetByName('Configuracion') || ss.insertSheet('Configuracion');
  if (sheet.getLastRow() === 0) sheet.appendRow(['key', 'value', 'updatedAt']);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues() : [];
    var index = rows.findIndex(function(row) { return row[0] === key; });
    var targetRow = index === -1 ? sheet.getLastRow() + 1 : index + 2;
    sheet.getRange(targetRow, 1, 1, 3).setValues([[key, value, new Date()]]);
  } finally { lock.releaseLock(); }
}

function getConfigValue_(ss, key) {
  var sheet = ss.getSheetByName('Configuracion');
  if (!sheet || sheet.getLastRow() < 2) return '';
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues();
  for (var i = 0; i < rows.length; i++) if (rows[i][0] === key) return String(rows[i][1] || '').trim();
  return '';
}

function parseOrderNotificationEmails_(storedEmails, legacyEmail) {
  var emails = [];
  try {
    var parsed = Array.isArray(storedEmails) ? storedEmails : JSON.parse(String(storedEmails || '[]'));
    if (Array.isArray(parsed)) emails = parsed;
  } catch (err) {
    emails = String(storedEmails || '').split(/[\n,;]/);
  }
  if (!emails.length && legacyEmail) emails = [legacyEmail];
  var seen = {};
  return emails.map(function(email) { return String(email || '').trim().toLowerCase(); })
    .filter(function(email) {
      if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email) || seen[email]) return false;
      seen[email] = true;
      return true;
    }).slice(0, 10);
}

var SPEAKER_HEADERS_ = ['id', 'name', 'origin', 'role', 'photoUrl', 'updatedAt', 'socialUrl'];
function speakersSheet_(ss) {
  var sheet = ss.getSheetByName('Predicadores') || ss.insertSheet('Predicadores');
  sheet.getRange(1, 1, 1, SPEAKER_HEADERS_.length).setValues([SPEAKER_HEADERS_]);
  return sheet;
}
function listSpeakers_(ss) {
  var sheet = speakersSheet_(ss);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, SPEAKER_HEADERS_.length).getValues().map(function(row) {
    var speaker = {};
    SPEAKER_HEADERS_.forEach(function(header, index) { speaker[header] = row[index]; });
    return speaker;
  });
}
function saveSpeakers_(ss, speakers) {
  if (!Array.isArray(speakers) || speakers.length > 30) return { ok: false, error: 'La lista de predicadores no es valida.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = speakersSheet_(ss);
    sheet.getRange(1, 26).setValue('CONFIGURED');
    var rows = speakers.map(function(speaker) {
      return [
        String(speaker.id || '').slice(0, 80), String(speaker.name || '').slice(0, 120),
        String(speaker.origin || '').slice(0, 120), String(speaker.role || '').slice(0, 160),
        String(speaker.photoUrl || '').slice(0, 1000), new Date(), String(speaker.socialUrl || '').slice(0, 500),
      ];
    });
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, SPEAKER_HEADERS_.length).clearContent();
    if (rows.length) sheet.getRange(2, 1, rows.length, SPEAKER_HEADERS_.length).setValues(rows);
    return { ok: true, speakers: listSpeakers_(ss), configured: true };
  } finally { lock.releaseLock(); }
}

var PAYMENT_HEADERS_ = ['reference', 'orderId', 'createdAt', 'buyerName', 'email', 'phone', 'itemId', 'itemName', 'size', 'amountInCents', 'currency', 'paymentMethod', 'paymentStatus', 'transactionId', 'ticketDelivery', 'merchPickup', 'disbursementStatus', 'pickupCode', 'confirmationUrl'];
function paymentOrdersSheet_(ss) {
  var sheet = ss.getSheetByName('Pedidos') || ss.insertSheet('Pedidos');
  if (sheet.getLastRow() === 0) sheet.appendRow(PAYMENT_HEADERS_);
  var headers = sheet.getRange(1, 1, 1, PAYMENT_HEADERS_.length).getDisplayValues()[0];
  PAYMENT_HEADERS_.forEach(function(header, index) { if (headers.indexOf(header) === -1) sheet.getRange(1, index + 1).setValue(header); });
  return sheet;
}
function createPaymentOrder_(ss, order) {
  if (!order || !order.reference || !order.orderId) return { ok: false, error: 'Invalid order' };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = paymentOrdersSheet_(ss);
    var found = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).createTextFinder(String(order.reference)).matchEntireCell(true).findNext();
    if (found) return { ok: false, error: 'Duplicate reference' };
    sheet.appendRow([order.reference, order.orderId, new Date(), order.buyerName, order.email, order.phone, order.itemId, order.itemName, order.size || '', order.amountInCents, order.currency, order.paymentMethod || 'WOMPI', 'PENDING', '', 'Pendiente', order.itemId === 'ticket' ? 'No aplica' : 'Pendiente', order.paymentMethod === 'NEQUI_MANUAL' ? 'No aplica: transferencia directa' : 'Pendiente de verificacion', order.pickupCode || '', String(order.confirmationUrl || '')]);
    sendNewOrderEmails_(ss, order);
    return { ok: true };
  } finally { lock.releaseLock(); }
}
function getPaymentOrder_(ss, reference) {
  var sheet = paymentOrdersSheet_(ss);
  if (sheet.getLastRow() < 2) return null;
  var found = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(String(reference)).matchEntireCell(true).findNext();
  if (!found) return null;
  var values = sheet.getRange(found.getRow(), 1, 1, PAYMENT_HEADERS_.length).getValues()[0];
  var order = {};
  PAYMENT_HEADERS_.forEach(function(key, i) { order[key] = values[i]; });
  return order;
}
function listPaymentOrders_(ss) {
  var sheet = paymentOrdersSheet_(ss);
  if (sheet.getLastRow() < 2) return [];
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, PAYMENT_HEADERS_.length).getValues();
  return rows.map(function(values) {
    var order = {};
    PAYMENT_HEADERS_.forEach(function(key, i) { order[key] = values[i]; });
    return order;
  }).reverse();
}
function escapeEmailHtml_(value) {
  return String(value || '').replace(/[&<>"']/g, function(character) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
  });
}
function sendEmailSafely_(message) {
  try {
    MailApp.sendEmail(message);
    return { ok: true };
  } catch (err) {
    var error = String(err.message || err);
    console.error('No se pudo enviar el correo: ' + error);
    return { ok: false, error: error };
  }
}
function orderConfirmationUrl_(order) {
  return String(order.confirmationUrl || '');
}
function sendNewOrderEmails_(ss, order) {
  var settings = {};
  var config = ss.getSheetByName('Configuracion');
  if (config && config.getLastRow() > 1) {
    config.getRange(2, 1, config.getLastRow() - 1, 2).getDisplayValues().forEach(function(row) {
      if (row[0]) settings[row[0]] = row[1];
    });
  }
  var item = String(order.itemName || 'Compra') + (order.size ? ' · Talla ' + order.size : '');
  var amount = '$' + (Number(order.amountInCents || 0) / 100).toLocaleString('es-CO') + ' COP';
  var confirmationUrl = orderConfirmationUrl_(order);
  var urlText = confirmationUrl ? '\n\nConsulta tu pedido y tu código aquí: ' + confirmationUrl : '';
  if (order.email && String(order.paymentMethod || '') === 'NEQUI_MANUAL') {
    sendEmailSafely_({
      to: String(order.email),
      subject: 'Recibimos tu pedido para el Congreso Un Joven con la 10',
      body: 'Hola ' + String(order.buyerName || '') + ',\n\nRecibimos tu pedido de ' + item + ' por ' + amount + '. El pago está pendiente mientras el equipo valida la transferencia de Nequi. Te enviaremos otro correo cuando quede confirmado.' + urlText + '\n\nCongreso Un Joven con la 10',
      htmlBody: '<p>Hola ' + escapeEmailHtml_(order.buyerName) + ',</p><p>Recibimos tu pedido de <b>' + escapeEmailHtml_(item) + '</b> por <b>' + escapeEmailHtml_(amount) + '</b>.</p><p>El pago está pendiente mientras el equipo valida la transferencia de Nequi. Te enviaremos otro correo cuando quede confirmado.</p>' + (confirmationUrl ? '<p><a href="' + escapeEmailHtml_(confirmationUrl) + '">Consulta tu pedido y tu código</a></p>' : '') + '<p>Congreso Un Joven con la 10</p>',
      name: 'Congreso Un Joven con la 10',
    });
  }
  var adminEmails = parseOrderNotificationEmails_(settings.orderNotificationEmails, settings.orderNotificationEmail);
  if (adminEmails.length && String(order.paymentMethod || '') === 'NEQUI_MANUAL') {
    adminEmails.forEach(function(adminEmail) { sendEmailSafely_({
      to: adminEmail,
      subject: 'Nuevo pedido para revisar — Congreso Un Joven con la 10',
      body: 'Se creó un nuevo pedido y requiere revisar la transferencia de Nequi.\n\nComprador: ' + String(order.buyerName || '') + '\nCorreo: ' + String(order.email || '') + '\nTeléfono: ' + String(order.phone || '') + '\nProducto: ' + item + '\nTotal: ' + amount + '\nReferencia: ' + String(order.reference || ''),
      htmlBody: '<p>Se creó un nuevo pedido y requiere revisar la transferencia de Nequi.</p><ul><li><b>Comprador:</b> ' + escapeEmailHtml_(order.buyerName) + '</li><li><b>Correo:</b> ' + escapeEmailHtml_(order.email) + '</li><li><b>Teléfono:</b> ' + escapeEmailHtml_(order.phone) + '</li><li><b>Producto:</b> ' + escapeEmailHtml_(item) + '</li><li><b>Total:</b> ' + escapeEmailHtml_(amount) + '</li><li><b>Referencia:</b> ' + escapeEmailHtml_(order.reference) + '</li></ul>',
      name: 'Pedidos del Congreso',
    }); });
  }
}
function sendOrderApprovedEmail_(order) {
  if (!order || !order.email) return;
  var item = String(order.itemName || 'Compra') + (order.size ? ' · Talla ' + order.size : '');
  var confirmationUrl = orderConfirmationUrl_(order);
  sendEmailSafely_({
    to: String(order.email),
    subject: 'Tu compra fue confirmada — Congreso Un Joven con la 10',
    body: 'Hola ' + String(order.buyerName || '') + ',\n\nTu compra de ' + item + ' fue procesada correctamente. Ya puedes consultar tu estado y código de acceso con el teléfono registrado.' + (confirmationUrl ? '\n\nConfirmar mi pedido: ' + confirmationUrl : '') + '\n\nCongreso Un Joven con la 10',
    htmlBody: '<p>Hola ' + escapeEmailHtml_(order.buyerName) + ',</p><p>Tu compra de <b>' + escapeEmailHtml_(item) + '</b> fue procesada correctamente. Ya puedes consultar tu estado y código de acceso con el teléfono registrado.</p>' + (confirmationUrl ? '<p><a href="' + escapeEmailHtml_(confirmationUrl) + '">Confirmar mi pedido</a></p>' : '') + '<p>Congreso Un Joven con la 10</p>',
    name: 'Congreso Un Joven con la 10',
  });
}
function lookupOrdersByPhone_(ss, phone) {
  var digits = normalizePhone_(phone);
  if (digits.length < 7 || digits.length > 15) return { ok: false, error: 'Numero de telefono invalido.' };
  var sheet = paymentOrdersSheet_(ss);
  if (sheet.getLastRow() < 2) return { ok: true, orders: [] };
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, PAYMENT_HEADERS_.length).getValues();
  var phoneIndex = PAYMENT_HEADERS_.indexOf('phone');
  var byName = {};
  PAYMENT_HEADERS_.forEach(function(key, index) { byName[key] = index; });
  var orders = rows.filter(function(row) {
    return normalizePhone_(row[phoneIndex]) === digits;
  }).map(function(row) {
    var createdAt = row[byName.createdAt];
    return {
      orderSuffix: String(row[byName.reference] || '').slice(-6),
      createdAt: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt || ''),
      itemName: String(row[byName.itemName] || ''),
      size: String(row[byName.size] || ''),
      amountInCents: Number(row[byName.amountInCents] || 0),
      currency: String(row[byName.currency] || 'COP'),
      paymentStatus: String(row[byName.paymentStatus] || 'PENDING'),
      ticketDelivery: String(row[byName.ticketDelivery] || ''),
      merchPickup: String(row[byName.merchPickup] || ''),
    };
  });
  return { ok: true, orders: orders.reverse() };
}
function normalizePhone_(phone) {
  var digits = String(phone || '').replace(/\D/g, '');
  if (digits.indexOf('00') === 0) digits = digits.slice(2);
  // Accept both Colombian local numbers (313...) and international format (+57 313...).
  if (digits.length === 12 && digits.indexOf('57') === 0) digits = digits.slice(2);
  return digits;
}
function updatePaymentOrder_(ss, reference, update) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var order = getPaymentOrder_(ss, reference);
    if (!order) return { ok: false, error: 'Order not found' };
    var sheet = ss.getSheetByName('Pedidos');
    var row = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(String(reference)).matchEntireCell(true).findNext().getRow();
    var statusCol = PAYMENT_HEADERS_.indexOf('paymentStatus') + 1;
    var txCol = PAYMENT_HEADERS_.indexOf('transactionId') + 1;
    var methodCol = PAYMENT_HEADERS_.indexOf('paymentMethod') + 1;
    var codeCol = PAYMENT_HEADERS_.indexOf('pickupCode') + 1;
    if (update.paymentStatus) sheet.getRange(row, statusCol).setValue(update.paymentStatus);
    if (update.transactionId) sheet.getRange(row, txCol).setValue(update.transactionId);
    if (update.paymentMethod) sheet.getRange(row, methodCol).setValue(update.paymentMethod);
    if (update.pickupCode) sheet.getRange(row, codeCol).setValue(update.pickupCode);
    if (update.paymentStatus === 'APPROVED' && String(order.paymentStatus) !== 'APPROVED') {
      order.paymentStatus = 'APPROVED';
      if (update.pickupCode) order.pickupCode = update.pickupCode;
      sendOrderApprovedEmail_(order);
    }
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function updatePaymentBuyer_(ss, reference, buyer) {
  var name = String((buyer || {}).buyerName || '').trim().slice(0, 120);
  var email = String((buyer || {}).email || '').trim().toLowerCase().slice(0, 254);
  var phone = String((buyer || {}).phone || '').trim().slice(0, 30);
  if (!name || !email || !phone) return { ok: false, error: 'Nombre, correo y teléfono son obligatorios.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = paymentOrdersSheet_(ss);
    if (sheet.getLastRow() < 2) return { ok: false, error: 'No hay pedidos registrados.' };
    var referenceCol = PAYMENT_HEADERS_.indexOf('reference') + 1;
    var found = sheet.getRange(2, referenceCol, sheet.getLastRow() - 1, 1).createTextFinder(String(reference)).matchEntireCell(true).findNext();
    if (!found) return { ok: false, error: 'No encontramos ese pedido.' };
    sheet.getRange(found.getRow(), PAYMENT_HEADERS_.indexOf('buyerName') + 1, 1, 3).setValues([[name, email, phone]]);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function deletePaymentOrder_(ss, reference) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = paymentOrdersSheet_(ss);
    if (sheet.getLastRow() < 2) return { ok: false, error: 'No hay pedidos registrados.' };
    var referenceCol = PAYMENT_HEADERS_.indexOf('reference') + 1;
    var found = sheet.getRange(2, referenceCol, sheet.getLastRow() - 1, 1).createTextFinder(String(reference)).matchEntireCell(true).findNext();
    if (!found) return { ok: false, error: 'No encontramos ese pedido.' };
    sheet.deleteRow(found.getRow());
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function clearPaymentOrders_(ss) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = paymentOrdersSheet_(ss);
    var count = Math.max(sheet.getLastRow() - 1, 0);
    if (count) sheet.deleteRows(2, count);
    return { ok: true, deleted: count };
  } finally { lock.releaseLock(); }
}

function confirmManualNequiOrder_(ss, reference, pickupCode) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var order = getPaymentOrder_(ss, reference);
    if (!order) return { ok: true, confirmed: false, error: 'Pedido no encontrado.' };
    if (order.paymentMethod !== 'NEQUI_MANUAL') return { ok: true, confirmed: false, error: 'Este pedido no es un pago manual de Nequi.' };
    if (order.paymentStatus !== 'PENDING') return { ok: true, confirmed: false, error: 'El pedido ya fue procesado.' };
    if (!/^\d{4}$/.test(String(pickupCode || ''))) return { ok: false, error: 'Codigo de retiro invalido.' };
    var sheet = ss.getSheetByName('Pedidos');
    var found = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(String(reference)).matchEntireCell(true).findNext();
    if (!found) return { ok: true, confirmed: false, error: 'Pedido no encontrado.' };
    sheet.getRange(found.getRow(), PAYMENT_HEADERS_.indexOf('paymentStatus') + 1).setValue('APPROVED');
    sheet.getRange(found.getRow(), PAYMENT_HEADERS_.indexOf('pickupCode') + 1).setValue(String(pickupCode));
    order.pickupCode = String(pickupCode);
    order.paymentStatus = 'APPROVED';
    sendOrderApprovedEmail_(order);
    return { ok: true, confirmed: true };
  } finally { lock.releaseLock(); }
}

function validatePickupCode_(ss, reference, pickupCode) {
  var code = String(pickupCode || '').trim();
  if (!/^\d{4}$/.test(code)) return { ok: true, valid: false, error: 'Ingresa un codigo de cuatro digitos valido.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = paymentOrdersSheet_(ss);
    if (sheet.getLastRow() < 2) return { ok: true, valid: false, error: 'No hay pedidos registrados.' };
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, PAYMENT_HEADERS_.length).getValues();
    var columns = {};
    PAYMENT_HEADERS_.forEach(function(key, index) { columns[key] = index; });
    var matches = [];
    rows.forEach(function(row, index) {
      var referenceMatches = reference && String(row[columns.reference]) === String(reference);
      var codeMatches = !reference && String(row[columns.pickupCode] || '') === code && String(row[columns.paymentStatus]) === 'APPROVED';
      if (referenceMatches || codeMatches) matches.push({ row: row, rowNumber: index + 2 });
    });
    if (!matches.length) return { ok: true, valid: false, error: reference ? 'No encontramos un pedido con ese QR.' : 'No encontramos un pedido aprobado con ese codigo.' };
    if (matches.length > 1) return { ok: true, valid: false, ambiguous: true, error: 'Hay mas de un pedido con ese codigo. Escanea el QR completo para identificarlo.' };
    var match = matches[0];
    var row = match.row;
    if (String(row[columns.pickupCode] || '') !== code) return { ok: true, valid: false, error: 'El codigo no corresponde a este pedido.' };
    if (String(row[columns.paymentStatus]) !== 'APPROVED') return { ok: true, valid: false, error: 'El pago de este pedido aun no esta confirmado.' };
    var deliveryKey = String(row[columns.itemId]) === 'ticket' ? 'ticketDelivery' : 'merchPickup';
    var deliveryColumn = columns[deliveryKey] + 1;
    var currentDelivery = String(row[columns[deliveryKey]] || 'Pendiente');
    var order = {
      reference: String(row[columns.reference] || ''),
      buyerName: String(row[columns.buyerName] || ''),
      itemName: String(row[columns.itemName] || ''),
      size: String(row[columns.size] || ''),
      amountInCents: Number(row[columns.amountInCents] || 0),
      paymentStatus: String(row[columns.paymentStatus] || ''),
      deliveryStatus: currentDelivery,
    };
    if (currentDelivery === 'Validado' || currentDelivery === 'Entregado') {
      return { ok: true, valid: true, alreadyUsed: true, order: order };
    }
    sheet.getRange(match.rowNumber, deliveryColumn).setValue('Validado');
    order.deliveryStatus = 'Validado';
    return { ok: true, valid: true, alreadyUsed: false, order: order };
  } finally { lock.releaseLock(); }
}

function output(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function authorizeDriveAccess() {
  DriveApp.getRootFolder().getName();
}

function authorizeEmailSending() {
  MailApp.getRemainingDailyQuota();
}
