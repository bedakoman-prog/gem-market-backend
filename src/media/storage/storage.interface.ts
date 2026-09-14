// Abstraction volontairement minimale — le cahier des charges (section 2)
// impose que "les photos/vidéos des annonces ne doivent pas être stockées sur
// le serveur d'application lui-même". En développement, LocalDiskStorageService
// simule ce comportement en servant les fichiers via Express (voir main.ts) ;
// en production, S3StorageService écrit vers un vrai bucket compatible S3
// (AWS S3, Backblaze B2, OVH Object Storage — au choix, via STORAGE_S3_ENDPOINT).
export interface UploadResult {
  url: string;
  storageKey: string;
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface StorageService {
  upload(params: { buffer: Buffer; key: string; contentType: string }): Promise<UploadResult>;
  remove(storageKey: string): Promise<void>;
}
