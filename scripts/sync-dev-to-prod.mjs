import { writeFileSync, existsSync, mkdirSync } from "fs";

const PROJECT_ID = "radio-indoor-replit";
const DEV_DB_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/radio-indoor-dev/documents`;
const PROD_DB_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const COLLECTIONS_TO_SYNC = ["admins", "clients", "playlists", "playlistItems", "media"];

async function fetchAllDocuments(collectionName) {
  let docs = [];
  let pageToken = undefined;

  do {
    const url = `${DEV_DB_BASE}/${collectionName}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Falha ao ler coleção DEV [${collectionName}]: ${res.status} - ${errText}`);
    }
    const data = await res.json();
    if (data.documents) {
      docs.push(...data.documents);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return docs;
}

async function writeDocumentToProdWithRetry(collectionName, docId, fields, maxRetries = 4) {
  const url = `${PROD_DB_BASE}/${collectionName}/${encodeURIComponent(docId)}`;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Status ${res.status}: ${errText}`);
      }
      return;
    } catch (err) {
      if (attempt === maxRetries) {
        throw new Error(`Falha ao gravar em PROD [${collectionName}/${docId}] após ${maxRetries} tentativas: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
}

async function runPool(items, limit, workerFn) {
  const executing = [];
  for (const item of items) {
    const p = Promise.resolve().then(() => workerFn(item));
    executing.push(p);
    if (limit <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(executing);
}

async function sync() {
  console.log("====================================================");
  console.log("   INICIANDO SINCRONIZAÇÃO DEV -> PRODUÇÃO");
  console.log(`   Projeto: ${PROJECT_ID}`);
  console.log(`   Origem: radio-indoor-dev`);
  console.log(`   Destino: (default) [PRODUÇÃO]`);
  console.log("====================================================");

  const backupDir = "./scripts/backup_dev_sync";
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  for (const col of COLLECTIONS_TO_SYNC) {
    console.log(`\n📦 Lendo [${col}] de radio-indoor-dev...`);
    const docs = await fetchAllDocuments(col);
    console.log(` -> ${docs.length} documentos encontrados em DEV.`);

    writeFileSync(`${backupDir}/${col}_dev_backup.json`, JSON.stringify(docs, null, 2), "utf-8");

    console.log(` 🚀 Gravando [${col}] na base de PRODUÇÃO...`);
    let count = 0;
    await runPool(docs, 6, async (doc) => {
      const parts = doc.name.split("/");
      const docId = parts[parts.length - 1];
      await writeDocumentToProdWithRetry(col, docId, doc.fields);
      count++;
      if (count % 50 === 0 || count === docs.length) {
        process.stdout.write(`    [${col}] ${count}/${docs.length} sincronizados...\r`);
      }
    });
    console.log(`\n ✅ Coleção [${col}] sincronizada com sucesso (${count}/${docs.length})!`);
  }

  console.log("\n====================================================");
  console.log("   SINCRONIZAÇÃO CONCLUÍDA COM SUCESSO!");
  console.log("====================================================");
}

sync().catch((err) => {
  console.error("❌ ERRO DURANTE A SINCRONIZAÇÃO:", err);
  process.exit(1);
});
