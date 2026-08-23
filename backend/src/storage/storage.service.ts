import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { AppException } from '../common/exceptions/app.exception';

/**
 * Abstraction de stockage objet compatible S3 (AWS S3, Cloudflare R2,
 * Supabase Storage - section 32/68). Le fichier ne transite jamais par le
 * backend : le frontend obtient une URL signee et televerse directement.
 * Le backend ne stocke que les metadonnees (voir Attachment en base).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly publicUrl?: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('storage.endpoint');
    const accessKeyId = this.config.get<string>('storage.accessKeyId');
    const secretAccessKey = this.config.get<string>('storage.secretAccessKey');
    this.bucket = this.config.get<string>('storage.bucket')!;
    this.publicUrl = this.config.get<string>('storage.publicUrl') || undefined;

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

  private assertConfigured(): S3Client {
    if (!this.client) {
      throw AppException.badRequest('STORAGE_NOT_CONFIGURED', "Le stockage de fichiers n'est pas configure sur ce serveur.");
    }
    return this.client;
  }

  /** Genere une URL PUT signee valable 5 minutes pour un televersement direct. */
  async createPresignedUploadUrl(originalFileName: string, mimeType: string, kind: string) {
    const client = this.assertConfigured();
    const extension = originalFileName.includes('.') ? originalFileName.split('.').pop() : undefined;
    const key = `${kind}/${new Date().getFullYear()}/${randomUUID()}${extension ? `.${extension}` : ''}`;

    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
    const fileUrl = this.publicUrl ? `${this.publicUrl}/${key}` : `s3://${this.bucket}/${key}`;

    return { uploadUrl, fileUrl, key };
  }

  async deleteByUrl(fileUrl: string) {
    if (!this.client || !this.publicUrl || !fileUrl.startsWith(this.publicUrl)) return;
    const key = fileUrl.slice(this.publicUrl.length + 1);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      this.logger.warn(`Echec de suppression du fichier ${key} sur le stockage objet.`);
    }
  }
}
