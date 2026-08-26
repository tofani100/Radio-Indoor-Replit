import { Storage } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function getPrivateDir(): string {
  const dir = process.env["PRIVATE_OBJECT_DIR"];
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR env var not set");
  return dir;
}

function parsePath(p: string): { bucketName: string; objectName: string } {
  const trimmed = p.startsWith("/") ? p.slice(1) : p;
  const slash = trimmed.indexOf("/");
  if (slash === -1) throw new Error(`Invalid object path: ${p}`);
  return { bucketName: trimmed.slice(0, slash), objectName: trimmed.slice(slash + 1) };
}

function mediaObjectPath(filename: string): string {
  return `${getPrivateDir()}/uploads/${filename}`;
}

export function getMediaFile(filename: string) {
  const { bucketName, objectName } = parsePath(mediaObjectPath(filename));
  return objectStorageClient.bucket(bucketName).file(objectName);
}

export async function uploadMediaBuffer(
  filename: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const file = getMediaFile(filename);
  await file.save(buffer, {
    contentType,
    resumable: false,
    metadata: { cacheControl: "private, max-age=3600" },
  });
}

export async function deleteMediaFile(filename: string): Promise<void> {
  try {
    await getMediaFile(filename).delete();
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e.code !== 404) throw err;
  }
}

export async function mediaFileExists(filename: string): Promise<boolean> {
  try {
    const [exists] = await getMediaFile(filename).exists();
    return exists;
  } catch {
    return false;
  }
}
