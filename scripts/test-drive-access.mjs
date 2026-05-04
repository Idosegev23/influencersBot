#!/usr/bin/env node
/**
 * Verify the service account can write to GOOGLE_DRIVE_LEADS_FOLDER_ID.
 * Usage: node --env-file=.env.local scripts/test-drive-access.mjs
 */
import { google } from 'googleapis';

const folderId = (process.env.GOOGLE_DRIVE_LEADS_FOLDER_ID || '').trim();
const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

console.log('=== Drive Access Test ===');
console.log('Folder ID:', folderId);
if (!folderId || !raw) {
  console.error('Missing env vars');
  process.exit(1);
}

const credentials = JSON.parse(raw.trim());
console.log('Service account:', credentials.client_email);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

// Step 1: read folder metadata
console.log('\nReading folder metadata...');
try {
  const meta = await drive.files.get({
    fileId: folderId,
    fields: 'id, name, mimeType, owners',
    supportsAllDrives: true,
  });
  console.log('✓ Folder visible:', meta.data.name);
  console.log('  mimeType:', meta.data.mimeType);
} catch (err) {
  console.error('❌ Cannot read folder:', err.message);
  process.exit(1);
}

// Step 2: try creating a test doc
console.log('\nCreating test doc...');
try {
  const { Readable } = await import('stream');
  const stream = new Readable();
  stream.push('<html><body><h1>Drive access test — OK</h1></body></html>');
  stream.push(null);

  const res = await drive.files.create({
    requestBody: {
      name: `[בדיקה] Drive access test ${new Date().toLocaleTimeString('he-IL')}`,
      parents: [folderId],
      mimeType: 'application/vnd.google-apps.document',
    },
    media: { mimeType: 'text/html', body: stream },
    supportsAllDrives: true,
    fields: 'id, webViewLink',
  });
  console.log('✓ Test doc created!');
  console.log('  id:', res.data.id);
  console.log('  link:', res.data.webViewLink);
} catch (err) {
  console.error('❌ Cannot write to folder:', err.message);
  process.exit(1);
}
