//backend/src/storage/storage.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { AppException } from '../common/exceptions/app.exception';

/** Types de fichiers acceptes -> extension de l'objet (l'extension ne vient JAMAIS du nom fourni par le client). */
export const ALLOWED_UPLOAD_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

const canonicalMime = (mime: string) => (mime === 'image/jpg' ? 'image/jpeg' : mime);

/** Duree de validite de l'URL de televersement (secondes). */
const UPLOAD_URL_TTL_SECONDS = 300;

/**
 * Abstraction de stockage objet compatible S3 (AWS S3, Cloudflare R2,
 * Supabase Storage - section 32/68). Le fichier ne transite jamais par le
 * backend : le frontend obtient une URL signee et televerse directement.
 * Le backend ne stocke que les metadonnees (voir Attachment en base).
 *
 * Mode PRIVE (STORAGE_PRIVATE=true) : le bucket n'est pas public ; chaque
 * lecture de piece jointe renvoie une URL signee de courte duree. Les
 * justificatifs (factures, pieces d'identite...) ne sont ainsi plus lisibles
 * par quiconque connait/devine une URL.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly publicUrl?: string;
  private readonly privateBucket: boolean;
  private readonly signedUrlTtl: number;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('storage.endpoint');
    const accessKeyId = this.config.get<string>('storage.accessKeyId');
    const secretAccessKey = this.config.get<string>('storage.secretAccessKey');
    this.bucket = this.config.get<string>('storage.bucket')!;
    this.publicUrl = (this.config.get<string>('storage.publicUrl') || '').replace(/\/+$/, '') || undefined;
    this.privateBucket = !!this.config.get<boolean>('storage.privateBucket');
    this.signedUrlTtl = this.config.get<number>('storage.signedUrlTtlSeconds') || 900;

    if (endpoint && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        region: this.config.get<string>('storage.region') || 'auto',
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
      });
    } else {
      this.client = null;
      this.logger.warn('Stockage objet non configure (STORAGE_ENDPOINT manquant) - les uploads seront refuses.');
    }
  }

  isPrivate(): boolean {
    return this.privateBucket;
  }

  private assertConfigured(): S3Client {
    if (!this.client) {
      throw AppException.badRequest('STORAGE_NOT_CONFIGURED', "Le stockage de fichiers n'est pas configure sur ce serveur.");
    }
    return this.client;
  }

  /**
   * Cle d'objet : `<scope>/<kind>/<annee>/<uuid>.<ext>`.
   *  - `scope` = client proprietaire (ou "admin") : un fichier televerse par un
   *    client ne peut pas etre rattache par un autre ;
   *  - l'extension est deduite du type MIME valide, pas du nom de fichier.
   */
  buildKey(scope: string, kind: string, mimeType: string): string {
    const extension = ALLOWED_UPLOAD_TYPES[mimeType];
    if (!extension) throw AppException.badRequest('UNSUPPORTED_FILE_TYPE', 'Formats acceptes : JPG, JPEG, PNG, PDF.');
    return `${scope}/${kind}/${new Date().getFullYear()}/${randomUUID()}.${extension}`;
  }

  /** Genere une URL PUT signee valable 5 minutes pour un televersement direct. */
  async createPresignedUploadUrl(scope: string, mimeType: string, kind: string) {
    const client = this.assertConfigured();
    const key = this.buildKey(scope, kind, mimeType);

    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: canonicalMime(mimeType) });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });

    return { uploadUrl, fileUrl: this.fileUrlForKey(key), key };
  }

  /** URL enregistree en base pour une cle : jamais d'URL publique en mode prive. */
  fileUrlForKey(key: string): string {
    if (!this.privateBucket && this.publicUrl) return `${this.publicUrl}/${key}`;
    return `s3://${this.bucket}/${key}`;
  }

  /**
   * Retrouve la cle d'objet depuis une URL enregistree (`s3://bucket/cle` ou
   * `<STORAGE_PUBLIC_URL>/cle`). Renvoie null si l'URL n'appartient pas a CE
   * stockage (URL externe, autre bucket...) ou est suspecte.
   */
  keyFromFileUrl(fileUrl: string): string | null {
    let key: string | null = null;
    const s3Prefix = `s3://${this.bucket}/`;
    if (fileUrl.startsWith(s3Prefix)) key = fileUrl.slice(s3Prefix.length);
    else if (this.publicUrl && fileUrl.startsWith(`${this.publicUrl}/`)) key = fileUrl.slice(this.publicUrl.length + 1);
    if (!key || key.startsWith('/') || key.includes('..') || key.includes('?') || key.includes('#')) return null;
    return key;
  }

  /**
   * Verifie, APRES le televersement, que l'objet existe vraiment et respecte la
   * taille/le type annonces. La taille et le type fournis par le client ne sont
   * qu'une declaration : on enregistre la taille reelle.
   */
  async verifyUploadedObject(key: string, declaredMimeType: string, maxBytes: number): Promise<{ sizeBytes: number }> {
    const client = this.assertConfigured();
    let head;
    try {
      head = await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch {
      throw AppException.badRequest('UPLOAD_NOT_FOUND', "Le fichier n'a pas ete televerse ou n'est plus disponible.");
    }

    const sizeBytes = Number(head.ContentLength ?? 0);
    if (sizeBytes <= 0) {
      await this.deleteKey(key);
      throw AppException.badRequest('EMPTY_FILE', 'Le fichier televerse est vide.');
    }
    if (sizeBytes > maxBytes) {
      await this.deleteKey(key);
      throw AppException.badRequest('FILE_TOO_LARGE', 'Le fichier depasse la taille maximale autorisee.');
    }
    if (head.ContentType && canonicalMime(head.ContentType) !== canonicalMime(declaredMimeType)) {
      await this.deleteKey(key);
      throw AppException.badRequest('UNSUPPORTED_FILE_TYPE', 'Le type du fichier televerse ne correspond pas a celui annonce.');
    }
    return { sizeBytes };
  }

  /** URL de lecture : signee et temporaire en mode prive, inchangee sinon. */
  async resolveReadUrl(fileUrl: string): Promise<string> {
    if (!this.privateBucket || !this.client) return fileUrl;
    const key = this.keyFromFileUrl(fileUrl);
    if (!key) return fileUrl;
    try {
      return await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
        expiresIn: this.signedUrlTtl,
      });
    } catch (err) {
      this.logger.error(`Impossible de signer l'URL de lecture (${key})`, err instanceof Error ? err.stack : String(err));
      return fileUrl;
    }
  }

  async deleteByUrl(fileUrl: string) {
    const key = this.keyFromFileUrl(fileUrl);
    if (!key) return;
    await this.deleteKey(key);
  }

  private async deleteKey(key: string) {
    if (!this.client) return;
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch {
      this.logger.warn(`Echec de suppression du fichier ${key} sur le stockage objet.`);
    }
  }
}
